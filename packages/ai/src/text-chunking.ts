export interface TextChunk {
  text: string;
  /** Page numbers this chunk covers, so timings can be mapped back to pages. */
  pageNumbers: number[];
  index: number;
}

export interface ChunkablePage {
  pageNumber: number;
  text: string;
}

/**
 * Splits Turkish prose into sentences.
 *
 * Naively splitting on every full stop would break Turkish ordinals ("3. sayfa")
 * and common abbreviations mid-sentence, which the narrator would then read as
 * two fragments with an audible pause in the wrong place.
 */
export function splitSentences(text: string): string[] {
  const protectedText = text
    .replace(/(\d)\.(\s)/g, '$1<!ORD!>$2')
    .replace(/\b(vb|vs|Dr|Prof|Sn|Av|Bkz|Örn|bkz|örn)\./g, '$1<!ABBR!>');

  return protectedText
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) =>
      sentence.replace(/<!ORD!>/g, '.').replace(/<!ABBR!>/g, '.').trim(),
    )
    .filter((sentence) => sentence.length > 0);
}

/**
 * Groups pages into synthesis chunks.
 *
 * Chunks break on sentence boundaries and stay under the provider's per-request
 * limit. Crucially they never split *within* a sentence: a seam mid-sentence is
 * audible even after the audio is concatenated, and the whole point is that the
 * parent hears one continuous story (master prompt §23).
 */
export function chunkPagesForSpeech(
  pages: ChunkablePage[],
  maxCharacters: number,
): TextChunk[] {
  const chunks: TextChunk[] = [];

  let current = '';
  let currentPages: number[] = [];

  const flush = (): void => {
    if (current.trim().length === 0) return;
    chunks.push({
      text: current.trim(),
      pageNumbers: [...new Set(currentPages)],
      index: chunks.length,
    });
    current = '';
    currentPages = [];
  };

  for (const page of pages) {
    for (const sentence of splitSentences(page.text)) {
      // A single sentence longer than the limit is pathological but must still
      // be synthesised; emit it alone rather than dropping it.
      if (sentence.length > maxCharacters) {
        flush();
        chunks.push({
          text: sentence,
          pageNumbers: [page.pageNumber],
          index: chunks.length,
        });
        continue;
      }

      if (current.length + sentence.length + 1 > maxCharacters) {
        flush();
      }

      current = current.length === 0 ? sentence : `${current} ${sentence}`;
      currentPages.push(page.pageNumber);
    }
  }

  flush();
  return chunks;
}

export interface SentenceTiming {
  pageNumber: number;
  sentenceIndex: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

/**
 * Distributes a chunk's measured duration across its sentences.
 *
 * Proportional to character count rather than sentence count, because a
 * three-word line and a thirty-word line take very different times to read.
 * These offsets drive the highlighted-paragraph reading mode.
 */
export function estimateSentenceTimings(
  pages: ChunkablePage[],
  chunks: TextChunk[],
  chunkDurations: number[],
): SentenceTiming[] {
  const timings: SentenceTiming[] = [];
  const sentenceCounters = new Map<number, number>();
  let elapsed = 0;

  const pageTextByNumber = new Map(pages.map((page) => [page.pageNumber, page.text]));

  chunks.forEach((chunk, chunkIndex) => {
    const duration = chunkDurations[chunkIndex] ?? 0;
    const sentences = splitSentences(chunk.text);
    const totalCharacters = sentences.reduce((sum, sentence) => sum + sentence.length, 0);

    let offset = elapsed;
    for (const sentence of sentences) {
      const share = totalCharacters === 0 ? 0 : sentence.length / totalCharacters;
      const sentenceDuration = duration * share;

      // Attribute the sentence to whichever of the chunk's pages contains it.
      const pageNumber =
        chunk.pageNumbers.find((candidate) =>
          pageTextByNumber.get(candidate)?.includes(sentence.slice(0, 24)),
        ) ??
        chunk.pageNumbers[0] ??
        1;

      const sentenceIndex = sentenceCounters.get(pageNumber) ?? 0;
      sentenceCounters.set(pageNumber, sentenceIndex + 1);

      timings.push({
        pageNumber,
        sentenceIndex,
        startSeconds: Number(offset.toFixed(3)),
        endSeconds: Number((offset + sentenceDuration).toFixed(3)),
        text: sentence,
      });

      offset += sentenceDuration;
    }

    elapsed += duration;
  });

  return timings;
}
