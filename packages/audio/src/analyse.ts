import { VOICE_RECORDING } from '@masalim/types';
import { FFMPEG_PATH, run, withTempFiles } from './ffmpeg';
import { probeAudio, UnreadableAudioError, type AudioMetadata } from './probe';

/** Analysis sample rate. Speech energy lives well below 8 kHz, so 16 kHz is plenty. */
const ANALYSIS_SAMPLE_RATE = 16_000;
/** 20 ms frames — long enough to be stable, short enough to see pauses. */
const FRAME_MS = 20;
const FRAME_SAMPLES = (ANALYSIS_SAMPLE_RATE * FRAME_MS) / 1000;
/** Samples at or above this magnitude are treated as clipped (≈ −0.3 dBFS). */
const CLIP_THRESHOLD = 31_700;
/** A frame quieter than this counts as silence. */
const SILENCE_DBFS = -50;
const FULL_SCALE = 32_768;
/** Reported when a frame holds no energy at all; keeps the maths finite. */
const DIGITAL_SILENCE_DBFS = -120;

export interface AudioQualityMetrics {
  durationSeconds: number;
  /** Loudness of the speech itself, ignoring the pauses between sentences. */
  speechRmsDbfs: number;
  /** Loudness of the room when nobody is talking. */
  noiseFloorDbfs: number;
  peakDbfs: number;
  snrDb: number;
  clippingRatio: number;
  silenceRatio: number;
}

export type AudioQualityIssue =
  | 'AUDIO_FILE_CORRUPT'
  | 'AUDIO_TOO_SHORT'
  | 'AUDIO_TOO_LONG'
  | 'AUDIO_TOO_QUIET'
  | 'AUDIO_MOSTLY_SILENT'
  | 'AUDIO_CLIPPED'
  | 'AUDIO_TOO_NOISY';

export interface AudioQualityReport {
  acceptable: boolean;
  /** The single issue worth telling the parent about, most blocking first. */
  issue: AudioQualityIssue | null;
  metrics: AudioQualityMetrics;
  metadata: AudioMetadata;
}

function toDbfs(amplitude: number): number {
  if (amplitude <= 0) return DIGITAL_SILENCE_DBFS;
  return Math.max(DIGITAL_SILENCE_DBFS, 20 * Math.log10(amplitude / FULL_SCALE));
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return DIGITAL_SILENCE_DBFS;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
  return sorted[index] ?? DIGITAL_SILENCE_DBFS;
}

/** Decodes to mono 16-bit PCM so the metrics do not depend on the container. */
async function decodeToPcm(data: Buffer, extensionHint: string): Promise<Int16Array> {
  const raw = await withTempFiles(
    [{ name: `input${extensionHint}`, data }],
    async ([input]) => {
      if (!input) throw new UnreadableAudioError('temporary file was not created');
      return run(
        FFMPEG_PATH,
        [
          '-v',
          'error',
          '-i',
          input,
          '-ac',
          '1',
          '-ar',
          String(ANALYSIS_SAMPLE_RATE),
          '-f',
          's16le',
          '-',
        ],
        { timeoutMs: 60_000 },
      );
    },
  );

  // A trailing odd byte would misalign every sample after it.
  const usableBytes = raw.length - (raw.length % 2);
  return new Int16Array(raw.buffer, raw.byteOffset, usableBytes / 2);
}

/**
 * Grades a voice sample.
 *
 * The point is to fail *before* the clone rather than after: a parent who reads
 * sixty seconds aloud and is then told the room was too noisy has wasted their
 * evening, and a bad sample produces a clone that sounds nothing like them.
 *
 * The noise floor and the speech level are read from the distribution of frame
 * energies rather than from a global average — an average over a recording that
 * is half pauses reports neither the voice nor the room.
 */
