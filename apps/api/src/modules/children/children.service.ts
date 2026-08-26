import { Injectable } from '@nestjs/common';
import {
  ageRangeFromAge,
  ERROR_CODES,
  type AgeRange,
  type ChildDto,
  type InterestDto,
} from '@masalim/types';
import type { CreateChildInput, UpdateChildInput } from '@masalim/validation';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PolicyService } from '../../core/policy/policy.service';
import { AppError } from '../../core/errors/app-error';
import { Clock } from '../../core/time/clock';
import { AssetsService } from '../assets/assets.service';

const MAX_CHILDREN_PER_USER = 8;

type ChildWithRelations = {
  id: string;
  name: string;
  birthDate: Date | null;
  ageRange: AgeRange;
  avatarAssetId: string | null;
  customInterests: string[];
  createdAt: Date;
  interests: Array<{ interest: { id: string; slug: string; labelKey: string; emoji: string } }>;
  _count?: { stories: number };
};

@Injectable()
export class ChildrenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly assets: AssetsService,
    private readonly clock: Clock,
  ) {}

  async list(userId: string): Promise<ChildDto[]> {
    const children = await this.prisma.client.child.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: {
        interests: { include: { interest: true } },
        _count: { select: { stories: true } },
      },
    });
    return Promise.all(children.map((child) => this.toDto(child)));
  }

  async findOne(userId: string, childId: string): Promise<ChildDto> {
    await this.policy.assertChild(userId, childId);
    const child = await this.prisma.client.child.findUniqueOrThrow({
      where: { id: childId },
      include: {
        interests: { include: { interest: true } },
        _count: { select: { stories: true } },
      },
    });
    return this.toDto(child);
  }

  async create(userId: string, input: CreateChildInput): Promise<ChildDto> {
    const existing = await this.prisma.client.child.count({ where: { userId } });
    if (existing >= MAX_CHILDREN_PER_USER) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Maximum number of children reached');
    }

    if (input.avatarAssetId) {
      await this.policy.assertAsset(userId, input.avatarAssetId);
    }

    const interestIds = await this.resolveInterestIds(input.interestSlugs);
    const ageRange = this.resolveAgeRange(input.birthDate, input.ageRange);

    const child = await this.prisma.client.child.create({
      data: {
        userId,
        name: input.name,
        ...(input.birthDate ? { birthDate: new Date(`${input.birthDate}T00:00:00.000Z`) } : {}),
        ageRange,
        ...(input.avatarAssetId ? { avatarAssetId: input.avatarAssetId } : {}),
        customInterests: input.customInterests,
        preferences: input.preferences,
        interests: { create: interestIds.map((interestId) => ({ interestId })) },
      },
      include: {
        interests: { include: { interest: true } },
        _count: { select: { stories: true } },
      },
    });

    return this.toDto(child);
  }

  async update(userId: string, childId: string, input: UpdateChildInput): Promise<ChildDto> {
    const existing = await this.policy.assertChild(userId, childId);

    if (input.avatarAssetId) {
      await this.policy.assertAsset(userId, input.avatarAssetId);
    }

    // An explicit null clears the date, so the band the parent picked is what
    // decides the age from here on rather than a value they moved away from.
    const ageRange =
      input.birthDate !== undefined || input.ageRange !== undefined
        ? this.resolveAgeRange(
            input.birthDate ?? undefined,
            input.ageRange ?? existing.ageRange,
          )
        : existing.ageRange;

    await this.prisma.client.$transaction(async (tx) => {
      if (input.interestSlugs) {
        const interestIds = await this.resolveInterestIds(input.interestSlugs);
        await tx.childInterest.deleteMany({ where: { childId } });
        await tx.childInterest.createMany({
          data: interestIds.map((interestId) => ({ childId, interestId })),
        });
      }

      await tx.child.update({
        where: { id: childId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.birthDate !== undefined
            ? {
                birthDate:
                  input.birthDate === null
                    ? null
                    : new Date(`${input.birthDate}T00:00:00.000Z`),
              }
            : {}),
          ageRange,
          ...(input.avatarAssetId !== undefined
            ? { avatarAssetId: input.avatarAssetId }
            : {}),
          ...(input.customInterests !== undefined
            ? { customInterests: input.customInterests }
            : {}),
          ...(input.preferences !== undefined ? { preferences: input.preferences } : {}),
        },
      });
    });

    return this.findOne(userId, childId);
  }

  /**
   * Soft-deletes a child profile.
   *
   * Their stories stay in the library — a family memory should not disappear
   * because a profile was tidied up — but the story's `childId` is left intact
   * so the association survives if the profile is ever restored.
   */
  async remove(userId: string, childId: string): Promise<void> {
    await this.policy.assertChild(userId, childId);
    await this.prisma.client.child.update({
      where: { id: childId },
      data: { deletedAt: this.clock.now() },
    });
  }

  async listInterests(): Promise<InterestDto[]> {
    const interests = await this.prisma.client.interest.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return interests.map((interest) => ({
      id: interest.id,
      slug: interest.slug,
      labelKey: interest.labelKey,
      emoji: interest.emoji,
    }));
  }

  private async resolveInterestIds(slugs: string[]): Promise<string[]> {
    if (slugs.length === 0) return [];
    const interests = await this.prisma.client.interest.findMany({
      where: { slug: { in: slugs }, isActive: true },
      select: { id: true },
    });
    return interests.map((interest) => interest.id);
  }

  private resolveAgeRange(birthDate: string | undefined, fallback?: AgeRange): AgeRange {
    if (birthDate) {
      return ageRangeFromAge(this.ageInYears(new Date(`${birthDate}T00:00:00.000Z`)));
    }
    if (fallback) return fallback;
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Age is required', {
      details: [{ path: 'ageRange', code: 'AGE_REQUIRED' }],
    });
  }

  private ageInYears(birthDate: Date): number {
    const now = this.clock.now();
    let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
      age -= 1;
    }
    return Math.max(0, age);
  }

  private async toDto(child: ChildWithRelations): Promise<ChildDto> {
    return {
      id: child.id,
      name: child.name,
      birthDate: child.birthDate ? child.birthDate.toISOString().slice(0, 10) : null,
      ageRange: child.ageRange,
      ageInYears: child.birthDate ? this.ageInYears(child.birthDate) : null,
      avatarUrl: await this.assets.signedUrlForAsset(child.avatarAssetId),
      interests: child.interests.map(({ interest }) => ({
        id: interest.id,
        slug: interest.slug,
        labelKey: interest.labelKey,
        emoji: interest.emoji,
      })),
      customInterests: child.customInterests,
      storyCount: child._count?.stories ?? 0,
      createdAt: child.createdAt.toISOString(),
    };
  }
}
