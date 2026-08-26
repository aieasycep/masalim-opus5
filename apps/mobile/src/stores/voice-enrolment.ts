import { create } from 'zustand';
import type { VoiceOwnerType } from '@masalim/types';

export interface VoiceEnrolmentDraft {
  ownerType: VoiceOwnerType | null;
  displayName: string;
  /** Local `file://` URI of the confirmed take. */
  recordingUri: string | null;
  durationSeconds: number;
  contentType: string;
  /** Set once the profile row exists, so a retry does not create a second one. */
  voiceProfileId: string | null;
  /** Set once the bytes are in storage; a retry re-submits this rather than re-recording. */
  assetId: string | null;
  /** Held for the life of one enrolment so a retried submit cannot clone twice. */
  idempotencyKey: string | null;
}

const EMPTY: VoiceEnrolmentDraft = {
  ownerType: null,
  displayName: '',
  recordingUri: null,
  durationSeconds: 0,
  contentType: 'audio/m4a',
  voiceProfileId: null,
  assetId: null,
  idempotencyKey: null,
};

interface VoiceEnrolmentState {
  draft: VoiceEnrolmentDraft;
  update: (patch: Partial<VoiceEnrolmentDraft>) => void;
  reset: () => void;
}

/**
 * The Voice Studio enrolment, held across its seven screens.
 *
 * Deliberately *not* persisted, unlike the story wizard. What matters here is a
 * `file://` URI produced by the recorder, and that file lives in the app's cache
 * directory: it does not survive reinstalls, the OS can evict it under storage
 * pressure, and restoring a draft that points at a file which is no longer there
 * would offer to resume a recording that cannot be played. A parent who kills the
 * app mid-recording re-reads a minute of text, which is the honest outcome.
 *
 * Once the bytes reach storage the situation reverses, and that is what
 * `assetId` is for: from then on a failure is retried against the uploaded asset,
 * so the passage is never read twice (§21, §46).
 */
export const useVoiceEnrolment = create<VoiceEnrolmentState>((set) => ({
  draft: EMPTY,
  update: (patch) => {
    set((state) => ({ draft: { ...state.draft, ...patch } }));
  },
  reset: () => {
    set({ draft: EMPTY });
  },
}));

/** The default name offered for each kind of owner, so most parents never type. */
export const OWNER_NAME_KEYS: Readonly<Record<VoiceOwnerType, string>> = {
  MOTHER: 'voice.ownerNameMother',
  FATHER: 'voice.ownerNameFather',
  GRANDMOTHER: 'voice.ownerNameGrandmother',
  GRANDFATHER: 'voice.ownerNameGrandfather',
  OTHER: 'voice.ownerNameOther',
};
