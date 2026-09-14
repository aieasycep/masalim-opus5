import type { AssetKind } from './enums';

/** Voice recording bounds enforced on the device and again on the server (§20). */
export const VOICE_RECORDING = {
  /** The Voice Studio asks for "yaklaşık 60 saniye". */
  TARGET_SECONDS: 60,
  MIN_SECONDS: 45,
  MAX_SECONDS: 120,
  /** Below this RMS the sample is too quiet to clone reliably. */
  MIN_RMS_DBFS: -34,
  /** Above this share of near-silent frames the sample is unusable. */
  MAX_SILENCE_RATIO: 0.45,
  /** Share of samples at full scale that counts as clipping. */
  MAX_CLIPPING_RATIO: 0.01,
  /** Rough signal-to-noise floor, in dB, below which we warn about background noise. */
  MIN_SNR_DB: 12,
} as const;

/** Mic-test thresholds for the "ortam sessiz görünüyor" indicator (§ Voice screen 4). */
export const MIC_TEST = {
  SAMPLE_SECONDS: 3,
  QUIET_ENVIRONMENT_MAX_NOISE_DBFS: -45,
  GOOD_SPEECH_MIN_DBFS: -30,
} as const;

export interface UploadConstraint {
  readonly maxBytes: number;
  readonly allowedMimeTypes: readonly string[];
  readonly allowedExtensions: readonly string[];
}

export const UPLOAD_CONSTRAINTS: Readonly<Record<AssetKind, UploadConstraint>> = {
  VOICE_RECORDING: {
    maxBytes: 25 * 1024 * 1024,
    allowedMimeTypes: ['audio/m4a', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/mpeg'],
    allowedExtensions: ['.m4a', '.mp4', '.wav', '.mp3'],
  },
  VOICE_PREVIEW: {
    maxBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ['audio/mpeg', 'audio/mp4'],
    allowedExtensions: ['.mp3', '.m4a'],
  },
  NARRATION_AUDIO: {
    maxBytes: 60 * 1024 * 1024,
    allowedMimeTypes: ['audio/mpeg', 'audio/mp4'],
    allowedExtensions: ['.mp3', '.m4a'],
  },
  ILLUSTRATION: {
    maxBytes: 15 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    allowedExtensions: ['.png', '.jpg', '.jpeg', '.webp'],
  },
  BOOK_PREVIEW: {
    maxBytes: 30 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
    allowedExtensions: ['.pdf', '.png', '.jpg'],
  },
  PRINT_PDF: {
    maxBytes: 400 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf'],
    allowedExtensions: ['.pdf'],
  },
  CHILD_AVATAR: {
    maxBytes: 8 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/heic'],
    allowedExtensions: ['.png', '.jpg', '.jpeg', '.webp', '.heic'],
  },
  USER_AVATAR: {
    maxBytes: 8 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/heic'],
    allowedExtensions: ['.png', '.jpg', '.jpeg', '.webp', '.heic'],
  },
} as const;

/** Private media is only ever handed out as a short-lived signed URL (§83). */
export const SIGNED_URL_DEFAULT_TTL_SECONDS = 60 * 15;
export const SIGNED_UPLOAD_URL_TTL_SECONDS = 60 * 10;
