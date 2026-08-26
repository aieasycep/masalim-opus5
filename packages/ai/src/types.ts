import type {
  AgeRange,
  CharacterBible,
  HeroType,
  IllustrationStyle,
  Locale,
  StoryAdvancedSettings,
  StoryDuration,
  StoryTheme,
} from '@masalim/types';
import type { GeneratedStory } from '@masalim/validation';

// ------------------------------------------------------------ Usage

/**
 * What a provider call cost.
 *
 * Recorded for every generation so AI spend can be attributed per user and
 * capped before it becomes a surprise (master prompt §85).
 */
export interface ProviderUsage {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  characters?: number;
  imageCount?: number;
  audioSeconds?: number;
  latencyMs: number;
}

export interface ProviderResult<T> {
  data: T;
  usage: ProviderUsage;
}

/** Failures a provider can raise, mapped to domain error codes by the caller. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind:
      | 'rate_limited'
      | 'invalid_response'
      | 'content_filtered'
      | 'unauthorized'
      | 'not_found'
      | 'timeout'
      | 'unavailable'
      | 'unknown',
    options: { cause?: unknown; retryable?: boolean } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ProviderError';
    this.retryable =
      options.retryable ?? ['rate_limited', 'timeout', 'unavailable'].includes(kind);
  }

  readonly retryable: boolean;
}

// -------------------------------------------------- Story generation

/** Everything the prompt builder needs to write a story for one child. */
export interface StoryGenerationInput {
  childName: string | null;
  childAgeInYears: number | null;
  childInterests: string[];
  heroName: string;
  heroType: HeroType;
  themes: StoryTheme[];
  ageRange: AgeRange;
  duration: StoryDuration;
  /** The parent's own idea, already stripped of control characters. */
  customPrompt: string | null;
  advancedSettings: StoryAdvancedSettings;
  language: Locale;
}

export interface StoryGenerationProvider {
  readonly name: string;
  generateStory(
    input: StoryGenerationInput,
    prompt: BuiltPrompt,
  ): Promise<ProviderResult<GeneratedStory>>;
  /**
   * Second attempt after a schema violation, given the invalid output and the
   * validation errors, so the model can repair rather than start over.
   */
  repairStory(
    prompt: BuiltPrompt,
    invalidOutput: string,
    issues: string[],
  ): Promise<ProviderResult<GeneratedStory>>;
}

export interface BuiltPrompt {
  system: string;
  user: string;
  /** JSON Schema the provider must produce. */
  responseSchema: Record<string, unknown>;
  maxOutputTokens: number;
  expectedPageCount: number;
  targetWords: number;
}

// ------------------------------------------------------- Moderation

export type ModerationSubject = 'PARENT_PROMPT' | 'GENERATED_STORY';

export interface ModerationInput {
  text: string;
  subject: ModerationSubject;
  ageRange: AgeRange;
}

/**
 * A moderation verdict.
 *
 * `reasonCode` stays internal: the parent sees only the friendly "let's change
 * the idea together" message, never a category name (master prompt §17).
 */
export interface ModerationVerdict {
  allowed: boolean;
  reasonCode: string | null;
  categories: Record<string, number>;
}

export interface ModerationProvider {
  readonly name: string;
  check(input: ModerationInput): Promise<ProviderResult<ModerationVerdict>>;
}

// ------------------------------------------------- Image generation

export interface ImageGenerationInput {
  prompt: string;
  style: IllustrationStyle;
  /**
   * The cover, passed back in for every subsequent page so the hero stays
   * recognisable. Providers without reference support fall back to prompt-only
   * consistency (master prompt §27).
   */
  referenceImage?: Buffer;
  characterBible: CharacterBible;
  /** Square for covers, 4:3 for interior pages. */
  aspect: 'square' | 'landscape';
}

export interface GeneratedImage {
  data: Buffer;
  contentType: string;
  seed?: string;
}

export interface ImageGenerationProvider {
  readonly name: string;
  readonly supportsReferenceImages: boolean;
  generateImage(input: ImageGenerationInput): Promise<ProviderResult<GeneratedImage>>;
}

// ---------------------------------------------------- Text to speech

export interface SpeechInput {
  text: string;
  /** The provider's own voice id; never exposed to clients. */
  providerVoiceId: string;
  language: Locale;
  /**
   * Neighbouring chunks. Passing these keeps prosody continuous across a long
   * story that had to be synthesised in pieces.
   */
  previousText?: string;
  nextText?: string;
}

export interface SynthesisedSpeech {
  audio: Buffer;
  contentType: string;
  durationSeconds: number;
}

export interface TextToSpeechProvider {
  readonly name: string;
  /** Longest text the provider accepts in a single request. */
  readonly maxCharactersPerRequest: number;
  synthesise(input: SpeechInput): Promise<ProviderResult<SynthesisedSpeech>>;
}

// ---------------------------------------------------- Voice cloning

export interface CreateVoiceInput {
  displayName: string;
  sample: Buffer;
  sampleContentType: string;
  language: Locale;
}

export interface ClonedVoice {
  providerVoiceId: string;
  status: 'ready' | 'processing';
}

export interface VoiceCloneProvider {
  readonly name: string;
  createVoice(input: CreateVoiceInput): Promise<ProviderResult<ClonedVoice>>;
  /**
   * Removes the voice at the provider.
   *
   * Called before the local row is purged, because a parent deleting their
   * voice must mean it is gone everywhere, not just hidden in our UI (§46).
   */
  deleteVoice(providerVoiceId: string): Promise<void>;
  getStatus(providerVoiceId: string): Promise<ClonedVoice['status']>;
}
