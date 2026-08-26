import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createIllustrationSetSchema,
  regenerateIllustrationSchema,
  type CreateIllustrationSetInput,
  type RegenerateIllustrationInput,
} from '@masalim/validation';
import type { AIJobDto, IllustrationDto, IllustrationSetDto } from '@masalim/types';
import { CurrentUserId } from '../../core/auth/auth.decorators';
import { Idempotent } from '../../core/idempotency/idempotency.interceptor';
import { zodBody } from '../../core/http/zod-validation.pipe';
import { IllustrationsService } from './illustrations.service';

@ApiTags('illustrations')
@Controller()
export class IllustrationsController {
  constructor(private readonly illustrations: IllustrationsService) {}

  @Post('stories/:storyId/illustrations')
  @Idempotent()
  @ApiOperation({ summary: 'Illustrate a story in a chosen style' })
  async create(
    @CurrentUserId() userId: string,
    @Param('storyId') storyId: string,
    @Body(zodBody(createIllustrationSetSchema)) body: CreateIllustrationSetInput,
  ): Promise<{ set: IllustrationSetDto; job: AIJobDto }> {
    return this.illustrations.create(userId, storyId, body);
  }

  @Get('stories/:storyId/illustrations')
  @ApiOperation({ summary: 'Illustration sets for a story' })
  async listForStory(
    @CurrentUserId() userId: string,
    @Param('storyId') storyId: string,
  ): Promise<IllustrationSetDto[]> {
    return this.illustrations.listForStory(userId, storyId);
  }

  @Get('illustration-sets/:id')
  @ApiOperation({ summary: 'One illustration set with per-image progress' })
  async findOne(
    @CurrentUserId() userId: string,
    @Param('id') illustrationSetId: string,
  ): Promise<IllustrationSetDto> {
    return this.illustrations.findOne(userId, illustrationSetId);
  }

  @Post('illustrations/regenerate')
  @Idempotent()
  @ApiOperation({ summary: 'Produce an alternative take on one image' })
  async regenerate(
    @CurrentUserId() userId: string,
    @Body(zodBody(regenerateIllustrationSchema)) body: RegenerateIllustrationInput,
  ): Promise<{ illustration: IllustrationDto; job: AIJobDto }> {
    return this.illustrations.regenerate(userId, body.illustrationId, body.idempotencyKey);
  }

  @Post('illustrations/:id/select')
  @ApiOperation({ summary: 'Choose which variant the book uses' })
  async select(
    @CurrentUserId() userId: string,
    @Param('id') illustrationId: string,
  ): Promise<IllustrationSetDto> {
    return this.illustrations.select(userId, illustrationId);
  }
}
