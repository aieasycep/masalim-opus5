import { Injectable } from '@nestjs/common';
import { normaliseAmount, quotePrice, PricingError, type PriceBreakdown } from '@masalim/payments';
import {
  ENTITLEMENT_KEYS,
  ERROR_CODES,
  type BookSize,
  type CoverType,
  type PrintProductDto,
} from '@masalim/types';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EntitlementsService } from '../../core/entitlements/entitlements.service';
import { AppError } from '../../core/errors/app-error';

export interface QuoteParams {
  userId: string;
  bookId: string;
  bookSize: BookSize;
  coverType: CoverType;
  quantity: number;
  /** Optional at quote time; the shipping rate falls back to the default city. */
  city?: string | undefined;
}

export interface ResolvedQuote {
  breakdown: PriceBreakdown;
  printProductId: string;
  pageCount: number;
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async listProducts(): Promise<PrintProductDto[]> {
    const products = await this.prisma.client.printProduct.findMany({
      where: { isActive: true },
      orderBy: [{ bookSize: 'asc' }, { coverType: 'asc' }],
    });

    return products.map((product) => ({
      id: product.id,
      sku: product.sku,
      bookSize: product.bookSize,
      coverType: product.coverType,
      displayNameKey: product.displayNameKey,
      basePrice: {
        amount: normaliseAmount(product.basePrice.toString()),
        currency: product.currency,
      },
      perPagePrice: {
        amount: normaliseAmount(product.perPagePrice.toString()),
        currency: product.currency,
      },
      includedPages: product.includedPages,
      minPages: product.minPages,
      maxPages: product.maxPages,
      productionDays: product.productionDays,
    }));
  }

  /**
   * The price of a configuration.
   *
   * Everything comes from the catalogue and the book itself: the client chooses
   * *what* to buy, never what it costs. The same call produces the quote shown
   * at checkout and the amount written onto the order, so the number the parent
   * agreed to is the number they are charged (master prompt §82).
   */
  async quote(params: QuoteParams): Promise<ResolvedQuote> {
    const product = await this.prisma.client.printProduct.findFirst({
      where: {
        bookSize: params.bookSize,
        coverType: params.coverType,
        isActive: true,
      },
    });
    if (!product) {
      throw new AppError(ERROR_CODES.PRODUCT_UNAVAILABLE, 'That format is not available');
    }

    const pageCount = await this.prisma.client.bookPage.count({
      where: { bookId: params.bookId },
    });

    const shipping = await this.shippingRateFor(params.city);

    const discountPercent = (await this.entitlements.entitlementsFor(params.userId))[
      ENTITLEMENT_KEYS.PHYSICAL_BOOK_DISCOUNT_PERCENT
    ];

    try {
      const breakdown = quotePrice({
        product: {
          id: product.id,
          sku: product.sku,
          basePrice: product.basePrice.toString(),
          perPagePrice: product.perPagePrice.toString(),
          includedPages: product.includedPages,
          minPages: product.minPages,
          maxPages: product.maxPages,
          currency: product.currency,
          productionDays: product.productionDays,
        },
        shipping,
        pageCount,
        quantity: params.quantity,
        discountPercent,
      });

      return { breakdown, printProductId: product.id, pageCount };
    } catch (error) {
      if (error instanceof PricingError) {
        throw new AppError(
          error.code === 'PAGE_COUNT_OUT_OF_RANGE'
            ? ERROR_CODES.BOOK_NOT_READY_FOR_PRINT
            : ERROR_CODES.VALIDATION_FAILED,
          error.message,
        );
      }
      throw error;
    }
  }

  /**
   * The shipping rate for a city, falling back to the country-wide default.
   *
   * A city-specific row wins; the row with a null city is the default. Missing
   * both is a misconfigured catalogue, not something to paper over with a
   * guessed price.
   */
  private async shippingRateFor(city: string | undefined) {
    const rates = await this.prisma.client.shippingRate.findMany({
      where: {
        countryCode: 'TR',
        isActive: true,
        ...(city ? { OR: [{ city }, { city: null }] } : { city: null }),
      },
    });

    const rate = rates.find((candidate) => candidate.city === city) ?? rates[0];
    if (!rate) {
      throw new AppError(
        ERROR_CODES.PRODUCT_UNAVAILABLE,
        'No shipping rate is configured for this destination',
      );
    }

    return {
      price: rate.price.toString(),
      freeAboveSubtotal: rate.freeAboveSubtotal?.toString() ?? null,
      minDeliveryDays: rate.minDeliveryDays,
      maxDeliveryDays: rate.maxDeliveryDays,
    };
  }
}
