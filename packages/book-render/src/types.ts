import type { BookPageLayout, BookSize } from '@masalim/types';

export interface RenderablePage {
  pageNumber: number;
  text: string;
  layout: BookPageLayout;
  /** Data URI or absolute file URL. Never a remote URL — the renderer is offline. */
  imageSrc: string | null;
}

export interface RenderableBook {
  title: string;
  subtitle: string | null;
  dedication: string | null;
  backCoverText: string | null;
  coverImageSrc: string | null;
  pages: RenderablePage[];
  /** Shown in the colophon so a printed copy says where it came from. */
  childName: string | null;
  createdAtLabel: string;
}

/** Trim sizes in millimetres. */
export const BOOK_TRIM_MM: Readonly<Record<BookSize, { width: number; height: number }>> = {
  SQUARE: { width: 210, height: 210 },
  STANDARD: { width: 210, height: 148 },
};

/** Ink is printed past the trim line so a slightly off cut leaves no white edge. */
export const BLEED_MM = 3;
/** Nothing important is placed closer than this to the trim line. */
export const SAFE_MARGIN_MM = 10;

export interface RenderOptions {
  bookSize: BookSize;
  /**
   * `print` produces the file a printer receives: bleed on every edge, crop
   * marks, and no interface affordances. `preview` produces the file a parent
   * flips through: trimmed pages, no marks.
   */
  target: 'print' | 'preview';
}
