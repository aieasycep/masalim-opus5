import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import type {
  GeneratedImage,
  ImageGenerationInput,
  ImageGenerationProvider,
  ProviderResult,
} from '../../types';

/** Minimal PNG encoder — enough for a real, viewable image with no dependencies. */
function encodePng(width: number, height: number, rgb: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filter type: none
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = rgb(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      offset += 3;
    }
  }

  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([length, typeAndData, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] as number);
  }
  return (crc ^ -1) >>> 0;
}

/** Style palettes, so a watercolour set looks different from a pastel one. */
const STYLE_PALETTES: Record<string, Array<[number, number, number]>> = {
  watercolor: [
    [212, 200, 240],
    [176, 156, 224],
    [245, 196, 168],
  ],
  soft3d: [
    [184, 216, 232],
    [123, 167, 201],
    [255, 217, 125],
  ],
  classic_storybook: [
    [250, 248, 244],
    [232, 224, 212],
    [124, 92, 191],
  ],
  pastel: [
    [255, 249, 242],
    [197, 223, 200],
    [245, 196, 168],
  ],
  hand_drawn: [
    [237, 232, 248],
    [141, 184, 154],
    [240, 139, 110],
  ],
};

/**
 * Image generation without a provider.
 *
 * Emits a real PNG — a soft gradient in the chosen style's palette, seeded by
 * the prompt so the same page always yields the same picture. That means the
 * book builder, digital reader and print renderer all have genuine images to
 * lay out, rather than a placeholder that hides layout bugs until launch.
 */
export class MockImageProvider implements ImageGenerationProvider {
  readonly name = 'mock';
  /** The mock accepts a reference image so the consistency path is exercised. */
  readonly supportsReferenceImages = true;

  async generateImage(
    input: ImageGenerationInput,
  ): Promise<ProviderResult<GeneratedImage>> {
    const startedAt = Date.now();

    const seed = createHash('sha256').update(input.prompt).digest();
    const palette = STYLE_PALETTES[input.style] ?? STYLE_PALETTES.watercolor;
    const colours = palette as Array<[number, number, number]>;

    const width = input.aspect === 'square' ? 512 : 640;
    const height = input.aspect === 'square' ? 512 : 480;

    const offsetX = (seed[0] ?? 0) / 255;
    const offsetY = (seed[1] ?? 0) / 255;
    const swirl = 1 + ((seed[2] ?? 0) / 255) * 3;

    const png = encodePng(width, height, (x, y) => {
      const nx = x / width;
      const ny = y / height;
      const wave =
        (Math.sin((nx + offsetX) * Math.PI * swirl) +
          Math.cos((ny + offsetY) * Math.PI * swirl)) /
        2;
      const t = (wave + 1) / 2;

      const index = Math.min(colours.length - 1, Math.floor(t * colours.length));
      const next = Math.min(colours.length - 1, index + 1);
      const local = t * colours.length - index;

      const from = colours[index] as [number, number, number];
      const to = colours[next] as [number, number, number];
      return [
        Math.round(from[0] + (to[0] - from[0]) * local),
        Math.round(from[1] + (to[1] - from[1]) * local),
        Math.round(from[2] + (to[2] - from[2]) * local),
      ];
    });

    return {
      data: {
        data: png,
        contentType: 'image/png',
        seed: seed.subarray(0, 8).toString('hex'),
      },
      usage: {
        provider: this.name,
        model: 'mock-image-v1',
        imageCount: 1,
        latencyMs: Date.now() - startedAt,
      },
    };
  }
}
