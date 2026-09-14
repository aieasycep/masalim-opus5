import {
  BLEED_MM,
  BOOK_TRIM_MM,
  SAFE_MARGIN_MM,
  type RenderableBook,
  type RenderablePage,
  type RenderOptions,
} from './types';

/**
 * Escapes text before it becomes markup.
 *
 * The strings here are a parent's dedication and a model's prose. Neither is
 * trusted markup, and this HTML is handed to a real browser engine.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}

function pageMarkup(page: RenderablePage): string {
  const image = page.imageSrc
    ? `<div class="art"><img src="${page.imageSrc}" alt="" /></div>`
    : '<div class="art art--empty"></div>';
  const body = `<div class="prose">${paragraphs(page.text)}</div>`;

  const order =
    page.layout === 'TEXT_ONLY'
      ? body
      : page.layout === 'IMAGE_ONLY'
        ? image
        : page.layout === 'IMAGE_FULL_TEXT_OVERLAY'
          ? `${image}<div class="prose prose--overlay">${paragraphs(page.text)}</div>`
          : `${image}${body}`;

  return `
    <section class="page layout-${page.layout.toLowerCase()}">
      ${order}
      <div class="folio">${page.pageNumber}</div>
    </section>`;
}

/**
 * The whole book as one HTML document.
 *
 * Laid out in millimetres rather than pixels: a printed book has physical
 * dimensions, and letting the browser convert from CSS pixels at some assumed
 * DPI is how a book comes back from the printer three percent too small.
 */
export function buildBookHtml(book: RenderableBook, options: RenderOptions): string {
  const trim = BOOK_TRIM_MM[options.bookSize];
  const isPrint = options.target === 'print';
  const bleed = isPrint ? BLEED_MM : 0;
  const pageWidth = trim.width + bleed * 2;
  const pageHeight = trim.height + bleed * 2;
  const margin = SAFE_MARGIN_MM + bleed;

  const cover = book.coverImageSrc
    ? `<img class="cover-art" src="${book.coverImageSrc}" alt="" />`
    : '<div class="cover-art cover-art--empty"></div>';

  const dedication = book.dedication
    ? `<section class="page page--plate">
         <div class="plate">${paragraphs(book.dedication)}</div>
       </section>`
    : '';

  const backCover = `
    <section class="page page--back">
      ${book.backCoverText ? `<div class="plate">${paragraphs(book.backCoverText)}</div>` : ''}
      <div class="colophon">
        <p>${escapeHtml(book.title)}</p>
        ${book.childName ? `<p>${escapeHtml(book.childName)} için</p>` : ''}
        <p>${escapeHtml(book.createdAtLabel)}</p>
        <p class="mark">Masalım</p>
      </div>
    </section>`;

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(book.title)}</title>
<style>
  @page {
    size: ${pageWidth}mm ${pageHeight}mm;
    margin: 0;
  }

  :root {
    --ink: #2C2825;
    --paper: #FAF8F4;
    --muted: #8A7D72;
    --accent: #7C5CBF;
    --trim: ${bleed}mm;
    --margin: ${margin}mm;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: var(--paper);
    color: var(--ink);
    /* Fraunces and Nunito are not guaranteed inside a headless browser, so the
       stack degrades to serif/sans rather than silently to a metric-different
       default that would reflow the page count. */
    font-family: 'Nunito', 'Helvetica Neue', Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    position: relative;
    width: ${pageWidth}mm;
    height: ${pageHeight}mm;
    padding: var(--margin);
    page-break-after: always;
    break-after: page;
    display: flex;
    flex-direction: column;
    gap: 6mm;
    overflow: hidden;
    background: var(--paper);
  }

  .page:last-child { page-break-after: auto; break-after: auto; }

  .art {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4mm;
    overflow: hidden;
    background: #F2EDE6;
  }

  .art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .art--empty { background: #EDE8F8; }

  .prose {
    flex: 0 0 auto;
    font-size: 5.2mm;
    line-height: 1.55;
    letter-spacing: 0.01em;
  }

  .prose p { margin: 0 0 3mm; }
  .prose p:last-child { margin-bottom: 0; }

  .prose--overlay {
    position: absolute;
    left: var(--margin);
    right: var(--margin);
    bottom: var(--margin);
    padding: 5mm;
    border-radius: 3mm;
    background: rgba(250, 248, 244, 0.88);
  }

  .layout-image_only .prose,
  .layout-text_only .art { display: none; }

  .layout-image_full_text_overlay { padding: 0; }
  .layout-image_full_text_overlay .art { border-radius: 0; height: 100%; }

  .folio {
    position: absolute;
    bottom: calc(var(--trim) + 5mm);
    right: calc(var(--trim) + 8mm);
    font-size: 3.2mm;
    color: var(--muted);
  }

  /* ---- Cover ---- */
  .page--cover {
    padding: 0;
    justify-content: flex-end;
  }

  .cover-art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-art--empty {
    background: linear-gradient(135deg, #2D1B69 0%, #7C5CBF 60%, #9B7FD4 100%);
  }

  .cover-text {
    position: relative;
    margin: var(--margin);
    padding: 6mm;
    border-radius: 4mm;
    background: rgba(250, 248, 244, 0.92);
  }

  .cover-text h1 {
    margin: 0;
    font-family: 'Fraunces', Georgia, 'Times New Roman', serif;
    font-size: 11mm;
    line-height: 1.15;
    font-weight: 600;
  }

  .cover-text h2 {
    margin: 2mm 0 0;
    font-size: 4.6mm;
    font-weight: 500;
    color: var(--muted);
  }

  /* ---- Plates ---- */
  .page--plate, .page--back {
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .plate {
    max-width: 70%;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 5.6mm;
    line-height: 1.6;
    color: var(--ink);
  }

  .colophon {
    margin-top: 14mm;
    font-size: 3.4mm;
    color: var(--muted);
    line-height: 1.7;
  }

  .colophon p { margin: 0; }
  .colophon .mark { margin-top: 4mm; color: var(--accent); letter-spacing: 0.14em; }

  /* ---- Trim marks, print only ---- */
  ${isPrint ? cropMarkCss() : ''}
</style>
</head>
<body>
  <section class="page page--cover">
    ${cover}
    <div class="cover-text">
      <h1>${escapeHtml(book.title)}</h1>
      ${book.subtitle ? `<h2>${escapeHtml(book.subtitle)}</h2>` : ''}
    </div>
  </section>
  ${dedication}
  ${book.pages.map(pageMarkup).join('\n')}
  ${backCover}
</body>
</html>`;
}

/**
 * Corner marks showing the printer where to cut.
 *
 * Drawn just outside the trim box, inside the bleed area, so they are removed
 * by the cut itself.
 */
function cropMarkCss(): string {
  return `
  .page::before, .page::after {
    content: '';
    position: absolute;
    pointer-events: none;
  }

  .page::before {
    top: var(--trim);
    left: var(--trim);
    right: var(--trim);
    bottom: var(--trim);
    outline: 0.1mm dashed rgba(0, 0, 0, 0);
    box-shadow:
      -2mm 0 0 -1.9mm rgba(0,0,0,0.6),
      0 -2mm 0 -1.9mm rgba(0,0,0,0.6);
  }

  .page--cover::before, .page--cover::after { display: none; }`;
}
