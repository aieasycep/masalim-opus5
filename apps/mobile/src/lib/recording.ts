import { MIC_TEST } from '@masalim/types';

export interface RecordingFormat {
  /** File extension, which must be one the upload endpoint accepts. */
  readonly extension: string;
  /** MIME type sent when requesting the signed upload URL. */
  readonly contentType: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitRate: number;
}

/**
 * How a voice enrolment is recorded.
 *
 * Deliberately plain data, with the platform-specific recorder settings derived
 * from it next door in `recording-options.ts`. Keeping the facts here means the
 * upload contract — extension, MIME type, worst-case size — can be checked
 * against `UPLOAD_CONSTRAINTS` in a unit test without dragging a native audio
 * module into the test run.
 *
 * The values are chosen for this job rather than copied from a generic
 * high-quality preset:
 *
 *  - **Mono.** A cloned voice is one person at one microphone; a second channel
 *    is a copy that doubles the upload for nothing.
 *  - **44.1 kHz AAC in an m4a container.** Among the types the upload endpoint
 *    accepts, and what the clone provider ingests without transcoding.
 *  - **128 kbps.** This is a sixty-second file recorded once per voice. Artefacts
 *    from a stingy bitrate would be baked into every bedtime story afterwards.
 */
export const VOICE_RECORDING_FORMAT: RecordingFormat = {
  extension: '.m4a',
  contentType: 'audio/m4a',
  sampleRate: 44_100,
  channels: 1,
  bitRate: 128_000,
};

/**
 * The mic test's throwaway recording.
 *
 * Never uploaded and never kept — it exists only so the metering has something
 * to report — so it is deliberately cheap. Mono at 22 kHz is more than enough to
 * tell a quiet room from a noisy one.
 */
export const MIC_TEST_RECORDING_FORMAT: RecordingFormat = {
  extension: '.m4a',
  contentType: 'audio/m4a',
  sampleRate: 22_050,
  channels: 1,
  bitRate: 64_000,
};

export type MicTestVerdict = 'quiet' | 'noisy' | 'tooQuiet';

export interface MicTestSample {
  /** Loudest frame seen, in dBFS. */
  peakDbfs: number;
  /** Quietest frame seen, in dBFS — the room's noise floor. */
  floorDbfs: number;
}

/**
 * What to tell the parent about their room.
 *
 * dBFS is negative below full scale, so *louder* means closer to zero. That
 * single fact is why this is a function with a test rather than two inline
 * comparisons: an inverted sign reads perfectly and tells every parent in a
 * silent room that they are too loud.
 *
 * Whether they can be heard at all is checked first. Somebody speaking too
 * quietly for the clone is a bigger problem than background noise, and mentioning
 * the traffic outside when the real issue is a phone across the room sends them
 * to fix the wrong thing.
 *
 * The thresholds are the same constants the server's quality control uses, so
 * "ortam sessiz görünüyor" here does not turn into a rejection a minute later.
 */
export function micTestVerdict({ peakDbfs, floorDbfs }: MicTestSample): MicTestVerdict {
  if (peakDbfs < MIC_TEST.GOOD_SPEECH_MIN_DBFS) return 'tooQuiet';
  if (floorDbfs > MIC_TEST.QUIET_ENVIRONMENT_MAX_NOISE_DBFS) return 'noisy';
  return 'quiet';
}

/** Metering (dBFS) as a 0–1 bar height. Below -60 dBFS reads as silence. */
export function meterLevel(dbfs: number): number {
  return Math.min(1, Math.max(0, (dbfs + 60) / 60));
}
