import { Global, Module } from '@nestjs/common';
import {
  createImageProvider,
  createModerationProvider,
  createStoryProvider,
  createTextToSpeechProvider,
  createVoiceCloneProvider,
  type AiProviderConfig,
  type ImageGenerationProvider,
  type ModerationProvider,
  type StoryGenerationProvider,
  type TextToSpeechProvider,
  type VoiceCloneProvider,
} from '@masalim/ai';
import { AppConfigService } from '../config/config.service';

export const STORY_PROVIDER = Symbol('STORY_PROVIDER');
export const MODERATION_PROVIDER = Symbol('MODERATION_PROVIDER');
export const IMAGE_PROVIDER = Symbol('IMAGE_PROVIDER');
export const TTS_PROVIDER = Symbol('TTS_PROVIDER');
export const VOICE_CLONE_PROVIDER = Symbol('VOICE_CLONE_PROVIDER');

function toProviderConfig(config: AppConfigService): AiProviderConfig {
  return {
    isProduction: config.isProduction,
    storyProvider: config.get('AI_PROVIDER'),
    anthropicApiKey: config.get('ANTHROPIC_API_KEY'),
    anthropicStoryModel: config.get('ANTHROPIC_STORY_MODEL'),
    openaiApiKey: config.get('OPENAI_API_KEY'),
    openaiStoryModel: config.get('OPENAI_STORY_MODEL'),
    moderationProvider: config.get('MODERATION_PROVIDER'),
    moderationModel: config.get('MODERATION_MODEL'),
    imageProvider: config.get('IMAGE_PROVIDER'),
    imageModel: config.get('IMAGE_MODEL'),
    imageUseReferenceImages: config.get('IMAGE_USE_REFERENCE_IMAGES'),
    ttsProvider: config.get('TTS_PROVIDER'),
    voiceCloneProvider: config.get('VOICE_CLONE_PROVIDER'),
    elevenLabsApiKey: config.get('ELEVENLABS_API_KEY'),
    elevenLabsTtsModel: config.get('ELEVENLABS_TTS_MODEL'),
  };
}

/**
 * Resolves every AI provider once at boot.
 *
 * Constructing them eagerly means a misconfigured key fails at startup rather
 * than the first time a parent taps "Masalımı Oluştur".
 */
@Global()
@Module({
  providers: [
    {
      provide: STORY_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): StoryGenerationProvider =>
        createStoryProvider(toProviderConfig(config)),
    },
    {
      provide: MODERATION_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): ModerationProvider =>
        createModerationProvider(toProviderConfig(config)),
    },
    {
      provide: IMAGE_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): ImageGenerationProvider =>
        createImageProvider(toProviderConfig(config)),
    },
    {
      provide: TTS_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): TextToSpeechProvider =>
        createTextToSpeechProvider(toProviderConfig(config)),
    },
    {
      provide: VOICE_CLONE_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): VoiceCloneProvider =>
        createVoiceCloneProvider(toProviderConfig(config)),
    },
  ],
  exports: [
    STORY_PROVIDER,
    MODERATION_PROVIDER,
    IMAGE_PROVIDER,
    TTS_PROVIDER,
    VOICE_CLONE_PROVIDER,
  ],
})
export class AiModule {}
