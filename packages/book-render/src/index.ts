export {
  BLEED_MM,
  BOOK_TRIM_MM,
  SAFE_MARGIN_MM,
  type RenderableBook,
  type RenderablePage,
  type RenderOptions,
} from './types';
export { buildBookHtml } from './template';
export { renderBookPdf, closeRenderer, BookRenderError, type RenderedBook } from './renderer';
export { toDataUri } from './data-uri';
