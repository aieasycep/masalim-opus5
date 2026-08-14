import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createStorySchema,
  listStoriesSchema,
  updateStoryProgressSchema,
  updateStorySchema,
  type CreateStoryInput,
  type ListStoriesInput,
  type UpdateStoryInput,
  type UpdateStoryProgressInput,
} from '@masalim/validation';
import type { AIJobDto, Paginated, StoryDto, StorySummaryDto } from '@masalim/types';
import { CurrentUserId } from '../../core/auth/auth.decorators';
import { Idempotent } from '../../core/idempotency/idempotency.interceptor';
import { zodBody, zodQuery } from '../../core/http/zod-validation.pipe';
import { StoriesService } from './stories.service';

@ApiTags('stories')
@Controller('stories')
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  /**
   * Queues a story.
   *
   * Returns the story *and* its job so the app can navigate straight to the
   * generating screen without a second round trip — the brief's flow shows
   * progress immediately after the parent taps "Masalımı Oluştur".
   */
  @Post()
  @Idempotent()
  @ApiOperation({ summary: 'Create a story and queue its generation' })
  async create(
    @CurrentUserId() userId: string,
    @Body(zodBody(createStorySchema)) body: CreateStoryInput,
  ): Promise<{ story: StoryDto; job: AIJobDto }> {
    return this.stories.create(userId, body);
  }

  @Get()
  @ApiOperation({ summary: 'Library listing with filters, search and cursor pagination' })
  async list(
    @CurrentUserId() userId: string,
    @Query(zodQuery(listStoriesSchema)) query: ListStoriesInput,
  ): Promise<Paginated<StorySummaryDto>> {
    return this.stories.list(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A story with its pages, narrations and illustrations' })
  async findOne(
    @CurrentUserId() userId: string,
    @Param('id') storyId: string,
  ): Promise<StoryDto> {
    return this.stories.findOne(userId, storyId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit the story title or page text' })
  async update(
    @CurrentUserId() userId: string,
    @Param('id') storyId: string,
    @Body(zodBody(updateStorySchema)) body: UpdateStoryInput,
  ): Promise<StoryDto> {
    return this.stories.update(userId, storyId, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a story' })
  async remove(
    @CurrentUserId() userId: string,
    @Param('id') storyId: string,
  ): Promise<void> {
    await this.stories.remove(userId, storyId);
  }

  @Put(':id/favourite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a story as a favourite' })
  async addFavourite(
    @CurrentUserId() userId: string,
    @Param('id') storyId: string,
  ): Promise<void> {
    await this.stories.setFavourite(userId, storyId, true);
  }

  @Delete(':id/favourite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a story from favourites' })
  async removeFavourite(
    @CurrentUserId() userId: string,
    @Param('id') storyId: string,
  ): Promise<void> {
    await this.stories.setFavourite(userId, storyId, false);
  }

  /**
   * Playback position, so Home can offer "Kaldığın yerden devam et".
   *
   * `PUT` because the player sends it repeatedly while listening: the last write
   * wins and a lost packet costs nothing.
   */
  @Put(':id/progress')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Record where the listener left off' })
  async updateProgress(
    @CurrentUserId() userId: string,
    @Param('id') storyId: string,
    @Body(zodBody(updateStoryProgressSchema)) body: UpdateStoryProgressInput,
  ): Promise<void> {
    await this.stories.updateProgress(userId, storyId, body);
  }
}
