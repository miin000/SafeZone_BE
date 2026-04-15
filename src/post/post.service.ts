import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Post, PostStatus } from './entities/post.entity';
import { PostReaction, ReactionType } from './entities/post-reaction.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostDto } from './dto/query-post.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/entities/notification.entity';

@Injectable()
export class PostService implements OnModuleInit {
  private readonly logger = new Logger(PostService.name);

  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(PostReaction)
    private reactionRepository: Repository<PostReaction>,
    private notificationService: NotificationService,
    private dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    // Ensure FK-based disease reference on posts table (backward compatible with diseaseType text)
    await this.dataSource.query(
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS "diseaseId" uuid;`,
    );
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS idx_posts_disease_id ON posts("diseaseId");`,
    );

    // Best-effort backfill from legacy diseaseType text (exact name match, case-insensitive)
    await this.dataSource.query(
      `
      UPDATE posts p
      SET "diseaseId" = d.id
      FROM diseases d
      WHERE p."diseaseId" IS NULL
        AND p."diseaseType" IS NOT NULL
        AND LOWER(TRIM(p."diseaseType")) = LOWER(TRIM(d.name))
      `,
    );

    await this.dataSource.query(`
      DO $$
      BEGIN
        IF to_regclass('public.diseases') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_posts_disease_id'
          )
        THEN
          ALTER TABLE posts
            ADD CONSTRAINT fk_posts_disease_id
            FOREIGN KEY ("diseaseId")
            REFERENCES diseases(id)
            ON DELETE SET NULL;
        END IF;
      END$$;
    `);
  }

  async create(userId: string, createPostDto: CreatePostDto): Promise<Post> {
    this.logger.log(
      `Create post request userId=${userId} contentLength=${createPostDto.content?.length ?? 0} imageCount=${createPostDto.imageUrls?.length ?? 0} diseaseType=${createPostDto.diseaseType ?? 'n/a'}`,
    );

    let resolvedDiseaseType = createPostDto.diseaseType;
    if (createPostDto.diseaseId && !resolvedDiseaseType) {
      const rows = await this.dataSource.query(
        `SELECT name FROM diseases WHERE id = $1 LIMIT 1`,
        [createPostDto.diseaseId],
      );
      resolvedDiseaseType = rows?.[0]?.name ?? undefined;
    }

    const post = this.postRepository.create({
      ...createPostDto,
      diseaseType: resolvedDiseaseType,
      userId,
      status: PostStatus.PENDING,
    });
    const saved = await this.postRepository.save(post);

    this.logger.log(
      `Create post success postId=${saved.id} userId=${userId} status=${saved.status}`,
    );

    return saved;
  }

  async findAll(queryDto: QueryPostDto) {
    const page = parseInt(queryDto.page || '1', 10);
    const limit = parseInt(queryDto.limit || '20', 10);
    const skip = (page - 1) * limit;

    const queryBuilder = this.postRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .distinct(true)
      .orderBy('post.createdAt', 'DESC');

    // If showAll is true (for admin), don't filter by status unless specified
    if (queryDto.showAll) {
      // Admin can see all posts, optionally filter by status
      if (queryDto.status) {
        queryBuilder.andWhere('post.status = :status', {
          status: queryDto.status,
        });
      }
    } else {
      // Default: only show approved posts for public
      if (queryDto.status) {
        queryBuilder.andWhere('post.status = :status', {
          status: queryDto.status,
        });
      } else {
        queryBuilder.andWhere('post.status = :status', {
          status: PostStatus.APPROVED,
        });
      }
    }

    if (queryDto.diseaseId) {
      queryBuilder.andWhere('post.diseaseId = :diseaseId', {
        diseaseId: queryDto.diseaseId,
      });
    } else if (queryDto.diseaseType) {
      queryBuilder.andWhere('post.diseaseType = :diseaseType', {
        diseaseType: queryDto.diseaseType,
      });
    }

    if (queryDto.userId) {
      queryBuilder.andWhere('post.userId = :userId', {
        userId: queryDto.userId,
      });
    }

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    // Remove password from user
    data.forEach((post) => {
      if (post.user) {
        delete post.user.password;
      }
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByUser(userId: string) {
    const posts = await this.postRepository.find({
      where: { userId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    posts.forEach((post) => {
      if (post.user) {
        delete post.user.password;
      }
    });

    return posts;
  }

  async findOne(id: string): Promise<Post> {
    const post = await this.postRepository.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!post) {
      throw new NotFoundException('Bài đăng không tồn tại');
    }
    if (post.user) {
      delete post.user.password;
    }
    return post;
  }

  async update(
    id: string,
    userId: string,
    updatePostDto: UpdatePostDto,
    isAdmin: boolean = false,
  ): Promise<Post> {
    const post = await this.findOne(id);

    if (!isAdmin && post.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền sửa bài đăng này');
    }

    // If user edits, reset to pending for re-approval
    if (!isAdmin && post.status === PostStatus.APPROVED) {
      post.status = PostStatus.PENDING;
    }

    if (updatePostDto.diseaseId && !updatePostDto.diseaseType) {
      const rows = await this.dataSource.query(
        `SELECT name FROM diseases WHERE id = $1 LIMIT 1`,
        [updatePostDto.diseaseId],
      );
      updatePostDto.diseaseType = rows?.[0]?.name ?? updatePostDto.diseaseType;
    }

    Object.assign(post, updatePostDto);
    return this.postRepository.save(post);
  }

  async updateStatus(
    id: string,
    status: PostStatus,
    adminNote?: string,
  ): Promise<Post> {
    const post = await this.findOne(id);
    post.status = status;
    if (adminNote) {
      post.adminNote = adminNote;
    }
    const updated = await this.postRepository.save(post);

    // Notify post owner when moderation status changes.
    if (status === PostStatus.APPROVED || status === PostStatus.REJECTED) {
      const title =
        status === PostStatus.APPROVED
          ? 'Bài viết đã được duyệt'
          : 'Bài viết đã bị từ chối';

      const body =
        status === PostStatus.APPROVED
          ? 'Bài viết của bạn đã được phê duyệt và hiển thị công khai.'
          : `Bài viết của bạn đã bị từ chối.${adminNote ? ` Lý do: ${adminNote}` : ''}`;

      await this.notificationService.sendToUser(
        post.userId,
        title,
        body,
        NotificationType.REPORT_UPDATE,
        {
          postId: post.id,
          status,
        },
      );
    }

    return updated;
  }

  async remove(
    id: string,
    userId: string,
    isAdmin: boolean = false,
  ): Promise<void> {
    const post = await this.findOne(id);

    if (!isAdmin && post.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xóa bài đăng này');
    }

    await this.postRepository.remove(post);
  }

  async react(
    postId: string,
    userId: string,
    type: ReactionType,
  ): Promise<{
    helpfulCount: number;
    notHelpfulCount: number;
    userReaction: ReactionType | null;
  }> {
    const post = await this.findOne(postId);

    // Check existing reaction
    const existingReaction = await this.reactionRepository.findOne({
      where: { postId, userId },
    });

    if (existingReaction) {
      if (existingReaction.type === type) {
        // Remove reaction (toggle off)
        await this.reactionRepository.remove(existingReaction);

        // Update count
        if (type === ReactionType.HELPFUL) {
          post.helpfulCount = Math.max(0, post.helpfulCount - 1);
        } else {
          post.notHelpfulCount = Math.max(0, post.notHelpfulCount - 1);
        }
        await this.postRepository.save(post);

        return {
          helpfulCount: post.helpfulCount,
          notHelpfulCount: post.notHelpfulCount,
          userReaction: null,
        };
      } else {
        // Change reaction type
        const oldType = existingReaction.type;
        existingReaction.type = type;
        await this.reactionRepository.save(existingReaction);

        // Update counts
        if (oldType === ReactionType.HELPFUL) {
          post.helpfulCount = Math.max(0, post.helpfulCount - 1);
          post.notHelpfulCount += 1;
        } else {
          post.notHelpfulCount = Math.max(0, post.notHelpfulCount - 1);
          post.helpfulCount += 1;
        }
        await this.postRepository.save(post);

        return {
          helpfulCount: post.helpfulCount,
          notHelpfulCount: post.notHelpfulCount,
          userReaction: type,
        };
      }
    } else {
      // Create new reaction
      const reaction = this.reactionRepository.create({
        postId,
        userId,
        type,
      });
      await this.reactionRepository.save(reaction);

      // Update count
      if (type === ReactionType.HELPFUL) {
        post.helpfulCount += 1;
      } else {
        post.notHelpfulCount += 1;
      }
      await this.postRepository.save(post);

      return {
        helpfulCount: post.helpfulCount,
        notHelpfulCount: post.notHelpfulCount,
        userReaction: type,
      };
    }
  }

  async getUserReaction(
    postId: string,
    userId: string,
  ): Promise<ReactionType | null> {
    const reaction = await this.reactionRepository.findOne({
      where: { postId, userId },
    });
    return reaction?.type || null;
  }

  async getStats() {
    const total = await this.postRepository.count();
    const pending = await this.postRepository.count({
      where: { status: PostStatus.PENDING },
    });
    const approved = await this.postRepository.count({
      where: { status: PostStatus.APPROVED },
    });
    const rejected = await this.postRepository.count({
      where: { status: PostStatus.REJECTED },
    });

    return {
      total,
      pending,
      approved,
      rejected,
    };
  }
}
