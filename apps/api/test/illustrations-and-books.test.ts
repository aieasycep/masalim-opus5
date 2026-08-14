import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  AIJobDto,
  BookDto,
  BookRenderDto,
  IllustrationDto,
  IllustrationSetDto,
} from '@masalim/types';
import {
  authHeader,
  createTestApp,
  resetRedis,
  resetUserData,
  signUp,
  type SignedUpUser,
  type TestContext,
} from './helpers/test-app';
import { startWorkers, waitForJob } from './helpers/jobs';

/**
 * The first half of journey 3: story → illustrations → book → digital preview →
 * print-ready PDF.
 *
 * The images come from the mock provider, but they are real PNGs and the PDFs
 * are rendered by a real browser engine, so the layout, the bleed and the page
 * count are all genuinely exercised.
 */
describe('illustrations and books', () => {
  let context: TestContext;
  let parent: SignedUpUser;
  let systemVoiceId: string;

  beforeAll(async () => {
    context = await createTestApp();
    startWorkers(context);

    const voice = await context.prisma.client.systemVoice.findFirst({
      where: { premiumOnly: false },
    });
    if (!voice) throw new Error('seed did not provide a free system voice');
    systemVoiceId = voice.id;
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await resetUserData(context.prisma);
    await resetRedis(context.redis);
    parent = await signUp(context, { name: 'Ayşe' });
  });

  async function readyStory(): Promise<string> {
    const created = await context
      .http()
      .post('/stories')
      .set(...authHeader(parent))
      .send({
        heroName: 'Ege',
        heroType: 'CHILD',
        themes: ['adventure'],
        ageRange: 'AGE_3_5',
        durationTarget: 'SHORT',
        advancedSettings: {},
        systemVoiceId,
        idempotencyKey: randomUUID(),
      })
      .expect(201);

    const { story, job } = created.body as { story: { id: string }; job: AIJobDto };
    const settled = await waitForJob(context, parent, job.id);
    expect(settled.status).toBe('COMPLETED');
    return story.id;
  }

  async function illustrate(storyId: string): Promise<IllustrationSetDto> {
    const created = await context
      .http()
      .post(`/stories/${storyId}/illustrations`)
      .set(...authHeader(parent))
      .send({ style: 'watercolor', idempotencyKey: randomUUID() })
      .expect(201);

    const { set, job } = created.body as { set: IllustrationSetDto; job: AIJobDto };
    const settled = await waitForJob(context, parent, job.id, { timeoutMs: 120_000 });
    expect(settled.status).toBe('COMPLETED');

    const ready = await context
      .http()
      .get(`/illustration-sets/${set.id}`)
      .set(...authHeader(parent))
      .expect(200);
    return ready.body as IllustrationSetDto;
  }

  async function buildBook(storyId: string, setId: string): Promise<BookDto> {
    const created = await context
      .http()
      .post('/books')
      .set(...authHeader(parent))
      .send({ storyId, illustrationSetId: setId, idempotencyKey: randomUUID() })
      .expect(201);
    return created.body as BookDto;
  }

  it('illustrates every page and the cover, and reports honest counts', async () => {
    const storyId = await readyStory();
    const set = await illustrate(storyId);

    expect(set.status).toBe('READY');
    expect(set.style).toBe('watercolor');

    const pages = await context.prisma.client.storyPage.count({ where: { storyId } });
    // One cover plus one image per page — the denominator the app shows.
    expect(set.totalCount).toBe(pages + 1);
    expect(set.readyCount).toBe(set.totalCount);

    const cover = set.illustrations.find((illustration) => illustration.kind === 'COVER');
    expect(cover?.imageUrl).toBeTruthy();
    for (const illustration of set.illustrations) {
      expect(illustration.status).toBe('READY');
      expect(illustration.imageUrl).toBeTruthy();
    }
  });

  it('reuses one character description for every image in the set', async () => {
    const storyId = await readyStory();
    const set = await illustrate(storyId);

    const row = await context.prisma.client.illustrationSet.findUniqueOrThrow({
      where: { id: set.id },
    });
    const bible = row.characterBible as { name: string; clothing: string } | null;
    expect(bible?.name).toBe('Ege');
    expect(bible?.clothing.length).toBeGreaterThan(0);

    // The description is repeated verbatim in every prompt — that repetition is
    // what keeps the hero the same person from the cover to the last page.
    const illustrations = await context.prisma.client.illustration.findMany({
      where: { illustrationSetId: set.id },
    });
    for (const illustration of illustrations) {
      expect(illustration.prompt).toContain(bible?.clothing ?? '###');
      expect(illustration.prompt).toContain('must look identical in every image');
    }
  });

  it('never accepts a raw prompt from the client', async () => {
    const storyId = await readyStory();

    // The style key is the only thing the client may send; anything else is
    // rejected before it can reach the image model.
    await context
      .http()
      .post(`/stories/${storyId}/illustrations`)
      .set(...authHeader(parent))
      .send({ style: 'draw whatever I say', idempotencyKey: randomUUID() })
      .expect(400);
  });

  it('offers a regenerated variant without destroying the original', async () => {
    const storyId = await readyStory();
    const set = await illustrate(storyId);
    const original = set.illustrations.find((item) => item.kind === 'PAGE');
    if (!original) throw new Error('set had no page illustrations');

    const created = await context
      .http()
      .post('/illustrations/regenerate')
      .set(...authHeader(parent))
      .send({ illustrationId: original.id, idempotencyKey: randomUUID() })
      .expect(201);

    const { illustration, job } = created.body as {
      illustration: IllustrationDto;
      job: AIJobDto;
    };
    expect(illustration.isSelected).toBe(false);

    const settled = await waitForJob(context, parent, job.id, { timeoutMs: 60_000 });
    expect(settled.status).toBe('COMPLETED');

    const after = await context
      .http()
      .get(`/illustration-sets/${set.id}`)
      .set(...authHeader(parent))
      .expect(200);
    const updated = after.body as IllustrationSetDto;

    const kept = updated.illustrations.find((item) => item.id === original.id);
    expect(kept?.imageUrl).toBeTruthy();
    expect(kept?.isSelected).toBe(true);

    // Choosing the variant swaps the selection, one way, without deleting either.
    const selected = await context
      .http()
      .post(`/illustrations/${illustration.id}/select`)
      .set(...authHeader(parent))
      .expect(201);
    const final = selected.body as IllustrationSetDto;

    expect(final.illustrations.find((item) => item.id === illustration.id)?.isSelected).toBe(
      true,
    );
    expect(final.illustrations.find((item) => item.id === original.id)?.isSelected).toBe(false);
  });

  it('stops a free account at its monthly illustration allowance', async () => {
    // FREE allows six illustration sets a month.
    for (let index = 0; index < 6; index += 1) {
      const storyRow = await context.prisma.client.story.create({
        data: {
          userId: parent.userId,
          title: `Masal ${index}`,
          heroName: 'Ege',
          heroType: 'CHILD',
          themes: ['adventure'],
          ageRange: 'AGE_3_5',
          durationTarget: 'SHORT',
          status: 'READY',
          pages: { create: [{ pageNumber: 1, text: 'Bir varmış bir yokmuş.' }] },
        },
      });

      await context
        .http()
        .post(`/stories/${storyRow.id}/illustrations`)
        .set(...authHeader(parent))
        .send({ style: 'pastel', idempotencyKey: randomUUID() })
        .expect(201);
    }

    const storyId = await readyStory();
    const response = await context
      .http()
      .post(`/stories/${storyId}/illustrations`)
      .set(...authHeader(parent))
      .send({ style: 'pastel', idempotencyKey: randomUUID() })
      .expect(402);
    expect((response.body as { error: { code: string } }).error.code).toBe('QUOTA_EXCEEDED');
  });

  describe('book builder', () => {
    it('materialises pages so editing the book never touches the story', async () => {
      const storyId = await readyStory();
      const set = await illustrate(storyId);
      const book = await buildBook(storyId, set.id);

      expect(book.pages.length).toBeGreaterThan(0);
      expect(book.coverImageUrl).toBeTruthy();
      for (const page of book.pages) {
        expect(page.imageUrl).toBeTruthy();
      }

      const firstPage = book.pages[0];
      if (!firstPage) throw new Error('book had no pages');
      const storyTextBefore = (
        await context.prisma.client.story.findUniqueOrThrow({ where: { id: storyId } })
      ).storyText;

      await context
        .http()
        .patch(`/book-pages/${firstPage.id}`)
        .set(...authHeader(parent))
        .send({ text: 'Baskı için yeniden yazılmış sayfa.', layout: 'TEXT_ONLY' })
        .expect(200);

      const storyAfter = await context.prisma.client.story.findUniqueOrThrow({
        where: { id: storyId },
      });
      expect(storyAfter.storyText).toBe(storyTextBefore);

      const reread = await context
        .http()
        .get(`/books/${book.id}`)
        .set(...authHeader(parent))
        .expect(200);
      const updated = reread.body as BookDto;
      expect(updated.pages[0]?.text).toBe('Baskı için yeniden yazılmış sayfa.');
      expect(updated.pages[0]?.layout).toBe('TEXT_ONLY');
    });

    it('autosaves the cover fields', async () => {
      const storyId = await readyStory();
      const set = await illustrate(storyId);
      const book = await buildBook(storyId, set.id);

      const saved = await context
        .http()
        .patch(`/books/${book.id}`)
        .set(...authHeader(parent))
        .send({
          title: 'Ege ve Kayıp Yıldız',
          subtitle: 'Bir gece masalı',
          dedication: 'Ege için, her gece.',
          backCoverText: 'Yıldızlar kaybolduğunda birisi onları aramaya gider.',
        })
        .expect(200);

      const updated = saved.body as BookDto;
      expect(updated.title).toBe('Ege ve Kayıp Yıldız');
      expect(updated.dedication).toBe('Ege için, her gece.');
    });

    it('refuses an illustration from another story', async () => {
      const storyId = await readyStory();
      const set = await illustrate(storyId);
      const book = await buildBook(storyId, set.id);

      const otherStoryId = await readyStory();
      const otherSet = await illustrate(otherStoryId);
      const foreignCover = otherSet.illustrations.find((item) => item.kind === 'COVER');
      if (!foreignCover) throw new Error('other set had no cover');

      await context
        .http()
        .patch(`/books/${book.id}`)
        .set(...authHeader(parent))
        .send({ coverIllustrationId: foreignCover.id })
        .expect(404);
    });

    it('refuses another parent’s book', async () => {
      const storyId = await readyStory();
      const set = await illustrate(storyId);
      const book = await buildBook(storyId, set.id);

      const stranger = await signUp(context, { name: 'Mehmet' });
      await context
        .http()
        .get(`/books/${book.id}`)
        .set(...authHeader(stranger))
        .expect(404);
      await context
        .http()
        .patch(`/books/${book.id}`)
        .set(...authHeader(stranger))
        .send({ title: 'Çalınmış' })
        .expect(404);
    });
  });

  describe('rendering', () => {
    it('renders a digital preview as a real PDF', async () => {
      const storyId = await readyStory();
      const set = await illustrate(storyId);
      const book = await buildBook(storyId, set.id);

      const created = await context
        .http()
        .post(`/books/${book.id}/renders`)
        .set(...authHeader(parent))
        .send({ kind: 'DIGITAL_PREVIEW', idempotencyKey: randomUUID() })
        .expect(201);

      const { render, job } = created.body as { render: BookRenderDto; job: AIJobDto };
      const settled = await waitForJob(context, parent, job.id, { timeoutMs: 180_000 });
      expect(settled.status).toBe('COMPLETED');

      const renders = await context
        .http()
        .get(`/books/${book.id}/renders`)
        .set(...authHeader(parent))
        .expect(200);
      const ready = (renders.body as BookRenderDto[]).find((item) => item.id === render.id);

      expect(ready?.status).toBe('READY');
      expect(ready?.fileUrl).toBeTruthy();

      const path = (ready?.fileUrl ?? '').slice((ready?.fileUrl ?? '').indexOf('/uploads/local'));
      const download = await context.http().get(path).expect(200);
      expect(download.headers['content-type']).toContain('application/pdf');
      expect(download.body.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('renders a print file and records a checksum', async () => {
      const storyId = await readyStory();
      const set = await illustrate(storyId);
      const book = await buildBook(storyId, set.id);

      const created = await context
        .http()
        .post(`/books/${book.id}/renders`)
        .set(...authHeader(parent))
        .send({ kind: 'PRINT_PDF', idempotencyKey: randomUUID() })
        .expect(201);

      const { render, job } = created.body as { render: BookRenderDto; job: AIJobDto };
      const settled = await waitForJob(context, parent, job.id, { timeoutMs: 180_000 });
      expect(settled.status).toBe('COMPLETED');

      const row = await context.prisma.client.bookRender.findUniqueOrThrow({
        where: { id: render.id },
      });
      expect(row.status).toBe('READY');
      expect(row.checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('refuses to build a print file while a page has no illustration', async () => {
      const storyId = await readyStory();
      const set = await illustrate(storyId);
      const book = await buildBook(storyId, set.id);

      const firstPage = book.pages[0];
      if (!firstPage) throw new Error('book had no pages');
      await context.prisma.client.bookPage.update({
        where: { id: firstPage.id },
        data: { illustrationId: null },
      });

      const response = await context
        .http()
        .post(`/books/${book.id}/renders`)
        .set(...authHeader(parent))
        .send({ kind: 'PRINT_PDF', idempotencyKey: randomUUID() })
        .expect(400);

      // A printed book with a blank page is not something to discover after
      // paying for it.
      expect((response.body as { error: { code: string } }).error.code).toBe(
        'BOOK_NOT_READY_FOR_PRINT',
      );
    });
  });
});
