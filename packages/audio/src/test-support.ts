import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { FFMPEG_PATH, run, withTempFiles } from './ffmpeg';

/**
 * Encodes a WAV buffer as AAC in an MP4 container — what iOS and Android
 * actually hand back from `expo-audio`. Test support only; the application never
 * produces m4a itself.
 */
export async function transcodeToM4a(wav: Buffer): Promise<Buffer> {
  return withTempFiles([{ name: 'input.wav', data: wav }], async ([input], directory) => {
    if (!input) throw new Error('temporary file was not created');
    const outputPath = path.join(directory, 'output.m4a');
    await run(
      FFMPEG_PATH,
      ['-v', 'error', '-i', input, '-c:a', 'aac', '-b:a', '128k', '-y', outputPath],
      { timeoutMs: 120_000 },
    );
    return readFile(outputPath);
  });
}
