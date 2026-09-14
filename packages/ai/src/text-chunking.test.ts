import { describe, expect, it } from 'vitest';
import {
  chunkPagesForSpeech,
  estimateSentenceTimings,
  splitSentences,
  type ChunkablePage,
} from './text-chunking';

describe('splitSentences', () => {
  it('splits ordinary Turkish prose', () => {
    expect(
      splitSentences('Ege uyandı. Gökyüzü maviydi! Ne yapmalı?'),
    ).toEqual(['Ege uyandı.', 'Gökyüzü maviydi!', 'Ne yapmalı?']);
  });

  it('does not split a Turkish ordinal', () => {
    // "3. sayfa" would otherwise become two fragments, and the narrator would
    // pause in the middle of the phrase.
    expect(splitSentences('Ege 3. sayfada durdu ve düşündü.')).toEqual([
      'Ege 3. sayfada durdu ve düşündü.',
    ]);
  });

  it('does not split common abbreviations', () => {
    expect(splitSentences('Dr. Ayşe geldi ve gülümsedi.')).toEqual([
      'Dr. Ayşe geldi ve gülümsedi.',
    ]);
  });

  it('handles an ellipsis as a sentence end', () => {
    expect(splitSentences('Bekledi… Sonra gitti.')).toEqual(['Bekledi…', 'Sonra gitti.']);
  });

  it('returns nothing for empty input', () => {
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('chunkPagesForSpeech', () => {
  const pages: ChunkablePage[] = [
    { pageNumber: 1, text: 'Bir varmış bir yokmuş. Ege adında bir çocuk varmış.' },
    { pageNumber: 2, text: 'Ege gökyüzüne baktı. Yıldızlar parlıyordu.' },
    { pageNumber: 3, text: 'Sonra uyudu. İyi geceler Ege.' },
  ];

  it('packs pages together while under the limit', () => {
    const chunks = chunkPagesForSpeech(pages, 4000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.pageNumbers).toEqual([1, 2, 3]);
  });

  it('never exceeds the provider limit', () => {
    const chunks = chunkPagesForSpeech(pages, 60);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(60);
    }
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('never breaks inside a sentence', () => {
    // A seam mid-sentence stays audible after concatenation, which is exactly
    // what would make a long story sound like a series of clips.
    const chunks = chunkPagesForSpeech(pages, 60);
    const allSentences = pages.flatMap((page) => splitSentences(page.text));
    const chunkedSentences = chunks.flatMap((chunk) => splitSentences(chunk.text));
    expect(chunkedSentences).toEqual(allSentences);
  });

  it('loses no text at all', () => {
    const chunks = chunkPagesForSpeech(pages, 40);
    const rejoined = chunks.map((chunk) => chunk.text).join(' ');
    for (const page of pages) {
      for (const sentence of splitSentences(page.text)) {
        expect(rejoined).toContain(sentence);
      }
    }
  });

  it('emits an over-long sentence on its own rather than dropping it', () => {
    const long = 'a'.repeat(500);
    const chunks = chunkPagesForSpeech([{ pageNumber: 1, text: `${long}.` }], 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text.length).toBeGreaterThan(100);
  });

  it('tracks which pages each chunk covers', () => {
    const chunks = chunkPagesForSpeech(pages, 55);
    for (const chunk of chunks) {
      expect(chunk.pageNumbers.length).toBeGreaterThan(0);
    }
  });

  it('handles an empty story', () => {
    expect(chunkPagesForSpeech([], 4000)).toEqual([]);
  });
});

describe('estimateSentenceTimings', () => {
  const pages: ChunkablePage[] = [
    { pageNumber: 1, text: 'Kısa cümle. Bu cümle belirgin şekilde daha uzun bir cümledir.' },
  ];

  it('produces one timing per sentence', () => {
    const chunks = chunkPagesForSpeech(pages, 4000);
    const timings = estimateSentenceTimings(pages, chunks, [10]);
    expect(timings).toHaveLength(2);
  });

  it('gives a longer sentence more time', () => {
    const chunks = chunkPagesForSpeech(pages, 4000);
    const timings = estimateSentenceTimings(pages, chunks, [10]);

    const first = (timings[0]?.endSeconds ?? 0) - (timings[0]?.startSeconds ?? 0);
    const second = (timings[1]?.endSeconds ?? 0) - (timings[1]?.startSeconds ?? 0);
    expect(second).toBeGreaterThan(first);
  });

  it('produces a continuous timeline with no gaps or overlaps', () => {
    const chunks = chunkPagesForSpeech(pages, 4000);
    const timings = estimateSentenceTimings(pages, chunks, [10]);

    expect(timings[0]?.startSeconds).toBe(0);
    for (let index = 1; index < timings.length; index += 1) {
      expect(timings[index]?.startSeconds).toBeCloseTo(
        timings[index - 1]?.endSeconds ?? 0,
        2,
      );
    }
  });

  it('spans the full measured duration', () => {
    const chunks = chunkPagesForSpeech(pages, 4000);
    const timings = estimateSentenceTimings(pages, chunks, [10]);
    expect(timings.at(-1)?.endSeconds).toBeCloseTo(10, 2);
  });

  it('accumulates across multiple chunks', () => {
    const multiPage: ChunkablePage[] = [
      { pageNumber: 1, text: 'Bir cümle burada.' },
      { pageNumber: 2, text: 'Başka bir cümle orada.' },
    ];
    const chunks = chunkPagesForSpeech(multiPage, 20);
    const timings = estimateSentenceTimings(multiPage, chunks, chunks.map(() => 5));

    expect(timings.at(-1)?.endSeconds).toBeCloseTo(chunks.length * 5, 2);
  });
});
