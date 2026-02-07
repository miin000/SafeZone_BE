import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post, PostStatus } from './entities/post.entity';
import { PostReaction, ReactionType } from './entities/post-reaction.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostDto } from './dto/query-post.dto';

@Injectable()
export class PostService {
  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(PostReaction)
    private reactionRepository: Repository<PostReaction>,
  ) {}

  async create(userId: string, createPostDto: CreatePostDto): Promise<Post> {
    const post = this.postRepository.create({
      ...createPostDto,
      userId,
      status: PostStatus.PENDING,
    });
    return this.postRepository.save(post);
  }

  async findAll(queryDto: QueryPostDto) {
    const page = parseInt(queryDto.page || '1', 10);
    const limit = parseInt(queryDto.limit || '20', 10);
    const skip = (page - 1) * limit;

    const queryBuilder = this.postRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .orderBy('post.createdAt', 'DESC');

    // If showAll is true (for admin), don't filter by status unless specified
    if (queryDto.showAll) {
      // Admin can see all posts, optionally filter by status
      if (queryDto.status) {
        queryBuilder.andWhere('post.status = :status', { status: queryDto.status });
      }
    } else {
      // Default: only show approved posts for public
      if (queryDto.status) {
        queryBuilder.andWhere('post.status = :status', { status: queryDto.status });
      } else {
        queryBuilder.andWhere('post.status = :status', { status: PostStatus.APPROVED });
      }
    }

    if (queryDto.diseaseType) {
      queryBuilder.andWhere('post.diseaseType = :diseaseType', {
        diseaseType: queryDto.diseaseType,
      });
    }

    if (queryDto.userId) {
      queryBuilder.andWhere('post.userId = :userId', { userId: queryDto.userId });
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
      order: { createdAt: 'DESC' },
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
    return this.postRepository.save(post);
  }

  async remove(id: string, userId: string, isAdmin: boolean = false): Promise<void> {
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
  ): Promise<{ helpfulCount: number; notHelpfulCount: number; userReaction: ReactionType | null }> {
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

  async getUserReaction(postId: string, userId: string): Promise<ReactionType | null> {
    const reaction = await this.reactionRepository.findOne({
      where: { postId, userId },
    });
    return reaction?.type || null;
  }

  async getStats() {
    const total = await this.postRepository.count();
    const pending = await this.postRepository.count({ where: { status: PostStatus.PENDING } });
    const approved = await this.postRepository.count({ where: { status: PostStatus.APPROVED } });
    const rejected = await this.postRepository.count({ where: { status: PostStatus.REJECTED } });

    return {
      total,
      pending,
      approved,
      rejected,
    };
  }
}
