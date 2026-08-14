import { Injectable } from '@nestjs/common';
import {
  renderBookPdf,
  toDataUri,
  type RenderableBook,
  type RenderablePage,
} from '@masalim/book-render';
import { ERROR_CODES, type BookSize } from '@masalim/types';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError } from '../../core/errors/app-error';
import { AppLogger } from '../../core/logger/logger.service';
import { AssetsService } from '../assets/assets.service';
import type { JobStepReporter } from '../../core/queue/queue.constants';

export interface RenderBookParams {
  bookRenderId: string;
  userId: string;
  jobId: string;
}

/** Default trim when the book has not been configured for a physical product yet. */
const PREVIEW_BOOK_SIZE: BookSize = 'SQUARE';

@Injectable()
export class BookRenderService {
  /** Gather, render, publish. */
  static readonly TOTAL_STEPS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly logger: AppLogger,
  ) {}

  async render(params: RenderBookParams, reporter: JobStepReporter): Promise<void> {
    const log = this.logger.child({
      bookRenderId: params.bookRenderId,
      userId: params.userId,
      jobId: params.jobId,
    });

    const render = await this.prisma.client.bookRender.findUnique({
      where: { id: params.bookRenderId },
      include: {
        book: {
          include: {
            story: { include: { child: true } },
            coverIllustration: true,
            pages: { orderBy: { pageNumber: 'asc' }, include: { illustration: true } },
          },
        },
      },
    });
    if (!render) {
      throw new AppError(ERROR_CODES.BOOK_NOT_FOUND);
    }

    await this.prisma.client.bookRender.update({
      where: { id: render.id },
      data: { status: 'PROCESSING', errorCode: null },
    });

    try {
      // ---- Step 1: pull every image into the document ---------------------
      await reporter.step('job.book.gathering', 1);

      const { book } = render;
      const coverImageSrc = await this.inline(book.coverIllustration?.assetId ?? null);

      const pages: RenderablePage[] = await Promise.all(
        book.pages.map(async (page) => ({
          pageNumber: page.pageNumber,
          text: page.text,
          layout: page.layout,
          imageSrc: await this.inline(page.illustration?.assetId ?? null),
        })),
      );

      const renderable: RenderableBook = {
        title: book.title,
        subtitle: book.subtitle,
        dedication: book.dedication,
        backCoverText: book.backCoverText,
        coverImageSrc,
        pages,
        childName: book.story.child?.name ?? null,
        createdAtLabel: book.createdAt.toLocaleDateString('tr-TR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      };

      // ---- Step 2: render --------------------------------------------------
      await reporter.step('job.book.rendering', 2);

      const isPrint = render.kind === 'PRINT_PDF';
      const bookSize = await this.bookSizeFor(book.id, isPrint);

      const result = await renderBookPdf(renderable, {
        bookSize,
        target: isPrint ? 'print' : 'preview',
      });

      // ---- Step 3: publish -------------------------------------------------
      await reporter.step('job.book.saving', 3);

      const asset = await this.assets.createInternalAsset({
        userId: params.userId,
        kind: isPrint ? 'PRINT_PDF' : 'BOOK_PREVIEW',
        body: result.pdf,
        contentType: 'application/pdf',
      });

      await this.prisma.client.bookRender.update({
        where: { id: render.id },
        data: {
          status: 'READY',
          assetId: asset.id,
          // A checksum, so a printer that receives the same file twice can tell,
          // and so a re-render that changed nothing is visible as such.
          checksum: createHash('sha256').update(result.pdf).digest('hex'),
        },
      });

      // A rendered book is READY; ORDERED is set when an order is placed, and
      // re-rendering a print file for an already-ordered book must not walk that
      // back.
      if (book.status === 'DRAFT') {
        await this.prisma.client.book.update({
          where: { id: book.id },
          data: { status: 'READY' },
        });
      }

      log.info(
        { kind: render.kind, pages: result.pageCount, bytes: result.pdf.byteLength },
        'book rendered',
      );
    } catch (error) {
      await this.prisma.client.bookRender
        .update({
          where: { id: render.id },
          data: { status: 'FAILED', errorCode: ERROR_CODES.BOOK_RENDER_FAILED },
        })
        .catch(() => undefined);

      if (error instanceof AppError) throw error;
      throw new AppError(ERROR_CODES.BOOK_RENDER_FAILED, 'The book could not be rendered', {
        cause: error,
      });
    }
  }

  /**
   * A print file is cut to the size that was actually ordered.
   *
   * Rendering the preview trim and hoping the printer scales it is how a book
   * arrives with the text creeping into the gutter.
   */
  private async bookSizeFor(bookId: string, isPrint: boolean): Promise<BookSize> {
    if (!isPrint) return PREVIEW_BOOK_SIZE;

    const order = await this.prisma.client.order.findFirst({
      where: { bookId },
      orderBy: { createdAt: 'desc' },
      include: { printProduct: true },
    });

    return order?.printProduct.bookSize ?? PREVIEW_BOOK_SIZE;
  }

  private async inline(assetId: string | null): Promise<string | null> {
    if (!assetId) return null;
    const asset = await this.prisma.client.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.deletedAt) return null;

    const body = await this.assets.readAsset(assetId).catch(() => null);
    return body ? toDataUri(body, asset.contentType) : null;
  }
}
