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
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  acceptVoiceConsentSchema,
  createVoiceProfileSchema,
  renameVoiceProfileSchema,
  submitVoiceRecordingSchema,
  type CreateVoiceProfileInput,
  type RenameVoiceProfileInput,
  type SubmitVoiceRecordingInput,
} from '@masalim/validation';
import {
  VOICE_ENROLMENT_SCRIPTS,
  VOICE_ENROLMENT_SCRIPT_VERSION,
} from '@masalim/localization';
import type {
  AIJobDto,
  Locale,
  NarratorOption,
  SystemVoiceDto,
  VoiceProfileDto,
} from '@masalim/types';
import { CurrentUserId } from '../../core/auth/auth.decorators';
import { Idempotent } from '../../core/idempotency/idempotency.interceptor';
import { zodBody } from '../../core/http/zod-validation.pipe';
import { VoicesService, type VoiceConsentState } from './voices.service';

@ApiTags('voices')
@Controller()
export class VoicesController {
  constructor(private readonly voices: VoicesService) {}

  @Get('voices/consent')
  @ApiOperation({ summary: 'Current consent wording and whether it has been accepted' })
  async consent(@CurrentUserId() userId: string): Promise<VoiceConsentState> {
    return this.voices.currentConsent(userId);
  }

  @Post('voices/consent')
  @ApiOperation({ summary: 'Record the parent’s consent to clone a voice' })
  async acceptConsent(
    @CurrentUserId() userId: string,
    @Body(zodBody(acceptVoiceConsentSchema)) _body: unknown,
    @Req() request: Request,
  ): Promise<VoiceConsentState> {
    return this.voices.acceptConsent(userId, request.ip ?? null);
  }

  /**
   * The text the parent reads aloud.
   *
   * Served from the API rather than bundled in the app so it can be corrected
   * without an App Store release — and because a shorter or different script
   * would change what the clone is trained on.
   */
  @Get('voices/enrolment-script')
  @ApiOperation({ summary: 'The ~60 second passage the parent reads for enrolment' })
  async enrolmentScript(
    @CurrentUserId() userId: string,
  ): Promise<{ version: string; paragraphs: string[] }> {
    const locale: Locale = await this.voices.localeFor(userId);
    return {
      version: VOICE_ENROLMENT_SCRIPT_VERSION,
      paragraphs: [...VOICE_ENROLMENT_SCRIPTS[locale]],
    };
  }

  @Get('voices/system')
  @ApiOperation({ summary: 'Curated system narrators' })
  async systemVoices(): Promise<SystemVoiceDto[]> {
    return this.voices.listSystemVoices();
  }

  @Get('voices/narrators')
  @ApiOperation({ summary: 'Everything the narrator picker can offer this parent' })
  async narrators(@CurrentUserId() userId: string): Promise<NarratorOption[]> {
    return this.voices.narratorOptions(userId);
  }

  @Get('voices')
  @ApiOperation({ summary: 'The parent’s own voice profiles' })
  async list(@CurrentUserId() userId: string): Promise<VoiceProfileDto[]> {
    return this.voices.list(userId);
  }

  @Post('voices')
  @ApiOperation({ summary: 'Start a voice profile; refused without recorded consent' })
  async create(
    @CurrentUserId() userId: string,
    @Body(zodBody(createVoiceProfileSchema)) body: CreateVoiceProfileInput,
  ): Promise<VoiceProfileDto> {
    return this.voices.create(userId, body);
  }

  @Get('voices/:id')
  @ApiOperation({ summary: 'A single voice profile' })
  async findOne(
    @CurrentUserId() userId: string,
    @Param('id') voiceProfileId: string,
  ): Promise<VoiceProfileDto> {
    return this.voices.findOne(userId, voiceProfileId);
  }

  @Post('voices/:id/recording')
  @Idempotent()
  @ApiOperation({ summary: 'Submit the confirmed recording and queue the clone' })
  async submitRecording(
    @CurrentUserId() userId: string,
    @Param('id') voiceProfileId: string,
    @Body(zodBody(submitVoiceRecordingSchema)) body: SubmitVoiceRecordingInput,
  ): Promise<{ voice: VoiceProfileDto; job: AIJobDto }> {
    return this.voices.submitRecording(userId, voiceProfileId, body);
  }

  @Patch('voices/:id')
  @ApiOperation({ summary: 'Rename a voice profile' })
  async rename(
    @CurrentUserId() userId: string,
    @Param('id') voiceProfileId: string,
    @Body(zodBody(renameVoiceProfileSchema)) body: RenameVoiceProfileInput,
  ): Promise<VoiceProfileDto> {
    return this.voices.rename(userId, voiceProfileId, body);
  }

  @Delete('voices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete the voice here and at the provider' })
  async remove(
    @CurrentUserId() userId: string,
    @Param('id') voiceProfileId: string,
  ): Promise<void> {
    await this.voices.remove(userId, voiceProfileId);
  }
}
