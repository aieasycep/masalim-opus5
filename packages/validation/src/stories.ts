import { z } from 'zod';
import {
  AGE_RANGES,
  FANTASY_LEVELS,
  HERO_TYPES,
  HUMOUR_LEVELS,
  STORY_DURATIONS,
  STORY_THEMES,
} from '@masalim/types';
import { freeTextSchema, idSchema, paginationSchema, personNameSchema } from './primitives';

export const MAX_CUSTOM_PROMPT_LENGTH = 600;
export const MAX_EDUCATIONAL_GOAL_LENGTH = 200;
const MAX_THEMES = 4;

export const storyAdvancedSettingsSchema = z.object({
  educationalGoal: freeTextSchema(MAX_EDUCATIONAL_GOAL_LENGTH).optional(),
  teachNewWords: z.boolean().optional(),
  calmBedtimeEnding: z.boolean().optional(),
  humourLevel: z.enum(HUMOUR_LEVELS).optional(),
  fantasyLevel: z.enum(FANTASY_LEVELS).optional(),
});

/**
 * The story creation wizard's payload.
 *
 * `childId` is optional because the wizard offers "Genel bir hikâye". When it is
 * present the backend re-validates that the child belongs to the caller — the
 * client is never trusted for ownership.
 */
export const createStorySchema = z
  .object({
    childId: idSchema.optional(),
    heroName: personNameSchema,
    heroType: z.enum(HERO_TYPES),
    themes: z.array(z.enum(STORY_THEMES)).min(1, 'THEME_REQUIRED').max(MAX_THEMES),
    ageRange: z.enum(AGE_RANGES),
    durationTarget: z.enum(STORY_DURATIONS),
    customPrompt: freeTextSchema(MAX_CUSTOM_PROMPT_LENGTH).optional(),
    advancedSettings: storyAdvancedSettingsSchema.default({}),
    /**
     * Narrator chosen in wizard step 5. Exactly one of the two must be set, and
     * the backend enforces the parent-voice entitlement before queueing.
     */
    voiceProfileId: idSchema.optional(),
    systemVoiceId: idSchema.optional(),
    /** Client-generated key so a retried submit never creates a duplicate story. */
    idempotencyKey: z.string().uuid(),
  })
  .refine((value) => !(value.voiceProfileId && value.systemVoiceId), {
    message: 'NARRATOR_AMBIGUOUS',
    path: ['voiceProfileId'],
  });
export type CreateStoryInput = z.infer<typeof createStorySchema>;

export const updateStorySchema = z.object({
  title: freeTextSchema(120).optional(),
  pages: z
    .array(
      z.object({
        id: idSchema,
        text: freeTextSchema(2000),
      }),
    )
    .max(24)
    .optional(),
});
export type UpdateStoryInput = z.infer<typeof updateStorySchema>;

export const listStoriesSchema = paginationSchema.extend({
  childId: idSchema.optional(),
  filter: z.enum(['all', 'audio', 'books', 'favourites']).default('all'),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['recent', 'oldest', 'title']).default('recent'),
});
export type ListStoriesInput = z.infer<typeof listStoriesSchema>;

/** Re-narrating an existing story never regenerates its text (§ "Yeni Sesle Oluştur"). */
export const createNarrationSchema = z
  .object({
    voiceProfileId: idSchema.optional(),
    systemVoiceId: idSchema.optional(),
    idempotencyKey: z.string().uuid(),
  })
  .refine((value) => Boolean(value.voiceProfileId) !== Boolean(value.systemVoiceId), {
    message: 'NARRATOR_REQUIRED',
    path: ['systemVoiceId'],
  });
export type CreateNarrationInput = z.infer<typeof createNarrationSchema>;

export const updateStoryProgressSchema = z.object({
  narrationId: idSchema,
  positionSeconds: z.number().min(0).max(24 * 60 * 60),
  completed: z.boolean().default(false),
});
export type UpdateStoryProgressInput = z.infer<typeof updateStoryProgressSchema>;

/**
 * Shape the story model must return. Validated with Zod immediately after
 * generation; a mismatch triggers the repair retry rather than a user-visible
 * failure (§16).
 */
export const generatedStorySchema = z.object({
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(10).max(400),
  pages: z
    .array(
      z.object({
        pageNumber: z.number().int().min(1).max(24),
        text: z.string().trim().min(1).max(2000),
        illustrationPrompt: z.string().trim().min(10).max(800),
      }),
    )
    .min(4)
    .max(24),
});
export type GeneratedStory = z.infer<typeof generatedStorySchema>;
