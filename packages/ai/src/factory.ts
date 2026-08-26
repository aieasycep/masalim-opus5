import { AnthropicStoryProvider } from './providers/anthropic/anthropic-story';
import { ElevenLabsTextToSpeechProvider, ElevenLabsVoiceCloneProvider } from './providers/elevenlabs/elevenlabs';
import { MockImageProvider } from './providers/mock/mock-image';
import { MockModerationProvider } from './providers/mock/mock-moderation';
import { MockStoryProvider } from './providers/mock/mock-story';
import { MockTextToSpeechProvider, MockVoiceCloneProvider } from './providers/mock/mock-speech';
import { OpenAIImageProvider } from './providers/openai/openai-image';
import { OpenAIModerationProvider } from './providers/openai/openai-moderation';
import { OpenAIStoryProvider } from './providers/openai/openai-story';
import type {
  ImageGenerationProvider,
  ModerationProvider,
  StoryGenerationProvider,
  TextToSpeechProvider,
  VoiceCloneProvider,
} from './types';

export interface AiProviderConfig {
  isProduction: boolean;

  storyProvider: 'mock' | 'anthropic' | 'openai';
  anthropicApiKey?: string | undefined;
  anthropicStoryModel: string;
  openaiApiKey?: string | undefined;
  openaiStoryModel: string;

  moderationProvider: 'mock' | 'openai';
  moderationModel: string;

  imageProvider: 'mock' | 'openai';
  imageModel: string;
  imageUseReferenceImages: boolean;

  ttsProvider: 'mock' | 'elevenlabs';
  voiceCloneProvider: 'mock' | 'elevenlabs';
  elevenLabsApiKey?: string | undefined;
  elevenLabsTtsModel: string;
}

/**
 * Refuses to hand back a mock in production.
 *
 * The environment schema already blocks this at boot, but the guard is repeated
 * here because these particular mocks are the ones that would be hardest to
 * notice in production — a family would simply receive a nonsense story or a
 * tone instead of a narration.
 */
function assertNotMockInProduction(isProduction: boolean, what: string): void {
  if (isProduction) {
    throw new Error(
      `Refusing to use the ${what} mock provider in production. Configure a real provider.`,
    );
  }
}

function requireKey(key: string | undefined, name: string): string {
  if (!key) {
    throw new Error(`${name} is required for the selected provider.`);
  }
  return key;
}

export function createStoryProvider(config: AiProviderConfig): StoryGenerationProvider {
  switch (config.storyProvider) {
    case 'anthropic':
      return new AnthropicStoryProvider({
        apiKey: requireKey(config.anthropicApiKey, 'ANTHROPIC_API_KEY'),
        model: config.anthropicStoryModel,
      });
    case 'openai':
      return new OpenAIStoryProvider({
        apiKey: requireKey(config.openaiApiKey, 'OPENAI_API_KEY'),
        model: config.openaiStoryModel,
      });
    default:
      assertNotMockInProduction(config.isProduction, 'story generation');
      return new MockStoryProvider();
  }
}

export function createModerationProvider(config: AiProviderConfig): ModerationProvider {
  if (config.moderationProvider === 'openai') {
    return new OpenAIModerationProvider({
      apiKey: requireKey(config.openaiApiKey, 'OPENAI_API_KEY'),
      moderationModel: config.moderationModel,
      classifierModel: config.openaiStoryModel,
    });
  }
  assertNotMockInProduction(config.isProduction, 'content moderation');
  return new MockModerationProvider();
}

export function createImageProvider(config: AiProviderConfig): ImageGenerationProvider {
  if (config.imageProvider === 'openai') {
    return new OpenAIImageProvider({
      apiKey: requireKey(config.openaiApiKey, 'OPENAI_API_KEY'),
      model: config.imageModel,
      useReferenceImages: config.imageUseReferenceImages,
    });
  }
  assertNotMockInProduction(config.isProduction, 'image generation');
  return new MockImageProvider();
}

export function createTextToSpeechProvider(config: AiProviderConfig): TextToSpeechProvider {
  if (config.ttsProvider === 'elevenlabs') {
    return new ElevenLabsTextToSpeechProvider({
      apiKey: requireKey(config.elevenLabsApiKey, 'ELEVENLABS_API_KEY'),
      model: config.elevenLabsTtsModel,
    });
  }
  assertNotMockInProduction(config.isProduction, 'text to speech');
  return new MockTextToSpeechProvider();
}

export function createVoiceCloneProvider(config: AiProviderConfig): VoiceCloneProvider {
  if (config.voiceCloneProvider === 'elevenlabs') {
    return new ElevenLabsVoiceCloneProvider({
      apiKey: requireKey(config.elevenLabsApiKey, 'ELEVENLABS_API_KEY'),
    });
  }
  assertNotMockInProduction(config.isProduction, 'voice cloning');
  return new MockVoiceCloneProvider();
}
