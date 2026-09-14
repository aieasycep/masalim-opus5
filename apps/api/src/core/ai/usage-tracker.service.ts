import { Injectable } from '@nestjs/common';
import type { ProviderUsage } from '@masalim/ai';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../logger/logger.service';

/**
 * Rough per-unit costs in currency micros, used to attribute AI spend.
 *
 * Deliberately approximate and easy to update: the goal is to know which
 * families and which features are expensive before the bill arrives, not to
 * reconcile invoices to the cent.
 */
const COST_MICROS = {
  inputTokenMicros: 3,
  outputTokenMicros: 15,
  ttsCharacterMicros: 150,
  imageMicros: 40_000,
} as const;

export interface RecordUsageParams {
  userId: string;
  jobId?: string | undefined;
  operation: string;
  success: boolean;
  usage: ProviderUsage;
}

@Injectable()
export class AiUsageTracker {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  async record(params: RecordUsageParams): Promise<void> {
    const { usage } = params;
    const estimated =
      BigInt(Math.round((usage.inputTokens ?? 0) * COST_MICROS.inputTokenMicros)) +
      BigInt(Math.round((usage.outputTokens ?? 0) * COST_MICROS.outputTokenMicros)) +
      BigInt(Math.round((usage.characters ?? 0) * COST_MICROS.ttsCharacterMicros)) +
      BigInt(Math.round((usage.imageCount ?? 0) * COST_MICROS.imageMicros));

    await this.prisma.client.aIUsageLog
      .create({
        data: {
          userId: params.userId,
          ...(params.jobId ? { jobId: params.jobId } : {}),
          provider: usage.provider,
          model: usage.model,
          operation: params.operation,
          success: params.success,
          ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
          ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
          ...(usage.characters !== undefined ? { characters: usage.characters } : {}),
          ...(usage.imageCount !== undefined ? { imageCount: usage.imageCount } : {}),
          ...(usage.audioSeconds !== undefined ? { audioSeconds: usage.audioSeconds } : {}),
          estimatedCostMicros: estimated,
          latencyMs: usage.latencyMs,
        },
      })
      .catch((error: unknown) => {
        // Bookkeeping must never fail the work it is measuring: a parent's
        // story should not be lost because a usage row could not be written.
        this.logger
          .child({ userId: params.userId, operation: params.operation })
          .warn({ err: error }, 'failed to record AI usage');
      });
  }
}
