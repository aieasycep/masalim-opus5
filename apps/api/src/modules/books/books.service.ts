import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type AIJobDto,
  type BookDto,
  type BookPageDto,
  type BookRenderDto,
} from '@masalim/types';
import type {
  CreateBookInput,
  RenderBookInput,
  UpdateBookInput,
  UpdateBookPageInput,
} from '@masalim/validation';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PolicyService } from '../../core/policy/policy.service';
import { QueueService } from '../../core/queue/queue.service';
import { AppError } from '../../core/errors/app-error';
import { Clock } from '../../core/time/clock';
import { AssetsService } from '../assets/assets.service';
import { BookRenderService } from './book-render.service';

@Injectable()
export class BooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly queue: QueueService,
    private readonly assets: AssetsService,
    private readonly clock: Clock,
  ) {}

  /**
   * Assembles a book from a story and its illustrations.
   *
   * Pages are materialised as their own rows rather than read through to the
   * story: the Book Builder lets a parent reword a caption or swap an image for
   * the printed copy without touching the story their child already knows.
   */
  async create(userId: string, input: CreateBookInput): Promise<BookDto> {
    const story = await this.policy.assertStory(userId, input.storyId);
    if (story.status !== 'READY') {
      throw new AppError(ERROR_CODES.STORY_NOT_READY);
    }

    const set = await this.policy.assertIllustrationSet(userId, input.illustrationSetId);
    if (set.storyId !== story.id) {
      throw new AppError(
        ERROR_CODES.ILLUSTRATION_SET_NOT_FOUND,
        'Illustration set belongs to a different story',
      );
    }

    const [pages, illustrations] = await Promise.all([
      this.prisma.client.storyPage.findMany({
        where: { storyId: story.id },
        orderBy: { pageNumber: 'asc' },
      }),
      this.prisma.client.illustration.findMany({
        where: { illustrationSetId: set.id, isSelected: true, status: 'READY' },
      }),
    ]);

    const cover = illustrations.find((illustration) => illustration.kind === 'COVER');
    const byStoryPage = new Map(
      illustrations
        .filter((illustration) => illustration.storyPageId)
        .map((illustration) => [illustration.storyPageId, illustration]),
    );

    const book = await this.prisma.client.book.create({
      data: {
        userId,
        storyId: story.id,
        illustrationSetId: set.id,
        title: story.title,
        ...(cover ? { coverIllustrationId: cover.id } : {}),
        status: 'DRAFT',
        storyVersion: story.version,
        pages: {
          create: pages.map((page) => ({
            pageNumber: page.pageNumber,
            storyPageId: page.id,
            text: page.text,
            ...(byStoryPage.get(page.id) ? { illustrationId: byStoryPage.get(page.id)?.id } : {}),
          })),
        },
      },
    });

    return this.findOne(userId, book.id);
  }

  async list(userId: string): Promise<BookDto[]> {
    const books = await this.prisma.client.book.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        pages: { orderBy: { pageNumber: 'asc' }, include: { illustration: true } },
        coverIllustration: true,
      },
    });
    return Promise.all(books.map((book) => this.toDto(book)));
  }

  async findOne(userId: string, bookId: string): Promise<BookDto> {
    await this.policy.assertBook(userId, bookId);
    const book = await this.prisma.client.book.findUniqueOrThrow({
      where: { id: bookId },
      include: {
        pages: { orderBy: { pageNumber: 'asc' }, include: { illustration: true } },
        coverIllustration: true,
      },
    });
    return this.toDto(book);
  }

  /** Autosave target for the Book Builder; every field is optional. */
  async update(userId: string, bookId: string, input: UpdateBookInput): Promise<BookDto> {
    await this.policy.assertBook(userId, bookId);

    if (input.coverIllustrationId) {
      const illustration = await this.policy.assertIllustration(
        userId,
        input.coverIllustrationId,
      );
      if (illustration.illustrationSet.storyId !== (await this.storyIdFor(bookId))) {
        throw new AppError(
          ERROR_CODES.ILLUSTRATION_SET_NOT_FOUND,
          'Cover belongs to a different story',
        );
      }
    }

    await this.prisma.client.book.update({
      where: { id: bookId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
        ...(input.dedication !== undefined ? { dedication: input.dedication } : {}),
        ...(input.backCoverText !== undefined ? { backCoverText: input.backCoverText } : {}),
        ...(input.coverIllustrationId
          ? { coverIllustrationId: input.coverIllustrationId }
          : {}),
      },
    });

    return this.findOne(userId, bookId);
  }

  async updatePage(
    userId: string,
    bookPageId: string,
    input: UpdateBookPageInput,
  ): Promise<BookDto> {
    const page = await this.policy.assertBookPage(userId, bookPageId);

    if (input.illustrationId) {
      const illustration = await this.policy.assertIllustration(userId, input.illustrationId);
      if (illustration.illustrationSet.storyId !== page.book.storyId) {
        throw new AppError(
          ERROR_CODES.ILLUSTRATION_SET_NOT_FOUND,
          'Illustration belongs to a different story',
        );
      }
    }

    await this.prisma.client.bookPage.update({
      where: { id: bookPageId },
      data: {
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.illustrationId ? { illustrationId: input.illustrationId } : {}),
        ...(input.layout ? { layout: input.layout } : {}),
      },
    });

    return this.findOne(userId, page.bookId);
  }

  async remove(userId: string, bookId: string): Promise<void> {
    await this.policy.assertBook(userId, bookId);
    await this.prisma.client.book.update({
      where: { id: bookId },
      data: { deletedAt: this.clock.now() },
    });
  }

  /**
   * Queues a render.
   *
   * `DIGITAL_PREVIEW` is what the parent flips through in the app;
   * `PRINT_PDF` is the 300 DPI file with bleed that a printer receives. They are
   * separate artifacts because they have genuinely different requirements, and
   * showing a print file in a phone reader would be both enormous and wrong.
   */
  async render(
    userId: string,
    bookId: string,
    input: RenderBookInput,
  ): Promise<{ render: BookRenderDto; job: AIJobDto }> {
    const book = await this.policy.assertBook(userId, bookId);

    const pages = await this.prisma.client.bookPage.count({ where: { bookId } });
    if (pages === 0) {
      throw new AppError(ERROR_CODES.BOOK_NOT_READY_FOR_PRINT, 'The book has no pages');
    }

    if (input.kind === 'PRINT_PDF') {
      const missing = await this.prisma.client.bookPage.count({
        where: { bookId, illustrationId: null },
      });
      if (missing > 0 || !book.coverIllustrationId) {
        // A printed book with blank pages is not something to discover after
        // paying for it.
        throw new AppError(
          ERROR_CODES.BOOK_NOT_READY_FOR_PRINT,
          'Every page and the cover need an illustration before printing',
        );
      }
    }

    const render = await this.prisma.client.bookRender.create({
      data: { bookId, kind: input.kind, status: 'PENDING' },
    });

    const job = await this.queue.enqueue({
      type: input.kind === 'PRINT_PDF' ? 'PRINT_FILE_GENERATION' : 'BOOK_RENDER',
      userId,
      entityType: 'bookRender',
      entityId: render.id,
      totalSteps: BookRenderService.TOTAL_STEPS,
      idempotencyKey: input.idempotencyKey,
    });

    return { render: await this.toRenderDto(render), job };
  }

  async listRenders(userId: string, bookId: string): Promise<BookRenderDto[]> {
    await this.policy.assertBook(userId, bookId);
    const renders = await this.prisma.client.bookRender.findMany({
      where: { bookId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(renders.map((render) => this.toRenderDto(render)));
  }

  private async storyIdFor(bookId: string): Promise<string> {
    const book = await this.prisma.client.book.findUniqueOrThrow({
      where: { id: bookId },
      select: { storyId: true },
    });
    return book.storyId;
  }

  async toRenderDto(render: {
    id: string;
    bookId: string;
    kind: BookRenderDto['kind'];
    status: BookRenderDto['status'];
    assetId: string | null;
    errorCode: string | null;
    createdAt: Date;
  }): Promise<BookRenderDto> {
    return {
      id: render.id,
      bookId: render.bookId,
      kind: render.kind,
      status: render.status,
      fileUrl: await this.assets.signedUrlForAsset(render.assetId),
      errorCode: render.errorCode,
      createdAt: render.createdAt.toISOString(),
    };
  }

  async toDto(book: {
    id: string;
    storyId: string;
    title: string;
    subtitle: string | null;
    dedication: string | null;
    backCoverText: string | null;
    status: BookDto['status'];
    createdAt: Date;
    updatedAt: Date;
    coverIllustration: { assetId: string | null } | null;
    pages: Array<{
      id: string;
      pageNumber: number;
      storyPageId: string | null;
      text: string;
      layout: BookPageDto['layout'];
      illustration: { assetId: string | null } | null;
    }>;
  }): Promise<BookDto> {
    const [coverImageUrl, pageUrls] = await Promise.all([
      this.assets.signedUrlForAsset(book.coverIllustration?.assetId ?? null),
      Promise.all(
        book.pages.map((page) =>
          this.assets.signedUrlForAsset(page.illustration?.assetId ?? null),
        ),
      ),
    ]);

    return {
      id: book.id,
      storyId: book.storyId,
      title: book.title,
      subtitle: book.subtitle,
      dedication: book.dedication,
      backCoverText: book.backCoverText,
      coverImageUrl,
      status: book.status,
      pages: book.pages.map((page, index) => ({
        id: page.id,
        pageNumber: page.pageNumber,
        storyPageId: page.storyPageId,
        text: page.text,
        imageUrl: pageUrls[index] ?? null,
        layout: page.layout,
      })),
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString(),
    };
  }
}
