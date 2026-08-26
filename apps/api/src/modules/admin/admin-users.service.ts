import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type AdminDeletionRequestDto,
  type AdminUserDetailDto,
  type AdminUserSummaryDto,
  type Paginated,
} from '@masalim/types';
import type { AdminUserSearchInput } from '@masalim/validation';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError } from '../../core/errors/app-error';
import { Clock } from '../../core/time/clock';
import { ADMIN_AUDIT_ACTIONS, AdminAuditService } from './admin-audit.service';
import type { AdminCallContext } from './admin.decorators';

const RECENT_ACTIVITY_DAYS = 30;

/**
 * Counts, filtered the way a parent would see them: a child they removed is not
 * one of their children any more, and support quoting a number back to them
 * should quote the same one.
 */
const ACCOUNT_COUNTS = {
  select: {
    children: { where: { deletedAt: null } },
    stories: { where: { deletedAt: null } },
    orders: true,
  },
} as const;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly clock: Clock,
  ) {}

  /**
   * Finds the family that got in touch.
   *
   * Matches on email or account id only — the search box is not a directory,
   * and a child's name is not a way to look a parent up. `raw` because support
   * must be able to find an account that is mid-deletion, which is precisely
   * when someone calls to ask about it.
   */
  async search(input: AdminUserSearchInput): Promise<Paginated<AdminUserSummaryDto>> {
    const rows = await this.prisma.raw.user.findMany({
      where: {
        OR: [{ email: { contains: input.query, mode: 'insensitive' } }, { id: input.query }],
        ...(input.includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: { _count: ACCOUNT_COUNTS },
    });

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map((user) => this.toSummaryDto(user)),
      ...(hasMore && last ? { nextCursor: last.id } : {}),
    };
  }

  /**
   * One account, in counts.
   *
   * Children are counted, never named; stories are counted, never quoted. What
   * support needs to answer "did my order go through, and why did my story
   * fail" is here, and nothing beyond it. The read is audited because the email
   * and the shape of a family's usage are still theirs, not ours.
   */
  async findOne(caller: AdminCallContext, userId: string): Promise<AdminUserDetailDto> {
    const user = await this.prisma.raw.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            children: { where: { deletedAt: null } },
            stories: { where: { deletedAt: null } },
            orders: true,
            voiceProfiles: { where: { deletedAt: null } },
            books: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!user) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found');
    }

    const since = this.clock.plusDays(-RECENT_ACTIVITY_DAYS);
    const [storiesLast30Days, openDeletionRequests] = await Promise.all([
      this.prisma.raw.story.count({
        where: { userId, deletedAt: null, createdAt: { gte: since } },
      }),
      this.prisma.raw.deletionRequest.count({
        where: { userId, status: { in: ['SCHEDULED', 'PROCESSING'] } },
      }),
    ]);

    await this.audit.recordFor(caller, {
      action: ADMIN_AUDIT_ACTIONS.USER_VIEW,
      subjectType: 'user',
      subjectId: user.id,
    });

    return {
      ...this.toSummaryDto(user),
      name: user.name,
      timezone: user.timezone,
      onboardingCompleted: user.onboardingCompleted,
      voiceProfileCount: user._count.voiceProfiles,
      bookCount: user._count.books,
      storiesLast30Days,
      openDeletionRequests,
    };
  }

  /**
   * A family's deletion requests.
   *
   * The one question support cannot answer from anywhere else: whether "delete
   * my account" is actually scheduled, and for when. Audited, because looking
   * is itself an action against a family that asked to be forgotten.
   */
  async deletionRequests(
    caller: AdminCallContext,
    userId: string,
  ): Promise<AdminDeletionRequestDto[]> {
    const user = await this.prisma.raw.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found');
    }

    const requests = await this.prisma.raw.deletionRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    await this.audit.recordFor(caller, {
      action: ADMIN_AUDIT_ACTIONS.USER_DELETION_REQUESTS_VIEW,
      subjectType: 'user',
      subjectId: userId,
      metadata: { requestCount: requests.length },
    });

    return requests.map((request) => ({
      id: request.id,
      userId: request.userId,
      type: request.type,
      status: request.status,
      scheduledFor: request.scheduledFor.toISOString(),
      completedAt: request.completedAt?.toISOString() ?? null,
      reason: request.reason,
      errorMessage: request.errorMessage,
      createdAt: request.createdAt.toISOString(),
    }));
  }

  private toSummaryDto(user: {
    id: string;
    email: string;
    locale: AdminUserSummaryDto['locale'];
    subscriptionTier: AdminUserSummaryDto['subscriptionTier'];
    subscriptionStatus: AdminUserSummaryDto['subscriptionStatus'];
    createdAt: Date;
    lastSeenAt: Date | null;
    deletedAt: Date | null;
    _count: { children: number; stories: number; orders: number };
  }): AdminUserSummaryDto {
    return {
      id: user.id,
      email: user.email,
      locale: user.locale,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      childCount: user._count.children,
      storyCount: user._count.stories,
      orderCount: user._count.orders,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      deletedAt: user.deletedAt?.toISOString() ?? null,
    };
  }
}
