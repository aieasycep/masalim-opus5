import { z } from 'zod';
import { LOCALES } from '@masalim/types';
import { freeTextSchema, idSchema, personNameSchema, timezoneSchema } from './primitives';

export const updateProfileSchema = z.object({
  name: personNameSchema.optional(),
  avatarAssetId: idSchema.optional(),
  locale: z.enum(LOCALES).optional(),
  timezone: timezoneSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const notificationPreferencesSchema = z.object({
  storyReady: z.boolean(),
  voiceReady: z.boolean(),
  illustrationsReady: z.boolean(),
  orderUpdates: z.boolean(),
  productNews: z.boolean(),
});
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

export const audioPreferencesSchema = z.object({
  defaultPlaybackRate: z.union([z.literal(0.8), z.literal(1), z.literal(1.2)]),
  autoPlayNext: z.boolean(),
  /** Minutes; null disables the default sleep timer. */
  defaultSleepTimerMinutes: z.number().int().min(5).max(120).nullable(),
});
export type AudioPreferencesInput = z.infer<typeof audioPreferencesSchema>;

/**
 * Analytics consent, as a decision rather than a flag.
 *
 * There is no partial setting on purpose: a parent either agrees to product
 * analytics or does not, and a menu of collection tiers would only be a way of
 * making "no" harder to choose.
 */
export const privacyPreferencesSchema = z.object({
  analyticsConsent: z.boolean(),
});
export type PrivacyPreferencesInput = z.infer<typeof privacyPreferencesSchema>;

/**
 * Account deletion is deliberately friction-ful: the parent retypes their email
 * so an accidental tap cannot destroy a family's stories and voices.
 */
export const requestAccountDeletionSchema = z.object({
  confirmEmail: z.string().trim().toLowerCase().email(),
  reason: freeTextSchema(400).optional(),
});
export type RequestAccountDeletionInput = z.infer<typeof requestAccountDeletionSchema>;
