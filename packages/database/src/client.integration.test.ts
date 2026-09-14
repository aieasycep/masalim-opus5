import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, createRawPrismaClient } from './client';
import type { PrismaClient } from '@prisma/client';

/**
 * The soft-delete extension is load-bearing for privacy: a deleted child, story
 * or voice profile must not come back in ordinary reads. These tests exercise it
 * against a real PostgreSQL rather than a mock, because the whole point is the
 * generated SQL.
 */
describe('soft-delete extension', () => {
  const prisma = createPrismaClient();
  const raw: PrismaClient = createRawPrismaClient();

  let userId: string;
  let liveChildId: string;
  let deletedChildId: string;

  beforeAll(async () => {
    const user = await raw.user.create({
      data: {
        email: `softdelete-${Date.now()}@test.local`,
        name: 'Soft Delete Test',
      },
    });
    userId = user.id;

    const live = await raw.child.create({
      data: { userId, name: 'Yaşayan', ageRange: 'AGE_3_5' },
    });
    liveChildId = live.id;

    const removed = await raw.child.create({
      data: {
        userId,
        name: 'Silinmiş',
        ageRange: 'AGE_3_5',
        deletedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    deletedChildId = removed.id;
  });

  afterAll(async () => {
    await raw.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('hides soft-deleted rows from findMany', async () => {
    const children = await prisma.child.findMany({ where: { userId } });
    const ids = children.map((child) => child.id);

    expect(ids).toContain(liveChildId);
    expect(ids).not.toContain(deletedChildId);
  });

  it('hides soft-deleted rows from findFirst', async () => {
    const found = await prisma.child.findFirst({ where: { id: deletedChildId } });
    expect(found).toBeNull();
  });

  it('excludes soft-deleted rows from count', async () => {
    const count = await prisma.child.count({ where: { userId } });
    expect(count).toBe(1);
  });

  it('lets an explicit deletedAt filter opt back in, for deletion jobs', async () => {
    const removed = await prisma.child.findFirst({
      where: { id: deletedChildId, deletedAt: { not: null } },
    });
    expect(removed?.id).toBe(deletedChildId);
  });

  it('leaves the raw client unfiltered for admin tooling', async () => {
    const all = await raw.child.findMany({ where: { userId } });
    expect(all).toHaveLength(2);
  });

  it('does not filter models that have no deletedAt column', async () => {
    // Interests are reference data with no soft-delete concept; the extension
    // must not inject `deletedAt: null` and break the query.
    await expect(prisma.interest.count()).resolves.toBeGreaterThan(0);
  });

  it('still applies to nested reads through include', async () => {
    const withChildren = await prisma.user.findFirst({
      where: { id: userId },
      include: { children: true },
    });
    expect(withChildren?.children.map((child) => child.id)).toEqual([liveChildId]);
  });

  it('filters soft-deleted rows out of nested _count selections', async () => {
    const withCount = await prisma.user.findFirst({
      where: { id: userId },
      select: { _count: { select: { children: true } } },
    });
    expect(withCount?._count.children).toBe(1);
  });

  it('filters two levels deep through chained includes', async () => {
    const rows = await prisma.user.findMany({
      where: { id: userId },
      include: { children: { include: { stories: true } } },
    });
    expect(rows[0]?.children.map((child) => child.id)).toEqual([liveChildId]);
  });

  it('respects an explicit nested deletedAt filter', async () => {
    const withDeleted = await prisma.user.findFirst({
      where: { id: userId },
      include: { children: { where: { deletedAt: { not: null } } } },
    });
    expect(withDeleted?.children.map((child) => child.id)).toEqual([deletedChildId]);
  });

  it('nulls out a soft-deleted optional parent instead of returning it', async () => {
    const story = await raw.story.create({
      data: {
        userId,
        childId: deletedChildId,
        title: 'Silinmiş çocuğun masalı',
        heroName: 'Ege',
        heroType: 'CHILD',
        themes: ['adventure'],
        ageRange: 'AGE_3_5',
        durationTarget: 'SHORT',
        status: 'READY',
      },
    });

    const loaded = await prisma.story.findFirst({
      where: { id: story.id },
      include: { child: true },
    });
    expect(loaded?.child).toBeNull();

    await raw.story.delete({ where: { id: story.id } });
  });

  /**
   * Prisma rejects a `where` on a required to-one relation — there is no way to
   * express "the parent is filtered out" when the row cannot exist without it.
   * The extension used to inject one anyway, which turned every read that
   * included a required parent into an outright error rather than a filtered
   * result. This is the case that has to keep working.
   */
  it('leaves required to-one parents alone so the query still runs', async () => {
    const story = await raw.story.create({
      data: {
        userId,
        title: 'Anlatılacak masal',
        heroName: 'Ege',
        heroType: 'CHILD',
        themes: ['adventure'],
        ageRange: 'AGE_3_5',
        durationTarget: 'SHORT',
        status: 'READY',
      },
    });
    const narration = await raw.narration.create({
      data: { storyId: story.id, provider: 'mock', status: 'READY' },
    });

    const loaded = await prisma.narration.findUnique({
      where: { id: narration.id },
      include: { story: true },
    });
    expect(loaded?.story.id).toBe(story.id);

    await raw.story.delete({ where: { id: story.id } });
  });
});
