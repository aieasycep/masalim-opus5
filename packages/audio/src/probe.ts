import { FFPROBE_PATH, run, withTempFiles } from './ffmpeg';

export interface AudioMetadata {
  durationSeconds: number;
  codec: string;
  sampleRate: number;
  channels: number;
  bitRate: number | null;
  formatName: string;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  sample_rate?: string;
  channels?: number;
  duration?: string;
  bit_rate?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; bit_rate?: string; format_name?: string };
}

export class UnreadableAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableAudioError';
  }
}

/**
 * Reads container and stream metadata.
 *
 * The duration reported here is authoritative: the client sends its own
 * measurement with the upload, but a client value is a claim, and the recording
 * bounds are a real constraint on what can be cloned.
 */
export async function probeAudio(
  data: Buffer,
  extensionHint = '.bin',
): Promise<AudioMetadata> {
  return withTempFiles([{ name: `input${extensionHint}`, data }], async ([input]) => {
    if (!input) throw new UnreadableAudioError('temporary file was not created');

    let raw: Buffer;
    try {
      raw = await run(
        FFPROBE_PATH,
        [
          '-v',
          'error',
          '-print_format',
          'json',
          '-show_format',
          '-show_streams',
          '-i',
          input,
        ],
        { timeoutMs: 20_000, maxOutputBytes: 1024 * 1024 },
      );
    } catch (error) {
      throw new UnreadableAudioError(
        error instanceof Error ? error.message : 'ffprobe failed',
      );
    }

    let parsed: FfprobeOutput;
    try {
      parsed = JSON.parse(raw.toString('utf8')) as FfprobeOutput;
    } catch {
      throw new UnreadableAudioError('ffprobe returned output that is not JSON');
    }

    const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio');
    if (!audio) {
      throw new UnreadableAudioError('file contains no audio stream');
    }

    const duration = Number(audio.duration ?? parsed.format?.duration ?? Number.NaN);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new UnreadableAudioError('audio stream has no usable duration');
    }

    const bitRate = Number(audio.bit_rate ?? parsed.format?.bit_rate ?? Number.NaN);

    return {
      durationSeconds: duration,
      codec: audio.codec_name ?? 'unknown',
      sampleRate: Number(audio.sample_rate ?? 0),
      channels: audio.channels ?? 0,
      bitRate: Number.isFinite(bitRate) ? bitRate : null,
      formatName: parsed.format?.format_name ?? 'unknown',
    };
  });
}
