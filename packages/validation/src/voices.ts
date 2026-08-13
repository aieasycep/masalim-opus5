import { z } from 'zod';
import { VOICE_OWNER_TYPES, VOICE_RECORDING } from '@masalim/types';
import { freeTextSchema, idSchema } from './primitives';

/** The exact consent wording the parent accepts, versioned for the audit trail. */
export const VOICE_CONSENT_VERSION = '2026-08-01';

/**
 * Consent must be recorded before any recording is uploaded or cloned.
 * The backend refuses to create a voice without a stored consent row, so the
 * frontend checkbox is never the only gate (§21).
 */
export const acceptVoiceConsentSchema = z.object({
  consentVersion: z.literal(VOICE_CONSENT_VERSION),
  accepted: z.literal(true, {
    errorMap: () => ({ message: 'VOICE_CONSENT_REQUIRED' }),
  }),
});
export type AcceptVoiceConsentInput = z.infer<typeof acceptVoiceConsentSchema>;

export const createVoiceProfileSchema = z.object({
  ownerType: z.enum(VOICE_OWNER_TYPES),
  displayName: freeTextSchema(40),
  consentVersion: z.literal(VOICE_CONSENT_VERSION),
  consentAccepted: z.literal(true, {
    errorMap: () => ({ message: 'VOICE_CONSENT_REQUIRED' }),
  }),
});
export type CreateVoiceProfileInput = z.infer<typeof createVoiceProfileSchema>;

/**
 * Submitting the confirmed recording. The asset was uploaded first via a signed
 * URL, so only its id travels here; the server verifies the asset belongs to the
 * caller and passes it through quality control before cloning.
 */
export const submitVoiceRecordingSchema = z.object({
  assetId: idSchema,
  durationSeconds: z
    .number()
    .min(VOICE_RECORDING.MIN_SECONDS, 'AUDIO_TOO_SHORT')
    .max(VOICE_RECORDING.MAX_SECONDS, 'AUDIO_TOO_LONG'),
  idempotencyKey: z.string().uuid(),
});
export type SubmitVoiceRecordingInput = z.infer<typeof submitVoiceRecordingSchema>;

export const renameVoiceProfileSchema = z.object({
  displayName: freeTextSchema(40),
});
export type RenameVoiceProfileInput = z.infer<typeof renameVoiceProfileSchema>;

/** Client-side mic-test measurements, used only to advise the parent. */
export const micTestResultSchema = z.object({
  noiseFloorDbfs: z.number().min(-120).max(0),
  peakDbfs: z.number().min(-120).max(0),
});
export type MicTestResult = z.infer<typeof micTestResultSchema>;
