import { Injectable } from '@nestjs/common';
import type { AdminDashboardDto } from '@masalim/types';
import { REVIEWABLE_MODERATION_VERDICTS } from '@masalim/validation';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Clock } from '../../core/time/clock';
import { AWAITING_FULFILMENT_STATUSES } from './admin-orders.service';

/**
 * The operating day.
 *
 * "Today" means today in İstanbul for the people running the service, not in
 * UTC — a shift that starts at 09:00 local would otherwise open on numbers that
 * are three hours into yesterday. This matches the default `User.timezone`.
 */
const OPERATIONS_TIMEZONE = 'Europe/Istanbul';

/** Subscription states a paying, entitled family is in right now. */
const LIVE_SUBSCRIPTION_STATUSES = ['ACTIVE', 'TRIALING', 'IN_GRACE_PERIOD'] as const;

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /**
   * The numbers a shift opens on.
   *
   * Aggregates only. There is no drill-through from here into a family's
   * library: this page answers "is the service healthy and what is queued",
   * and every question that needs a name has its own audited route.
   */
  async stats(): Promise<AdminDashboardDto> {
    const now = this.clock.now();
    const dayStart = startOfDayIn(OPERATIONS_TIMEZONE, now);

    const [
      storiesGeneratedToday,
      storiesFailedToday,
      ordersAwaitingFulfilment,
      moderationQueueDepth,
      activeSubscriptions,
      newUsersToday,
      aiSpend,
      aiFailuresToday,
    ] = await Promise.all([
      this.prisma.raw.story.count({
        where: { createdAt: { gte: dayStart }, status: 'READY' },
      }),
      this.prisma.raw.story.count({
        where: { createdAt: { gte: dayStart }, status: { in: ['FAILED', 'REJECTED'] } },
      }),
      this.prisma.client.order.count({
        where: { status: { in: [...AWAITING_FULFILMENT_STATUSES] } },
      }),
      this.prisma.client.moderationRecord.count({
        where: { verdict: { in: [...REVIEWABLE_MODERATION_VERDICTS] } },
      }),
      this.prisma.client.subscription.count({
        where: { status: { in: [...LIVE_SUBSCRIPTION_STATUSES] } },
      }),
      // `raw`: an account created today and deleted an hour later still happened,
      // and hiding it would make the signup number quietly wrong.
      this.prisma.raw.user.count({ where: { createdAt: { gte: dayStart } } }),
      this.prisma.raw.aIUsageLog.aggregate({
        where: { createdAt: { gte: dayStart } },
        _sum: { estimatedCostMicros: true },
        _count: { _all: true },
      }),
      this.prisma.raw.aIUsageLog.count({
        where: { createdAt: { gte: dayStart }, success: false },
      }),
    ]);

    return {
      storiesGeneratedToday,
      storiesFailedToday,
      ordersAwaitingFulfilment,
      moderationQueueDepth,
      activeSubscriptions,
      newUsersToday,
      // Micros are a BigInt in the database and would not survive JSON as a
      // number, so they cross the wire as a string, like money does.
      aiSpendTodayMicros: (aiSpend._sum.estimatedCostMicros ?? 0n).toString(),
      aiCallsToday: aiSpend._count._all,
      aiFailuresToday,
      day: formatDayIn(OPERATIONS_TIMEZONE, dayStart),
      timezone: OPERATIONS_TIMEZONE,
      generatedAt: now.toISOString(),
    };
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const ZONED_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: OPERATIONS_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function zonedParts(timeZone: string, instant: Date): ZonedParts {
  const formatter =
    timeZone === OPERATIONS_TIMEZONE
      ? ZONED_FORMAT
      : new Intl.DateTimeFormat('en-US', {
          timeZone,
          hourCycle: 'h23',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of formatter.formatToParts(instant)) {
    parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/**
 * Midnight of the local day containing `instant`, as a UTC instant.
 *
 * Derived from the zone's own offset at that moment rather than a hardcoded
 * +03:00, so the numbers stay right if Türkiye ever reintroduces summer time.
 */
function startOfDayIn(timeZone: string, instant: Date): Date {
  const local = zonedParts(timeZone, instant);
  const localAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  const offsetMs = localAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
  const localMidnightAsUtc = Date.UTC(local.year, local.month - 1, local.day);
  return new Date(localMidnightAsUtc - offsetMs);
}

function formatDayIn(timeZone: string, instant: Date): string {
  const local = zonedParts(timeZone, instant);
  const month = String(local.month).padStart(2, '0');
  const day = String(local.day).padStart(2, '0');
  return `${local.year}-${month}-${day}`;
}
