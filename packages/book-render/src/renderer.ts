import { chromium, type Browser } from 'playwright';
import { BLEED_MM, BOOK_TRIM_MM, type RenderableBook, type RenderOptions } from './types';
import { buildBookHtml } from './template';

export class BookRenderError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'BookRenderError';
  }
}

/** How long a single book may take before the render is abandoned. */
const RENDER_TIMEOUT_MS = 120_000;

let shared: Browser | null = null;

/**
 * One Chromium per process, launched on first use.
 *
 * Starting a browser costs a second or two; a worker that renders books all
 * evening should pay that once. The instance is stateless between renders —
 * each book gets a fresh context.
 *
 * `CHROMIUM_EXECUTABLE_PATH` points at a browser the image already has.
 * Playwright otherwise looks for the exact build revision it was compiled
 * against, so a container that ships its own Chromium — or a bumped
 * Playwright build — turns into "Executable doesn’t exist" at the moment a parent
 * asks for their book.
 */
async function browser(): Promise<Browser> {
  if (shared && shared.isConnected()) return shared;

  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;

  try {
    shared = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
      ...(executablePath ? { executablePath } : {}),
    });
  } catch (error) {
    throw new BookRenderError('Could not start the rendering browser', { cause: error });
  }
  return shared;
}

export async function closeRenderer(): Promise<void> {
  if (shared) {
    await shared.close().catch(() => undefined);
    shared = null;
  }
}

export interface RenderedBook {
  pdf: Buffer;
  pageCount: number;
  widthMm: number;
  heightMm: number;
}

/**
 * Renders a book to PDF.
 *
 * The document is loaded from a string with no network access of any kind:
 * images arrive as data URIs the caller has already fetched from storage. A
 * renderer that fetched its own images would turn a signed-URL expiry into a
 * book with blank pages, and would give a crafted image prompt a way to make the
 * server issue requests.
 */
export async function renderBookPdf(
  book: RenderableBook,
  options: RenderOptions,
): Promise<RenderedBook> {
  const html = buildBookHtml(book, options);
  const trim = BOOK_TRIM_MM[options.bookSize];
  const bleed = options.target === 'print' ? BLEED_MM : 0;
  const widthMm = trim.width + bleed * 2;
  const heightMm = trim.height + bleed * 2;

  const instance = await browser();
  const context = await instance.newContext({
    // Deny everything: the page is fully self-contained.
    offline: true,
    javaScriptEnabled: false,
  });

  try {
    const page = await context.newPage();
    await page.route('**/*', (route) => {
      const url = route.request().url();
      // data: and about: are inlined by the engine and never reach here; anything
      // that does is an external fetch the template should not be making.
      if (url.startsWith('http://') || url.startsWith('https://')) {
        void route.abort();
        return;
      }
      void route.continue();
    });

    await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });

    // Counted from the source rather than the DOM: `javaScriptEnabled: false`
    // is deliberate, so `page.evaluate` has nothing to run in.
    const pageCount = (html.match(/class="page[ "]/g) ?? []).length;

    const pdf = await page.pdf({
      width: `${widthMm}mm`,
      height: `${heightMm}mm`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });

    return { pdf: Buffer.from(pdf), pageCount, widthMm, heightMm };
  } catch (error) {
    throw new BookRenderError('The book could not be rendered', { cause: error });
  } finally {
    await context.close().catch(() => undefined);
  }
}
