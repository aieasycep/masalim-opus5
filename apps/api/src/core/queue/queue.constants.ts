import type { AIJobType } from '@masalim/types';

/** One BullMQ queue per job type, so a slow illustration run cannot starve narration. */
export const QUEUE_NAMES: Readonly<Record<AIJobType, string>> = {
  STORY_GENERATION: 'story-generation',
  VOICE_CLONE: 'voice-clone',
  NARRATION_GENERATION: 'narration',
  ILLUSTRATION_GENERATION: 'illustration',
  BOOK_RENDER: 'book-render',
  PRINT_FILE_GENERATION: 'print-file',
};

export const ALL_QUEUE_NAMES = Object.values(QUEUE_NAMES);

/**
 * Retry policy.
 *
 * AI providers fail transiently often enough that a single attempt would show
 * parents an error for something that would have worked a second later.
 */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 4000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
} as const;

/** Redis pub/sub channel carrying live job progress to SSE subscribers. */
export const JOB_PROGRESS_CHANNEL = 'masalim:job-progress';

/** DI token for the processors a feature module contributes. */
export const JOB_PROCESSOR = Symbol('JOB_PROCESSOR');

export interface JobPayload {
  jobId: string;
  userId: string;
  entityId: string | null;
  data: Record<string, unknown>;
}

/**
 * A processor owns one job type.
 *
 * `steps` is what makes progress honest: the runner divides completed steps by
 * this number, so the percentage a parent sees is real pipeline state rather
 * than an animation (master prompt §29, §57).
 */
export interface JobProcessor {
  readonly type: AIJobType;
  readonly totalSteps: number;
  process(payload: JobPayload, reporter: JobStepReporter): Promise<void>;
}

export interface JobStepReporter {
  /** Advance to a named step; `stepKey` is a localisation key, never raw text. */
  step(stepKey: string, completedSteps: number, values?: Record<string, string>): Promise<void>;
}
