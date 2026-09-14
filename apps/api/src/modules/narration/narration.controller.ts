import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createNarrationSchema, type CreateNarrationInput } from '@masalim/validation';
import type { AIJobDto, NarrationDto, NarrationSegment } from '@masalim/types';
import { CurrentUserId } from '../../core/auth/auth.decorators';
import { Idempotent } from '../../core/idempotency/idempotency.interceptor';
import { zodBody } from '../../core/http/zod-validation.pipe';
import { NarrationService } from './narration.service';

@ApiTags('narration')
@Controller()
export class NarrationController {
  constructor(private readonly narration: NarrationService) {}

  @Post('stories/:storyId/narrations')
  @Idempotent()
  @ApiOperation({ summary: 'Read an existing story aloud in a chosen voice' })
  async create(
    @CurrentUserId() userId: string,
    @Param('storyId') storyId: string,
    @Body(zodBody(createNarrationSchema)) body: CreateNarrationInput,
  ): Promise<{ narration: NarrationDto; job: AIJobDto }> {
    return this.narration.create(userId, storyId, body);
  }

  @Get('stories/:storyId/narrations')
  @ApiOperation({ summary: 'Every reading of a story' })
  async list(
    @CurrentUserId() userId: string,
    @Param('storyId') storyId: string,
  ): Promise<NarrationDto[]> {
    return this.narration.list(userId, storyId);
  }

  @Get('narrations/:id')
  @ApiOperation({ summary: 'A single narration with its signed audio URL' })
  async findOne(
    @CurrentUserId() userId: string,
    @Param('id') narrationId: string,
  ): Promise<NarrationDto> {
    return this.narration.findOne(userId, narrationId);
  }

  @Get('narrations/:id/segments')
  @ApiOperation({ summary: 'Sentence timings that drive read-along highlighting' })
  async segments(
    @CurrentUserId() userId: string,
    @Param('id') narrationId: string,
  ): Promise<NarrationSegment[]> {
    return this.narration.segments(userId, narrationId);
  }

  @Delete('narrations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a narration and its audio' })
  async remove(
    @CurrentUserId() userId: string,
    @Param('id') narrationId: string,
  ): Promise<void> {
    await this.narration.remove(userId, narrationId);
  }
}
