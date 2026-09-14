import { createHash, randomUUID } from 'node:crypto';
import { TURKISH_NARRATION_WORDS_PER_MINUTE } from '@masalim/types';
import type {
  ClonedVoice,
  CreateVoiceInput,
  ProviderResult,
  SpeechInput,
  SynthesisedSpeech,
  TextToSpeechProvider,
  VoiceCloneProvider,
} from '../../types';

/**
 * Builds a playable WAV.
 *
 * A silent or zero-length buffer would let real bugs hide: the audio player,
 * the duration display, the concatenation step and the progress bar all behave
 * differently on a file that actually decodes. This emits a quiet, gently
 * modulated tone of the correct duration so every one of those is exercised.
 */
function encodeWav(durationSeconds: number, seed: Buffer): Buffer {
  const sampleRate = 22_050;
  const sampleCount = Math.max(1, Math.round(durationSeconds * sampleRate));
  const bytesPerSample = 2;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + sampleCount * bytesPerSample, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * bytesPerSample, 28);
  header.writeUInt16LE(bytesPerSample, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(sampleCount * bytesPerSample, 40);

  const samples = Buffer.alloc(sampleCount * bytesPerSample);
  // A low, soft tone — audible enough to confirm playback, quiet enough not to
  // startle anyone testing at night.
  const baseFrequency = 150 + ((seed[0] ?? 0) / 255) * 80;
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleRate;
    const envelope = Math.min(1, t * 4) * Math.min(1, (durationSeconds - t) * 4);
    const value =
      Math.sin(2 * Math.PI * baseFrequency * t) * 0.18 * Math.max(0, envelope) +
      Math.sin(2 * Math.PI * baseFrequency * 2 * t) * 0.05 * Math.max(0, envelope);
    samples.writeInt16LE(Math.round(value * 32767), index * bytesPerSample);
  }

  return Buffer.concat([header, samples]);
}

/** Estimated spoken duration for Turkish text at a calm bedtime pace. */
export function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, (words / TURKISH_NARRATION_WORDS_PER_MINUTE) * 60);
}

export class MockTextToSpeechProvider implements TextToSpeechProvider {
  readonly name = 'mock';
  /** Mirrors ElevenLabs' practical limit so chunking is exercised identically. */
  readonly maxCharactersPerRequest = 4_000;

  async synthesise(input: SpeechInput): Promise<ProviderResult<SynthesisedSpeech>> {
    const startedAt = Date.now();
    const durationSeconds = estimateSpeechSeconds(input.text);
    const seed = createHash('sha256')
      .update(`${input.providerVoiceId}:${input.text}`)
      .digest();

    return {
      data: {
        audio: encodeWav(durationSeconds, seed),
        contentType: 'audio/wav',
        durationSeconds,
      },
      usage: {
        provider: this.name,
        model: 'mock-tts-v1',
        characters: input.text.length,
        audioSeconds: Math.round(durationSeconds),
        latencyMs: Date.now() - startedAt,
      },
    };
  }
}

/**
 * Voice cloning without a provider.
 *
 * Returns immediately with a ready voice, but still records the sample length
 * so quality control upstream has something real to reject or accept.
 */
export class MockVoiceCloneProvider implements VoiceCloneProvider {
  readonly name = 'mock';
  private readonly voices = new Map<string, ClonedVoice['status']>();

  async createVoice(input: CreateVoiceInput): Promise<ProviderResult<ClonedVoice>> {
    const startedAt = Date.now();
    const providerVoiceId = `mock-voice-${randomUUID()}`;
    this.voices.set(providerVoiceId, 'ready');

    return {
      data: { providerVoiceId, status: 'ready' },
      usage: {
        provider: this.name,
        model: 'mock-voice-clone-v1',
        audioSeconds: Math.round(input.sample.byteLength / (22_050 * 2)),
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  async deleteVoice(providerVoiceId: string): Promise<void> {
    this.voices.delete(providerVoiceId);
  }

  async getStatus(providerVoiceId: string): Promise<ClonedVoice['status']> {
    return this.voices.get(providerVoiceId) ?? 'ready';
  }

  /** Test helper: confirms a delete actually reached the provider. */
  hasVoice(providerVoiceId: string): boolean {
    return this.voices.has(providerVoiceId);
  }
}
