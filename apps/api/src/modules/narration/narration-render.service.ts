import { Inject, Injectable } from '@nestjs/common';
import {
  chunkPagesForSpeech,
  estimateSentenceTimings,
  ProviderError,
  type TextChunk,
  type TextToSpeechProvider,
} from '@masalim/ai';
import { concatenateAudio, transcodeToMp3 } from '@masalim/audio';
import { extensionForContentType } from '@masalim/storage';
import { ERROR_CODES, type NarrationSegment } from '@masalim/types';
import { TTS_PROVIDER } from '../../core/ai/ai.module';
import { AiUsageTracker } from '../../core/ai/usage-tracker.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { AssetsService } from '../assets/assets.service';
import type { JobStepReporter } from '../../core/queue/queue.constants';

export interface RenderNarrationParams {
  narrationId: string;
  userId: string;
  jobId: string;
}

@Injectable()
export class NarrationRenderService {
  /** Prepare, synthesise, assemble, publish. */
  static readonly TOTAL_STEPS = 4;

  constructor(
    @Inject(TTS_PROVIDER) private readonly tts: TextToSpeechProvider,
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly usage: AiUsageTracker,
    private readonly logger: AppLogger,
  ) {}

  async render(params: RenderNarrationParams, reporter: JobStepReporter): Promise<void> {
    const log = this.logger.child({
      narrationId: params.narrationId,
      userId: params.userId,
      jobId: params.jobId,
    });

    const narration = await this.prisma.client.narration.findUnique({
      where: { id: params.narrationId },
      include: {
        story: { include: { pages: { orderBy: { pageNumber: 'asc' } } } },
        voiceProfile: true,
        systemVoice: true,
      },
    });
    if (!narration) {
      throw new AppError(ERROR_CODES.NARRATION_NOT_FOUND);
    }

    const providerVoiceId =
      narration.voiceProfile?.providerVoiceId ?? narration.systemVoice?.providerVoiceId;
    if (!providerVoiceId) {
      await this.markFailed(narration.id, ERROR_CODES.VOICE_NOT_READY);
      throw new AppError(ERROR_CODES.VOICE_NOT_READY);
    }

    await this.prisma.client.narration.update({
      where: { id: narration.id },
      data: { status: 'PROCESSING', errorCode: null },
    });

    // ---- Step 1: split the story at sentence boundaries -------------------
    await reporter.step('job.narration.preparing', 1);

    const pages = narration.story.pages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
    }));
    const chunks = chunkPagesForSpeech(pages, this.tts.maxCharactersPerRequest);

    if (chunks.length === 0) {
      await this.markFailed(narration.id, ERROR_CODES.NARRATION_FAILED);
      throw new AppError(ERROR_CODES.NARRATION_FAILED, 'Story has no text to narrate');
    }

    // ---- Step 2: synthesise, chunk by chunk -------------------------------
    const rendered: Array<{ data: Buffer; extension: string; durationSeconds: number }> = [];

    for (const [index, chunk] of chunks.entries()) {
      await reporter.step('job.narration.synthesising', 2, {
        current: String(index + 1),
        total: String(chunks.length),
      });

      try {
        const result = await this.tts.synthesise({
          text: chunk.text,
          providerVoiceId,
          language: narration.story.language,
          // Neighbouring text keeps intonation continuous across a seam. Without
          // it every chunk restarts at a "beginning of paragraph" cadence and
          // the story sounds stitched together.
          ...this.neighbours(chunks, index),
        });

        rendered.push({
          data: result.data.audio,
          extension: extensionForContentType(result.data.contentType),
          durationSeconds: result.data.durationSeconds,
        });

        await this.usage.record({
          userId: params.userId,
          jobId: params.jobId,
          operation: 'narration:synthesise',
          success: true,
          usage: result.usage,
        });
      } catch (error) {
        await this.markFailed(narration.id, ERROR_CODES.NARRATION_FAILED);
        throw this.toDomainError(error);
      }
    }

    // ---- Step 3: assemble one continuous reading --------------------------
    await reporter.step('job.narration.assembling', 3);

    const assembled =
      rendered.length === 1 && rendered[0]
        ? await this.single(rendered[0])
        : await concatenateAudio(rendered.map(({ data, extension }) => ({ data, extension })));

    // Timings come from the measured offsets of the assembled file rather than
    // from the provider's per-chunk estimates, so the highlight cannot drift
    // further and further behind over a fifteen-minute story.
    const chunkDurations = assembled.offsets.map((offset, index) => {
      const next = assembled.offsets[index + 1] ?? assembled.durationSeconds;
      return next - offset;
    });
    const segments: NarrationSegment[] = estimateSentenceTimings(pages, chunks, chunkDurations);

    // ---- Step 4: publish ---------------------------------------------------
    await reporter.step('job.narration.saving', 4);

    const asset = await this.assets.createInternalAsset({
      userId: params.userId,
      kind: 'NARRATION_AUDIO',
      body: assembled.data,
      contentType: assembled.contentType,
    });

    await this.prisma.client.narration.update({
      where: { id: narration.id },
      data: {
        status: 'READY',
        audioAssetId: asset.id,
        durationSeconds: Math.round(assembled.durationSeconds),
        segments,
      },
    });

    log.info(
      { chunks: chunks.length, seconds: Math.round(assembled.durationSeconds) },
      'narration rendered',
    );
  }

  /** One chunk still gets transcoded, so every narration is the same format. */
  private async single(part: { data: Buffer; extension: string; durationSeconds: number }) {
    const data = await transcodeToMp3(part.data, part.extension);
    return {
      data,
      contentType: 'audio/mpeg',
      durationSeconds: part.durationSeconds,
      offsets: [0],
    };
  }

  /** Trailing and leading context, capped so a long chunk is not resent whole. */
  private neighbours(
    chunks: TextChunk[],
    index: number,
  ): { previousText?: string; nextText?: string } {
    const CONTEXT_CHARACTERS = 300;
    const previous = chunks[index - 1]?.text.slice(-CONTEXT_CHARACTERS);
    const next = chunks[index + 1]?.text.slice(0, CONTEXT_CHARACTERS);
    return {
      ...(previous ? { previousText: previous } : {}),
      ...(next ? { nextText: next } : {}),
    };
  }

  private async markFailed(narrationId: string, code: string): Promise<void> {
    await this.prisma.client.narration
      .update({ where: { id: narrationId }, data: { status: 'FAILED', errorCode: code } })
      .catch(() => undefined);
  }

  private toDomainError(error: unknown): AppError {
    if (error instanceof AppError) return error;
    if (error instanceof ProviderError && error.kind === 'rate_limited') {
      return new AppError(ERROR_CODES.SERVICE_UNAVAILABLE, error.message, { cause: error });
    }
    return new AppError(ERROR_CODES.NARRATION_FAILED, 'Narration failed', { cause: error });
  }
}
