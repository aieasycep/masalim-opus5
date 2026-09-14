import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FFMPEG_PATH, run, withTempFiles } from './ffmpeg';
import { probeAudio } from './probe';

export interface ConcatenatedAudio {
  data: Buffer;
  contentType: string;
  durationSeconds: number;
  /** Where each input starts in the finished file, in seconds. */
  offsets: number[];
}

const OUTPUT_BITRATE = '96k';
const OUTPUT_SAMPLE_RATE = '44100';

/**
 * Joins the synthesised chunks into one narration.
 *
 * A long story exceeds what any TTS provider will render in a single request, so
 * it is synthesised in pieces — but a parent must hear one continuous reading,
 * and the player must be able to seek across the whole story. The pieces are
 * re-encoded rather than stream-copied: concatenating MP3 frames directly leaves
 * encoder padding at every seam, which is audible as a click between sentences.
 *
 * The returned offsets are measured from the decoded inputs rather than assumed,
 * because they drive the reader's text highlighting and drift would be visible.
 */
export async function concatenateAudio(
  parts: Array<{ data: Buffer; extension: string }>,
): Promise<ConcatenatedAudio> {
  if (parts.length === 0) {
    throw new Error('cannot concatenate an empty list of audio parts');
  }

  const files = parts.map((part, index) => ({
    name: `part-${String(index).padStart(4, '0')}${part.extension}`,
    data: part.data,
  }));

  const durations = await Promise.all(
    parts.map(async (part) => (await probeAudio(part.data, part.extension)).durationSeconds),
  );

  const offsets: number[] = [];
  let running = 0;
  for (const duration of durations) {
    offsets.push(running);
    running += duration;
  }

  const data = await withTempFiles(files, async (paths, directory) => {
    // The list file is the only concat input that handles arbitrary counts;
    // a filter_complex argument would eventually hit the command-line limit.
    const listPath = path.join(directory, 'parts.txt');
    await writeFile(
      listPath,
      paths.map((filePath) => `file '${filePath.replace(/'/g, "'\\''")}'`).join('\n'),
      'utf8',
    );

    const outputPath = path.join(directory, 'narration.mp3');
    await run(
      FFMPEG_PATH,
      [
        '-v',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-ac',
        '1',
        '-ar',
        OUTPUT_SAMPLE_RATE,
        '-b:a',
        OUTPUT_BITRATE,
        '-y',
        outputPath,
      ],
      { timeoutMs: 300_000 },
    );

    return readFile(outputPath);
  });

  const finished = await probeAudio(data, '.mp3');

  return {
    data,
    contentType: 'audio/mpeg',
    durationSeconds: finished.durationSeconds,
    offsets,
  };
}

/** Re-encodes one buffer to the narration format without joining anything. */
export async function transcodeToMp3(data: Buffer, extension: string): Promise<Buffer> {
  return withTempFiles([{ name: `input${extension}`, data }], async ([input], directory) => {
    if (!input) throw new Error('temporary file was not created');
    const outputPath = path.join(directory, 'output.mp3');
    await run(
      FFMPEG_PATH,
      [
        '-v',
        'error',
        '-i',
        input,
        '-ac',
        '1',
        '-ar',
        OUTPUT_SAMPLE_RATE,
        '-b:a',
        OUTPUT_BITRATE,
        '-y',
        outputPath,
      ],
      { timeoutMs: 120_000 },
    );
    return readFile(outputPath);
  });
}
