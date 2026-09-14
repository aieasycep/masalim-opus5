import { Injectable } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@masalim/types';
import type {
  Address,
  AIJob,
  Asset,
  Book,
  BookPage,
  Child,
  Illustration,
  IllustrationSet,
  Narration,
  Order,
  Story,
  StoryPage,
  VoiceProfile,
} from '@masalim/database';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../errors/app-error';

/**
 * Ownership and liveness checks, in exactly one place.
 *
 * Every private entity is fetched through here rather than by each controller
 * repeating `where: { id, userId }`. That is what stops an IDOR from creeping in
 * the day someone adds a new endpoint and forgets the userId clause.
 *
 * Two deliberate choices:
 *
 *  - A resource that exists but belongs to somebody else returns **not found**,
 *    not forbidden. Distinguishing the two would let anyone enumerate which
 *    story or voice ids are real.
 *  - Soft-deleted rows are treated as absent, because `findUnique` is the one
 *    read the soft-delete extension cannot filter.
 */
@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService) {}

  private deny(code: ErrorCode): never {
    throw new AppError(code);
  }

  async assertChild(userId: string, childId: string): Promise<Child> {
    const child = await this.prisma.client.child.findUnique({ where: { id: childId } });
    if (!child || child.userId !== userId || child.deletedAt) {
      this.deny(ERROR_CODES.CHILD_NOT_FOUND);
    }
    return child;
  }

  async assertStory(userId: string, storyId: string): Promise<Story> {
    const story = await this.prisma.client.story.findUnique({ where: { id: storyId } });
    if (!story || story.userId !== userId || story.deletedAt) {
      this.deny(ERROR_CODES.STORY_NOT_FOUND);
    }
    return story;
  }

  async assertVoiceProfile(userId: string, voiceProfileId: string): Promise<VoiceProfile> {
    const voice = await this.prisma.client.voiceProfile.findUnique({
      where: { id: voiceProfileId },
    });
    if (!voice || voice.userId !== userId || voice.deletedAt) {
      this.deny(ERROR_CODES.VOICE_PROFILE_NOT_FOUND);
    }
    return voice;
  }

  async assertBook(userId: string, bookId: string): Promise<Book> {
    const book = await this.prisma.client.book.findUnique({ where: { id: bookId } });
    if (!book || book.userId !== userId || book.deletedAt) {
      this.deny(ERROR_CODES.BOOK_NOT_FOUND);
    }
    return book;
  }

  async assertOrder(userId: string, orderId: string): Promise<Order> {
    const order = await this.prisma.client.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) {
      this.deny(ERROR_CODES.ORDER_NOT_FOUND);
    }
    return order;
  }

  async assertAddress(userId: string, addressId: string): Promise<Address> {
    const address = await this.prisma.client.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId || address.deletedAt) {
      this.deny(ERROR_CODES.ADDRESS_NOT_FOUND);
    }
    return address;
  }

  async assertAsset(userId: string, assetId: string): Promise<Asset> {
    const asset = await this.prisma.client.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.userId !== userId || asset.deletedAt) {
      this.deny(ERROR_CODES.ASSET_NOT_FOUND);
    }
    return asset;
  }

  async assertJob(userId: string, jobId: string): Promise<AIJob> {
    const job = await this.prisma.client.aIJob.findUnique({ where: { id: jobId } });
    if (!job || job.userId !== userId) {
      this.deny(ERROR_CODES.JOB_NOT_FOUND);
    }
    return job;
  }

  /** Narrations are owned transitively through their story. */
  async assertNarration(userId: string, narrationId: string): Promise<Narration & { story: Story }> {
    const narration = await this.prisma.client.narration.findUnique({
      where: { id: narrationId },
      include: { story: true },
    });
    if (!narration || narration.story.userId !== userId || narration.story.deletedAt) {
      this.deny(ERROR_CODES.NARRATION_NOT_FOUND);
    }
    return narration;
  }

  /** Illustration sets are owned transitively through their story. */
  async assertIllustrationSet(userId: string, illustrationSetId: string): Promise<IllustrationSet & { story: Story }> {
    const set = await this.prisma.client.illustrationSet.findUnique({
      where: { id: illustrationSetId },
      include: { story: true },
    });
    if (!set || set.story.userId !== userId || set.story.deletedAt) {
      this.deny(ERROR_CODES.ILLUSTRATION_SET_NOT_FOUND);
    }
    return set;
  }

  /** Illustrations are owned through set -> story. */
  async assertIllustration(userId: string, illustrationId: string): Promise<Illustration & { illustrationSet: IllustrationSet & { story: Story } }> {
    const illustration = await this.prisma.client.illustration.findUnique({
      where: { id: illustrationId },
      include: { illustrationSet: { include: { story: true } } },
    });
    if (
      !illustration ||
      illustration.illustrationSet.story.userId !== userId ||
      illustration.illustrationSet.story.deletedAt
    ) {
      this.deny(ERROR_CODES.ILLUSTRATION_SET_NOT_FOUND);
    }
    return illustration;
  }

  /** Book pages are owned through their book. */
  async assertBookPage(userId: string, bookPageId: string): Promise<BookPage & { book: Book }> {
    const page = await this.prisma.client.bookPage.findUnique({
      where: { id: bookPageId },
      include: { book: true },
    });
    if (!page || page.book.userId !== userId || page.book.deletedAt) {
      this.deny(ERROR_CODES.BOOK_NOT_FOUND);
    }
    return page;
  }

  /** Story pages are owned through their story. */
  async assertStoryPage(userId: string, storyPageId: string): Promise<StoryPage & { story: Story }> {
    const page = await this.prisma.client.storyPage.findUnique({
      where: { id: storyPageId },
      include: { story: true },
    });
    if (!page || page.story.userId !== userId || page.story.deletedAt) {
      this.deny(ERROR_CODES.STORY_NOT_FOUND);
    }
    return page;
  }
}
