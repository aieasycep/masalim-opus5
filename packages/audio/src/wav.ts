/**
 * Minimal WAV writer.
 *
 * Used by tests and by the mock speech provider so the local pipeline moves real
 * decodable audio rather than a placeholder buffer — a file that ffmpeg refuses
 * to open would make every quality check pass or fail for the wrong reason.
 */
export function encodeWav(samples: Int16Array, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  const dataBytes = samples.length * 2;

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format: PCM
  header.writeUInt16LE(1, 22); // channels: mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataBytes, 40);

  const body = Buffer.alloc(dataBytes);
  for (let index = 0; index < samples.length; index += 1) {
    body.writeInt16LE(samples[index] ?? 0, index * 2);
  }

  return Buffer.concat([header, body]);
}
