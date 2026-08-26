import { describe, expect, it } from 'vitest';
import { concatenateAudio, transcodeToMp3 } from './concat';
import { probeAudio } from './probe';
import { encodeWav } from './wav';

const SAMPLE_RATE = 22_050;

function tone(seconds: number, frequency: number): Buffer {
  const total = Math.round(seconds * SAMPLE_RATE);
  const samples = new Int16Array(total);
  for (let index = 0; index < total; index += 1) {
    samples[index] = Math.round(
      Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE) * 8000,
    );
  }
  return encodeWav(samples, SAMPLE_RATE);
}

describe('narration assembly', () => {
  it('joins chunks into one file and reports where each one starts', async () => {
    const parts = [
      { data: tone(2, 220), extension: '.wav' },
      { data: tone(3, 330), extension: '.wav' },
      { data: tone(1.5, 440), extension: '.wav' },
    ];

    const result = await concatenateAudio(parts);

    expect(result.contentType).toBe('audio/mpeg');
    expect(result.offsets).toHaveLength(3);
    expect(result.offsets[0]).toBe(0);
    expect(result.offsets[1]).toBeCloseTo(2, 1);
    expect(result.offsets[2]).toBeCloseTo(5, 1);

    // The joined file must actually contain all of the audio, not just the
    // first chunk — an encoder that silently drops inputs would still return a
    // playable file.
    const probed = await probeAudio(result.data, '.mp3');
    expect(probed.durationSeconds).toBeGreaterThan(6.3);
    expect(probed.durationSeconds).toBeLessThan(7.0);
    expect(probed.codec).toBe('mp3');
  });

  it('refuses an empty part list rather than writing a zero-length narration', async () => {
    await expect(concatenateAudio([])).rejects.toThrow(/empty/);
  });

  it('transcodes a single chunk to the narration format', async () => {
    const mp3 = await transcodeToMp3(tone(1, 440), '.wav');
    const probed = await probeAudio(mp3, '.mp3');
    expect(probed.codec).toBe('mp3');
    expect(probed.channels).toBe(1);
  });
});
