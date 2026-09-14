import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AGE_BAND_RULES } from '@masalim/types';
import type { AIJobDto, StoryDto, StorySummaryDto, Paginated } from '@masalim/types';
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

interface CreateStoryResponse {
  story: StoryDto;
  job: AIJobDto;
}

/**
 * Journey 1 of the definition of done: sign up → child → wizard → generated
 * story → library → reopen.
 *
 * The story is produced by the mock provider, but everything around it is real:
 * a BullMQ job on a real Redis, the moderation passes, the database writes and
 * the version snapshot.
 */
describe('story generation', () => {
  let context: TestContext;
  let parent: SignedUpUser;
  let childId: string;
  let freeVoiceId: string;
  let premiumVoiceId: string;

  beforeAll(async () => {
    context = await createTestApp();
    startWorkers(context);

    const voices = await context.prisma.client.systemVoice.findMany();
    const free = voices.find((voice) => !voice.premiumOnly);
    const premium = voices.find((voice) => voice.premiumOnly);
    if (!free || !premium) {
      throw new Error('seed did not provide both free and premium system voices');
    }
    freeVoiceId = free.id;
    premiumVoiceId = premium.id;
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await resetUserData(context.prisma);
    await resetRedis(context.redis);
    parent = await signUp(context, { name: 'Ayşe' });

    const child = await context
      .http()
      .post('/children')
      .set(...authHeader(parent))
      .send({
        name: 'Ege',
        birthDate: '2019-03-14',
        interestSlugs: ['space', 'dinosaurs'],
        customInterests: ['gökyüzü'],
      })
      .expect(201);
    childId = (child.body as { id: string }).id;
  });

  function wizardPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      childId,
      heroName: 'Ege',
      heroType: 'CHILD',
      themes: ['adventure', 'friendship'],
      ageRange: 'AGE_3_5',
      durationTarget: 'MEDIUM',
      customPrompt: 'Uzayda kaybolan küçük bir yıldızı bulsun.',
      advancedSettings: { calmBedtimeEnding: true, teachNewWords: true },
      systemVoiceId: freeVoiceId,
      idempotencyKey: randomUUID(),
      ...overrides,
    };
  }

  async function createStory(
    overrides: Record<string, unknown> = {},
  ): Promise<CreateStoryResponse> {
    const response = await context
      .http()
      .post('/stories')
      .set(...authHeader(parent))
      .send(wizardPayload(overrides))
      .expect(201);
    return response.body as CreateStoryResponse;
  }

  it('generates, moderates and persists a story from the wizard payload', async () => {
    const { story, job } = await createStory();

    // The worker may already have picked the job up by the time the response is
    // serialised, so both pre-ready states are legitimate here.
    expect(['DRAFT', 'GENERATING']).toContain(story.status);
    expect(job.type).toBe('STORY_GENERATION');
    expect(job.totalSteps).toBe(4);

    const settled = await waitForJob(context, parent, job.id);
    expect(settled.status).toBe('COMPLETED');
    expect(settled.progress).toBe(100);
    expect(settled.completedSteps).toBe(settled.totalSteps);

    const response = await context
      .http()
      .get(`/stories/${story.id}`)
      .set(...authHeader(parent))
      .expect(200);
    const ready = response.body as StoryDto;

    expect(ready.status).toBe('READY');
    expect(ready.moderationStatus).toBe('APPROVED');
    expect(ready.title).not.toBe('Masalın hazırlanıyor');
    expect(ready.summary).toBeTruthy();
    expect(ready.childName).toBe('Ege');

    // The age band is a real generation parameter, not a label on the wizard.
    const rules = AGE_BAND_RULES.AGE_3_5;
    expect(ready.pages.length).toBeGreaterThanOrEqual(rules.pages.min);
    expect(ready.pages.length).toBeLessThanOrEqual(rules.pages.max);
    expect(ready.pages.map((page) => page.pageNumber)).toEqual(
      ready.pages.map((_page, index) => index + 1),
    );
    for (const page of ready.pages) {
      expect(page.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('snapshots version 1 so a later edit cannot rewrite what was already there', async () => {
    const { story, job } = await createStory();
    await waitForJob(context, parent, job.id);

    const snapshots = await context.prisma.client.storyVersion.findMany({
      where: { storyId: story.id },
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.version).toBe(1);

    const before = await context
      .http()
      .get(`/stories/${story.id}`)
      .set(...authHeader(parent))
      .expect(200);
    const readyStory = before.body as StoryDto;
    const firstPage = readyStory.pages[0];
    if (!firstPage) throw new Error('generated story had no pages');

    await context
      .http()
      .patch(`/stories/${story.id}`)
      .set(...authHeader(parent))
      .send({ title: 'Ege ve Kayıp Yıldız', pages: [{ id: firstPage.id, text: 'Yeni metin.' }] })
      .expect(200);

    const versions = await context.prisma.client.storyVersion.findMany({
      where: { storyId: story.id },
      orderBy: { version: 'asc' },
    });
    expect(versions).toHaveLength(2);
    expect(versions[0]?.title).toBe(readyStory.title);
    expect(JSON.stringify(versions[0]?.pages)).toContain(firstPage.text.slice(0, 20));
  });

  it('records the generation as one AI usage row per provider call', async () => {
    const { job } = await createStory();
    await waitForJob(context, parent, job.id);

    const usage = await context.prisma.client.aIUsageLog.findMany({
      where: { userId: parent.userId },
    });
    const operations = usage.map((row) => row.operation);
    expect(operations).toContain('story:generate');
    expect(operations).toContain('moderation:PARENT_PROMPT');
    expect(operations).toContain('moderation:GENERATED_STORY');
  });

  it('writes a moderation record for both the prompt and the finished story', async () => {
    const { story, job } = await createStory();
    await waitForJob(context, parent, job.id);

    const records = await context.prisma.client.moderationRecord.findMany({
      where: { subjectId: story.id },
    });
    expect(records.map((record) => record.stage).sort()).toEqual(['INPUT', 'OUTPUT']);
    expect(records.every((record) => record.verdict === 'APPROVED')).toBe(true);
  });

  it('rejects unsafe prompts without spending a generation or storing the text', async () => {
    const { story, job } = await createStory({
      customPrompt: 'Kahraman bıçakla birini öldürsün, çok kanlı olsun.',
    });

    const settled = await waitForJob(context, parent, job.id);
    expect(settled.status).toBe('FAILED');
    expect(settled.errorCode).toBe('STORY_CONTENT_NOT_SUITABLE');

    const row = await context.prisma.client.story.findUniqueOrThrow({
      where: { id: story.id },
    });
    expect(row.status).toBe('REJECTED');
    expect(row.storyText).toBeNull();

    const pages = await context.prisma.client.storyPage.count({
      where: { storyId: story.id },
    });
    expect(pages).toBe(0);
  });

  it('returns the same story for a replayed idempotency key', async () => {
    const payload = wizardPayload();

    const first = await context
      .http()
      .post('/stories')
      .set(...authHeader(parent))
      .send(payload)
      .expect(201);
    const second = await context
      .http()
      .post('/stories')
      .set(...authHeader(parent))
      .send(payload)
      .expect(201);

    const a = first.body as CreateStoryResponse;
    const b = second.body as CreateStoryResponse;
    expect(b.story.id).toBe(a.story.id);
    expect(b.job.id).toBe(a.job.id);

    const stories = await context.prisma.client.story.count({
      where: { userId: parent.userId },
    });
    expect(stories).toBe(1);

    await waitForJob(context, parent, a.job.id);
  });

  it('refuses a premium system voice on a free account before anything is queued', async () => {
    const response = await context
      .http()
      .post('/stories')
      .set(...authHeader(parent))
      .send(wizardPayload({ systemVoiceId: premiumVoiceId }))
      .expect(403);

    expect((response.body as { error: { code: string } }).error.code).toBe('PREMIUM_REQUIRED');

    const stories = await context.prisma.client.story.count({
      where: { userId: parent.userId },
    });
    expect(stories).toBe(0);
  });

  it('stops a free account at its monthly story allowance', async () => {
    // FREE is four stories a month; the fifth must be refused, and refused
    // before a row is created so the library never shows a stranded draft.
    for (let index = 0; index < 4; index += 1) {
      const { job } = await createStory();
      await waitForJob(context, parent, job.id);
    }

    const response = await context
      .http()
      .post('/stories')
      .set(...authHeader(parent))
      .send(wizardPayload())
      .expect(402);
    expect((response.body as { error: { code: string } }).error.code).toBe('QUOTA_EXCEEDED');

    const stories = await context.prisma.client.story.count({
      where: { userId: parent.userId },
    });
    expect(stories).toBe(4);
  });

  it('lists, filters and favourites stories in the library', async () => {
    const { story, job } = await createStory();
    await waitForJob(context, parent, job.id);

    const listed = await context
      .http()
      .get('/stories')
      .set(...authHeader(parent))
      .expect(200);
    const page = listed.body as Paginated<StorySummaryDto>;
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(story.id);
    expect(page.items[0]?.isFavourite).toBe(false);

    await context
      .http()
      .put(`/stories/${story.id}/favourite`)
      .set(...authHeader(parent))
      .expect(204);

    const favourites = await context
      .http()
      .get('/stories?filter=favourites')
      .set(...authHeader(parent))
      .expect(200);
    expect((favourites.body as Paginated<StorySummaryDto>).items).toHaveLength(1);

    await context
      .http()
      .delete(`/stories/${story.id}/favourite`)
      .set(...authHeader(parent))
      .expect(204);

    const afterUnfavourite = await context
      .http()
      .get('/stories?filter=favourites')
      .set(...authHeader(parent))
      .expect(200);
    expect((afterUnfavourite.body as Paginated<StorySummaryDto>).items).toHaveLength(0);
  });

  it('hides a deleted story from the library and from direct access', async () => {
    const { story, job } = await createStory();
    await waitForJob(context, parent, job.id);

    await context
      .http()
      .delete(`/stories/${story.id}`)
      .set(...authHeader(parent))
      .expect(204);

    await context
      .http()
      .get(`/stories/${story.id}`)
      .set(...authHeader(parent))
      .expect(404);

    const listed = await context
      .http()
      .get('/stories')
      .set(...authHeader(parent))
      .expect(200);
    expect((listed.body as Paginated<StorySummaryDto>).items).toHaveLength(0);
  });

  it('rejects a child that belongs to another parent', async () => {
    const stranger = await signUp(context, { name: 'Mehmet' });
    const strangerChild = await context
      .http()
      .post('/children')
      .set(...authHeader(stranger))
      .send({ name: 'Zeynep', birthDate: '2018-01-01', interestSlugs: [], customInterests: [] })
      .expect(201);

    await context
      .http()
      .post('/stories')
      .set(...authHeader(parent))
      .send(wizardPayload({ childId: (strangerChild.body as { id: string }).id }))
      .expect(404);
  });
});
