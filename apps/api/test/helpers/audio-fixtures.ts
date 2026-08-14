import { encodeWav } from '@masalim/audio';

const SAMPLE_RATE = 16_000;

export interface RecordingOptions {
  seconds?: number;
  speechAmplitude?: number;
  noiseAmplitude?: number;
  /** Share of each second spent talking. */
  speechDuty?: number;
}

/**
 * A synthetic voice recording.
 *
 * Speech-shaped rather than a pure tone — bursts of energy over a room-noise
 * floor — so the quality checks are exercised for the reasons they exist rather
 * than passing by accident. The noise is a seeded LCG so a test that only just
 * clears a threshold clears it every run.
 */
export function fakeVoiceRecording(options: RecordingOptions = {}): Buffer {
  const {
    seconds = 62,
    speechAmplitude = 6000,
    noiseAmplitude = 40,
    speechDuty = 0.8,
  } = options;

  const total = Math.round(seconds * SAMPLE_RATE);
  const samples = new Int16Array(total);

  let seed = 987_654_321;
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };

  for (let index = 0; index < total; index += 1) {
    const talking = (index % SAMPLE_RATE) / SAMPLE_RATE < speechDuty;
    const voice = talking
      ? Math.sin((2 * Math.PI * 180 * index) / SAMPLE_RATE) * speechAmplitude
      : 0;
    samples[index] = Math.max(
      -32_768,
      Math.min(32_767, Math.round(voice + random() * 2 * noiseAmplitude)),
    );
  }

  return encodeWav(samples, SAMPLE_RATE);
}
