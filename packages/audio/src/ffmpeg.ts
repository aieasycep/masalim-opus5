import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

/**
 * ffmpeg and ffprobe come from npm rather than the host.
 *
 * The API runs in a container the deployment does not necessarily control, and
 * a voice recording failing because a base image shipped without ffmpeg is not
 * a failure a parent should ever see.
 */
export const FFMPEG_PATH: string = ffmpegPath ?? 'ffmpeg';
export const FFPROBE_PATH: string = ffprobeStatic.path;

export class AudioToolError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
    readonly exitCode: number | null,
  ) {
    super(message);
    this.name = 'AudioToolError';
  }
}

export interface RunOptions {
  /** Bytes fed to the process on stdin. */
  stdin?: Buffer;
  /** Hard limit; a hung encoder must not hold a worker slot forever. */
  timeoutMs?: number;
  /** Cap on captured stdout, so a bad argument cannot exhaust memory. */
  maxOutputBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

export async function run(
  binary: string,
  args: string[],
  options: RunOptions = {},
): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new AudioToolError(`${path.basename(binary)} timed out`, stderr, null));
    }, timeoutMs);

    const finish = (error: Error | null, value?: Buffer): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? Buffer.alloc(0));
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxOutputBytes) {
        child.kill('SIGKILL');
        finish(new AudioToolError('output exceeded the size limit', stderr, null));
        return;
      }
      stdout.push(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      // ffmpeg is verbose; only the tail is useful in a log line.
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4000);
    });

    child.on('error', (error) => {
      finish(new AudioToolError(`${path.basename(binary)} failed to start`, String(error), null));
    });

    child.on('close', (code) => {
      if (code === 0) {
        finish(null, Buffer.concat(stdout));
        return;
      }
      finish(
        new AudioToolError(`${path.basename(binary)} exited with ${String(code)}`, stderr, code),
      );
    });

    if (options.stdin) {
      child.stdin.on('error', () => undefined);
      child.stdin.end(options.stdin);
    } else {
      child.stdin.end();
    }
  });
}

/**
 * Writes buffers to a scratch directory for the duration of one call.
 *
 * Container formats such as m4a keep their index at the end of the file, so
 * ffmpeg has to seek and cannot read them from a pipe. Everything is cleaned up
 * even when the work throws.
 */
export async function withTempFiles<T>(
  files: Array<{ name: string; data: Buffer }>,
  work: (paths: string[], directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(path.join(tmpdir(), 'masalim-audio-'));
  try {
    const paths = await Promise.all(
      files.map(async (file) => {
        const target = path.join(directory, file.name);
        await writeFile(target, file.data);
        return target;
      }),
    );
    return await work(paths, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