export async function analyseVoiceSample(
  data: Buffer,
  extensionHint = '.bin',
): Promise<AudioQualityReport> {
  let metadata: AudioMetadata;
  let samples: Int16Array;

  try {
    metadata = await probeAudio(data, extensionHint);
    samples = await decodeToPcm(data, extensionHint);
  } catch {
    return {
      acceptable: false,
      issue: 'AUDIO_FILE_CORRUPT',
      metrics: {
        durationSeconds: 0,
        speechRmsDbfs: DIGITAL_SILENCE_DBFS,
        noiseFloorDbfs: DIGITAL_SILENCE_DBFS,
        peakDbfs: DIGITAL_SILENCE_DBFS,
        snrDb: 0,
        clippingRatio: 0,
        silenceRatio: 1,
      },
      metadata: {
        durationSeconds: 0,
        codec: 'unknown',
        sampleRate: 0,
        channels: 0,
        bitRate: null,
        formatName: 'unknown',
      },
    };
  }

  const metrics = measure(samples);
  const issue = firstIssue(metrics);

  return { acceptable: issue === null, issue, metrics, metadata };
}

export function measure(samples: Int16Array): AudioQualityMetrics {
  const frameDbfs: number[] = [];
  let peak = 0;
  let clipped = 0;

  for (let start = 0; start + FRAME_SAMPLES <= samples.length; start += FRAME_SAMPLES) {
    let sumSquares = 0;
    for (let offset = 0; offset < FRAME_SAMPLES; offset += 1) {
      const value = samples[start + offset] ?? 0;
      const magnitude = Math.abs(value);
      if (magnitude > peak) peak = magnitude;
      if (magnitude >= CLIP_THRESHOLD) clipped += 1;
      sumSquares += value * value;
    }
    frameDbfs.push(toDbfs(Math.sqrt(sumSquares / FRAME_SAMPLES)));
  }

  const durationSeconds = samples.length / ANALYSIS_SAMPLE_RATE;

  if (frameDbfs.length === 0) {
    return {
      durationSeconds,
      speechRmsDbfs: DIGITAL_SILENCE_DBFS,
      noiseFloorDbfs: DIGITAL_SILENCE_DBFS,
      peakDbfs: toDbfs(peak),
      snrDb: 0,
      clippingRatio: 0,
      silenceRatio: 1,
    };
  }

  const sorted = [...frameDbfs].sort((a, b) => a - b);
  // The 10th percentile is the room between words; the 90th is the voice at
  // its normal reading level, past the peaks of individual consonants.
  const noiseFloorDbfs = percentile(sorted, 0.1);
  const speechRmsDbfs = percentile(sorted, 0.9);
  const silentFrames = frameDbfs.filter((value) => value < SILENCE_DBFS).length;

  return {
    durationSeconds,
    speechRmsDbfs,
    noiseFloorDbfs,
    peakDbfs: toDbfs(peak),
    snrDb: Math.max(0, speechRmsDbfs - noiseFloorDbfs),
    clippingRatio: clipped / Math.max(1, samples.length),
    silenceRatio: silentFrames / frameDbfs.length,
  };
}

/**
 * Ordered so the parent is told the one thing they can most usefully act on.
 * Length first (they have to re-record either way), then the problems that have
 * a clear fix — move somewhere quieter, hold the phone further away.
 */
function firstIssue(metrics: AudioQualityMetrics): AudioQualityIssue | null {
  if (metrics.durationSeconds < VOICE_RECORDING.MIN_SECONDS) return 'AUDIO_TOO_SHORT';
  if (metrics.durationSeconds > VOICE_RECORDING.MAX_SECONDS) return 'AUDIO_TOO_LONG';
  if (metrics.silenceRatio > VOICE_RECORDING.MAX_SILENCE_RATIO) return 'AUDIO_MOSTLY_SILENT';
  if (metrics.speechRmsDbfs < VOICE_RECORDING.MIN_RMS_DBFS) return 'AUDIO_TOO_QUIET';
  if (metrics.clippingRatio > VOICE_RECORDING.MAX_CLIPPING_RATIO) return 'AUDIO_CLIPPED';
  if (metrics.snrDb < VOICE_RECORDING.MIN_SNR_DB) return 'AUDIO_TOO_NOISY';
  return null;
}
