import {
  ProviderError,
  type ClonedVoice,
  type CreateVoiceInput,
  type ProviderResult,
  type SpeechInput,
  type SynthesisedSpeech,
  type TextToSpeechProvider,
  type VoiceCloneProvider,
} from '../../types';
import { estimateSpeechSeconds } from '../mock/mock-speech';

const API_BASE = 'https://api.elevenlabs.io/v1';

export interface ElevenLabsOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

async function elevenLabsRequest(
  path: string,
  apiKey: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'xi-api-key': apiKey, ...(init.headers ?? {}) },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw mapStatus(response.status, body);
    }
    return response;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError('ElevenLabs request timed out', 'timeout', { cause: error });
    }
    throw new ProviderError('ElevenLabs request failed', 'unknown', { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

function mapStatus(status: number, body: string): ProviderError {
  // The body can quote the parent's text back; truncate so it cannot flood logs.
  const detail = body.slice(0, 300);
  if (status === 429) {
    return new ProviderError(`ElevenLabs rate limit: ${detail}`, 'rate_limited');
  }
  if (status === 401 || status === 403) {
    return new ProviderError('ElevenLabs rejected the API key', 'unauthorized');
  }
  // Distinguished from 'unknown' because a delete that 404s has already
  // achieved what it was asked to do, and a caller cleaning up a voice needs to
  // tell that apart from a socket reset — which also arrives here as an error
  // with no retryable flag, and must not be mistaken for success.
  if (status === 404) {
    return new ProviderError(`ElevenLabs: no such resource: ${detail}`, 'not_found');
  }
  if (status >= 500) {
    return new ProviderError(`ElevenLabs unavailable: ${detail}`, 'unavailable');
  }
  return new ProviderError(`ElevenLabs error ${status}: ${detail}`, 'unknown');
}

/**
 * Text to speech via ElevenLabs.
 *
 * `previous_text` and `next_text` are what make a long story sound like one
 * reading rather than a series of clips: the model uses the neighbouring text
 * to carry intonation across a chunk boundary.
 */
export class ElevenLabsTextToSpeechProvider implements TextToSpeechProvider {
  readonly name = 'elevenlabs';
  readonly maxCharactersPerRequest = 4_000;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: ElevenLabsOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 180_000;
  }

  async synthesise(input: SpeechInput): Promise<ProviderResult<SynthesisedSpeech>> {
    const startedAt = Date.now();

    const response = await elevenLabsRequest(
      `/text-to-speech/${encodeURIComponent(input.providerVoiceId)}`,
      this.apiKey,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({
          text: input.text,
          model_id: this.model,
          language_code: input.language,
          ...(input.previousText ? { previous_text: input.previousText } : {}),
          ...(input.nextText ? { next_text: input.nextText } : {}),
          voice_settings: {
            // Tuned for bedtime reading: high stability keeps the delivery calm
            // and even rather than theatrical.
            stability: 0.55,
            similarity_boost: 0.8,
            style: 0.15,
            use_speaker_boost: true,
          },
        }),
      },
      this.timeoutMs,
    );

    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.byteLength === 0) {
      throw new ProviderError('ElevenLabs returned empty audio', 'invalid_response');
    }

    return {
      data: {
        audio,
        contentType: 'audio/mpeg',
        // The API does not report duration; it is measured precisely later when
        // the chunks are concatenated. This estimate only drives progress.
        durationSeconds: estimateSpeechSeconds(input.text),
      },
      usage: {
        provider: this.name,
        model: this.model,
        characters: input.text.length,
        audioSeconds: Math.round(estimateSpeechSeconds(input.text)),
        latencyMs: Date.now() - startedAt,
      },
    };
  }
}

/**
 * Parent voice cloning via ElevenLabs Instant Voice Cloning.
 *
 * `deleteVoice` is not optional housekeeping: when a parent deletes their voice
 * it must disappear from the provider too, not merely from our database.
 */
export class ElevenLabsVoiceCloneProvider implements VoiceCloneProvider {
  readonly name = 'elevenlabs';

  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: Omit<ElevenLabsOptions, 'model'>) {
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 180_000;
  }

  async createVoice(input: CreateVoiceInput): Promise<ProviderResult<ClonedVoice>> {
    const startedAt = Date.now();

    const form = new FormData();
    form.append('name', input.displayName);
    form.append(
      'files',
      new Blob([new Uint8Array(input.sample)], { type: input.sampleContentType }),
      'sample.m4a',
    );
    form.append(
      'description',
      'Masalım parent narrator voice, created with explicit consent.',
    );

    const response = await elevenLabsRequest(
      '/voices/add',
      this.apiKey,
      { method: 'POST', body: form },
      this.timeoutMs,
    );

    const body = (await response.json()) as { voice_id?: string };
    if (!body.voice_id) {
      throw new ProviderError('ElevenLabs did not return a voice id', 'invalid_response');
    }

    return {
      data: { providerVoiceId: body.voice_id, status: 'ready' },
      usage: {
        provider: this.name,
        model: 'instant-voice-cloning',
        audioSeconds: Math.round(input.sample.byteLength / 32_000),
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  async deleteVoice(providerVoiceId: string): Promise<void> {
    await elevenLabsRequest(
      `/voices/${encodeURIComponent(providerVoiceId)}`,
      this.apiKey,
      { method: 'DELETE' },
      this.timeoutMs,
    );
  }

  async getStatus(providerVoiceId: string): Promise<ClonedVoice['status']> {
    await elevenLabsRequest(
      `/voices/${encodeURIComponent(providerVoiceId)}`,
      this.apiKey,
      { method: 'GET' },
      this.timeoutMs,
    );
    // Instant cloning is synchronous: a voice that can be fetched is usable.
    return 'ready';
  }
}
