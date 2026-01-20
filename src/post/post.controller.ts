import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PostService } from './post.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostDto } from './dto/query-post.dto';
import { ReactPostDto } from './dto/react-post.dto';
import { UpdatePostStatusDto } from './dto/update-status.dto';

@Controller('posts')
export class PostController {
  constructor(private readonly postService: PostService) {}

  // Create a new post (requires auth)
  @UseGuards(AuthGuard('jwt'))
  @Post()
  async create(@Request() req, @Body() createPostDto: CreatePostDto) {
    return this.postService.create(req.user.id, createPostDto);
  }

  // Get all posts (public - only approved posts)
  @Get()
  async findAll(@Query() queryDto: QueryPostDto) {
    return this.postService.findAll(queryDto);
  }

  // Get my posts (requires auth)
  @UseGuards(AuthGuard('jwt'))
  @Get('my-posts')
  async findMyPosts(@Request() req) {
    return this.postService.findByUser(req.user.id);
  }

  // Get post statistics (for admin dashboard)
  @Get('stats')
  async getStats() {
    return this.postService.getStats();
  }

  // Get single post by ID
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.postService.findOne(id);
  }

  // Get user's reaction on a post
  @UseGuards(AuthGuard('jwt'))
  @Get(':id/my-reaction')
  async getMyReaction(@Request() req, @Param('id') id: string) {
    const reaction = await this.postService.getUserReaction(id, req.user.id);
    return { reaction };
  }

  // Update a post (requires auth, owner only)
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updatePostDto: UpdatePostDto,
  ) {
    const isAdmin = req.user.role === 'admin';
    return this.postService.update(id, req.user.id, updatePostDto, isAdmin);
  }

  // Update post status (admin only)
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/status')
  async updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() updateStatusDto: UpdatePostStatusDto,
  ) {
    // TODO: Add admin guard
    return this.postService.updateStatus(
      id,
      updateStatusDto.status,
      updateStatusDto.adminNote,
    );
  }

  // React to a post (helpful/not helpful)
  @UseGuards(AuthGuard('jwt'))
  @Post(':id/react')
  async react(
    @Request() req,
    @Param('id') id: string,
    @Body() reactPostDto: ReactPostDto,
  ) {
    return this.postService.react(id, req.user.id, reactPostDto.type);
  }

  // Delete a post (requires auth, owner or admin)
  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    const isAdmin = req.user.role === 'admin';
    await this.postService.remove(id, req.user.id, isAdmin);
    return { success: true };
  }
}
