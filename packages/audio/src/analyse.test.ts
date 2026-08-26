import { describe, expect, it } from 'vitest';
import { analyseVoiceSample } from './analyse';
import { encodeWav } from './wav';

const SAMPLE_RATE = 16_000;

/**
 * Builds a sample that behaves like speech: bursts of energy separated by
 * pauses, over a constant room-noise floor. A pure tone would sail through every
 * check the analyser makes and prove nothing.
 */
function synthesise(options: {
  seconds: number;
  speechAmplitude: number;
  noiseAmplitude: number;
  /** Share of each second spent talking. */
  speechDuty?: number;
}): Buffer {
  const { seconds, speechAmplitude, noiseAmplitude, speechDuty = 0.8 } = options;
  const total = Math.round(seconds * SAMPLE_RATE);
  const samples = new Int16Array(total);

  // Deterministic pseudo-noise: a seeded LCG, so a threshold that only just
  // passes cannot pass on one run and fail on the next.
  let seed = 12345;
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };

  for (let index = 0; index < total; index += 1) {
    const positionInSecond = (index % SAMPLE_RATE) / SAMPLE_RATE;
    const talking = positionInSecond < speechDuty;
    const voice = talking
      ? Math.sin((2 * Math.PI * 180 * index) / SAMPLE_RATE) * speechAmplitude
      : 0;
    const noise = random() * 2 * noiseAmplitude;
    samples[index] = Math.max(-32_768, Math.min(32_767, Math.round(voice + noise)));
  }

  return encodeWav(samples, SAMPLE_RATE);
}

describe('voice sample analysis', () => {
  it('accepts a clear sixty-second reading', async () => {
    const report = await analyseVoiceSample(
      synthesise({ seconds: 60, speechAmplitude: 6000, noiseAmplitude: 40 }),
      '.wav',
    );

    expect(report.issue).toBeNull();
    expect(report.acceptable).toBe(true);
    expect(report.metrics.durationSeconds).toBeGreaterThan(59);
    expect(report.metrics.snrDb).toBeGreaterThan(12);
    expect(report.metadata.codec).toBe('pcm_s16le');
  });

  it('rejects a recording that stops early', async () => {
    const report = await analyseVoiceSample(
      synthesise({ seconds: 20, speechAmplitude: 6000, noiseAmplitude: 40 }),
      '.wav',
    );
    expect(report.issue).toBe('AUDIO_TOO_SHORT');
  });

  it('rejects a recording that runs past the limit', async () => {
    const report = await analyseVoiceSample(
      synthesise({ seconds: 130, speechAmplitude: 6000, noiseAmplitude: 40 }),
      '.wav',
    );
    expect(report.issue).toBe('AUDIO_TOO_LONG');
  });

  it('rejects a voice held too far from the microphone', async () => {
    const report = await analyseVoiceSample(
      synthesise({ seconds: 60, speechAmplitude: 350, noiseAmplitude: 20 }),
      '.wav',
    );
    expect(report.issue).toBe('AUDIO_TOO_QUIET');
    expect(report.metrics.speechRmsDbfs).toBeLessThan(-34);
  });

  it('rejects a recording that is mostly pauses', async () => {
    const report = await analyseVoiceSample(
      synthesise({
        seconds: 60,
        speechAmplitude: 6000,
        noiseAmplitude: 4,
        speechDuty: 0.2,
      }),
      '.wav',
    );
    expect(report.issue).toBe('AUDIO_MOSTLY_SILENT');
  });

  it('rejects a noisy room', async () => {
    const report = await analyseVoiceSample(
      synthesise({ seconds: 60, speechAmplitude: 3000, noiseAmplitude: 2200 }),
      '.wav',
    );
    expect(report.issue).toBe('AUDIO_TOO_NOISY');
    expect(report.metrics.snrDb).toBeLessThan(12);
  });

  it('rejects a file ffmpeg cannot open instead of throwing', async () => {
    const report = await analyseVoiceSample(Buffer.from('this is not audio'), '.wav');
    expect(report.issue).toBe('AUDIO_FILE_CORRUPT');
    expect(report.acceptable).toBe(false);
  });

  it('reads m4a, which is what the phones actually record', async () => {
    // Encoded from the same synthetic speech, so only the container differs.
    const { transcodeToM4a } = await import('./test-support');
    const m4a = await transcodeToM4a(
      synthesise({ seconds: 60, speechAmplitude: 6000, noiseAmplitude: 40 }),
    );
    const report = await analyseVoiceSample(m4a, '.m4a');

    expect(report.issue).toBeNull();
    expect(report.metadata.codec).toBe('aac');
  });
});
