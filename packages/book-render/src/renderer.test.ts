import { afterAll, describe, expect, it } from 'vitest';
import { buildBookHtml } from './template';
import { closeRenderer, renderBookPdf } from './renderer';
import { toDataUri } from './data-uri';
import { BLEED_MM, BOOK_TRIM_MM, type RenderableBook } from './types';

/** A 1×1 lavender PNG, enough to prove images are embedded and drawn. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

function book(overrides: Partial<RenderableBook> = {}): RenderableBook {
  return {
    title: 'Ege ve Kayıp Yıldız',
    subtitle: 'Bir gece masalı',
    dedication: 'Ege için, her gece.',
    backCoverText: 'Yıldızlar kaybolduğunda, birisi onları aramaya gider.',
    coverImageSrc: toDataUri(PIXEL, 'image/png'),
    childName: 'Ege',
    createdAtLabel: '14 Ağustos 2026',
    pages: [
      {
        pageNumber: 1,
        text: 'Ege o akşam pencereden dışarı baktı.\n\nGökyüzü her zamankinden başkaydı.',
        layout: 'IMAGE_TOP_TEXT_BOTTOM',
        imageSrc: toDataUri(PIXEL, 'image/png'),
      },
      {
        pageNumber: 2,
        text: 'Küçük bir ışık, tam orada duruyordu.',
        layout: 'IMAGE_FULL_TEXT_OVERLAY',
        imageSrc: toDataUri(PIXEL, 'image/png'),
      },
      {
        pageNumber: 3,
        text: 'Ege gülümsedi. İyi geceler, Ege.',
        layout: 'TEXT_ONLY',
        imageSrc: null,
      },
    ],
    ...overrides,
  };
}

describe('book html', () => {
  it('escapes text rather than letting it become markup', () => {
    const html = buildBookHtml(
      book({ dedication: '<script>alert(1)</script> & "sevgiyle"' }),
      { bookSize: 'SQUARE', target: 'preview' },
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  it('sizes the page in millimetres, with bleed only for print', () => {
    const trim = BOOK_TRIM_MM.SQUARE;

    const preview = buildBookHtml(book(), { bookSize: 'SQUARE', target: 'preview' });
    expect(preview).toContain(`size: ${trim.width}mm ${trim.height}mm`);

    const print = buildBookHtml(book(), { bookSize: 'SQUARE', target: 'print' });
    expect(print).toContain(
      `size: ${trim.width + BLEED_MM * 2}mm ${trim.height + BLEED_MM * 2}mm`,
    );
  });

  it('renders a page per story page plus cover, dedication and back cover', () => {
    const html = buildBookHtml(book(), { bookSize: 'STANDARD', target: 'preview' });
    const pages = html.match(/class="page[ "]/g) ?? [];
    expect(pages).toHaveLength(3 + 3);
  });
});

describe('pdf rendering', () => {
  afterAll(async () => {
    await closeRenderer();
  });

  it('produces a real PDF at the requested trim size', async () => {
    const result = await renderBookPdf(book(), { bookSize: 'SQUARE', target: 'preview' });

    expect(result.pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(result.pdf.byteLength).toBeGreaterThan(1000);
    expect(result.pageCount).toBe(6);
    expect(result.widthMm).toBe(BOOK_TRIM_MM.SQUARE.width);
  });

  it('adds bleed on every edge for the print target', async () => {
    const result = await renderBookPdf(book(), { bookSize: 'STANDARD', target: 'print' });

    expect(result.widthMm).toBe(BOOK_TRIM_MM.STANDARD.width + BLEED_MM * 2);
    expect(result.heightMm).toBe(BOOK_TRIM_MM.STANDARD.height + BLEED_MM * 2);
    expect(result.pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('renders a book whose pages have no illustrations yet', async () => {
    const result = await renderBookPdf(
      book({
        coverImageSrc: null,
        pages: [{ pageNumber: 1, text: 'Tek sayfa.', layout: 'TEXT_ONLY', imageSrc: null }],
      }),
      { bookSize: 'SQUARE', target: 'preview' },
    );

    expect(result.pageCount).toBe(4);
  });
});
