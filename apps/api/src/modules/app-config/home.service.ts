import { Injectable } from '@nestjs/common';
import { ENTITLEMENT_KEYS, type HomeDto, type StorySummaryDto } from '@masalim/types';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EntitlementsService } from '../../core/entitlements/entitlements.service';
import { Clock } from '../../core/time/clock';
import { ChildrenService } from '../children/children.service';
import { StoriesService } from '../stories/stories.service';
import { QueueService } from '../../core/queue/queue.service';

/** Local hours that decide which greeting the Home header shows. */
const EVENING_FROM = 18;
const MORNING_UNTIL = 11;

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly children: ChildrenService,
    private readonly stories: StoriesService,
    private readonly entitlements: EntitlementsService,
    private readonly queue: QueueService,
    private readonly clock: Clock,
  ) {}

  /**
   * Everything the Home screen renders, in one request.
   *
   * Home is the first thing a parent sees after opening the app, often on a
   * phone connection at bedtime. Four round trips to assemble one screen is four
   * chances to show a spinner.
   */
  async forUser(userId: string): Promise<HomeDto> {
    const [children, recent, favourites, progress, activeJob, usage, entitlements] =
      await Promise.all([
        this.children.list(userId),
        this.stories.list(userId, { limit: 10, filter: 'all', sort: 'recent' }),
        this.stories.list(userId, { limit: 6, filter: 'favourites', sort: 'recent' }),
        this.prisma.client.storyProgress.findFirst({
          where: { userId, completed: false },
          orderBy: { updatedAt: 'desc' },
          include: { narration: true },
        }),
        this.prisma.client.aIJob.findFirst({
          where: { userId, status: { in: ['QUEUED', 'PROCESSING'] } },
          orderBy: { createdAt: 'desc' },
        }),
        this.entitlements.usageFor(userId, ENTITLEMENT_KEYS.STORY_MONTHLY_LIMIT),
        this.entitlements.entitlementsFor(userId),
      ]);

    const continueListening = await this.toContinueListening(userId, progress);

    return {
      greetingKey: this.greetingKey(),
      children,
      continueListening,
      recentStories: recent.items,
      favourites: favourites.items,
      activeJob: activeJob ? this.queue.toDto(activeJob) : null,
      storiesThisMonth: usage,
      storyLimit: entitlements[ENTITLEMENT_KEYS.STORY_MONTHLY_LIMIT],
    };
  }

  private async toContinueListening(
    userId: string,
    progress: {
      storyId: string;
      narrationId: string;
      positionSeconds: number;
      narration: { durationSeconds: number | null };
    } | null,
  ): Promise<HomeDto['continueListening']> {
    if (!progress) return null;

    // The story may since have been deleted; Home quietly drops the card rather
    // than failing to load.
    const story = await this.storySummary(userId, progress.storyId);
    if (!story) return null;

    return {
      story,
      narrationId: progress.narrationId,
      positionSeconds: progress.positionSeconds,
      durationSeconds: progress.narration.durationSeconds,
    };
  }

  private async storySummary(
    userId: string,
    storyId: string,
  ): Promise<StorySummaryDto | null> {
    const exists = await this.prisma.client.story.findUnique({ where: { id: storyId } });
    if (!exists || exists.userId !== userId || exists.deletedAt) return null;

    const full = await this.stories.findOne(userId, storyId);
    return {
      id: full.id,
      title: full.title,
      summary: full.summary,
      childId: full.childId,
      childName: full.childName,
      themes: full.themes,
      ageRange: full.ageRange,
      status: full.status,
      coverImageUrl: full.coverImageUrl,
      durationSeconds: full.durationSeconds,
      narratorLabel: full.narratorLabel,
      hasBook: full.hasBook,
      hasIllustrations: full.hasIllustrations,
      isFavourite: full.isFavourite,
      createdAt: full.createdAt,
    };
  }

  /**
   * The Home header greeting.
   *
   * Turkish evenings are when this app is used; the copy differs enough between
   * "İyi akşamlar" and "Günaydın" that showing the wrong one at bedtime reads as
   * carelessness.
   */
  private greetingKey(): string {
    const hour = this.clock.now().getHours();
    if (hour >= EVENING_FROM || hour < 5) return 'home.greetingEvening';
    if (hour < MORNING_UNTIL) return 'home.greetingMorning';
    return 'home.greetingAfternoon';
  }
}
