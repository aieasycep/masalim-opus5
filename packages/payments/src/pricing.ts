import type { Currency } from '@masalim/types';
import { fromDecimalString, percentOf, toDecimalString, type Minor } from './money';

export interface PricingProduct {
  id: string;
  sku: string;
  /** Decimal strings, exactly as stored. */
  basePrice: string;
  perPagePrice: string;
  includedPages: number;
  minPages: number;
  maxPages: number;
  currency: Currency;
  productionDays: number;
}

export interface PricingShipping {
  price: string;
  freeAboveSubtotal: string | null;
  minDeliveryDays: number;
  maxDeliveryDays: number;
}

export interface PriceQuoteRequest {
  product: PricingProduct;
  shipping: PricingShipping;
  pageCount: number;
  quantity: number;
  /** Premium members' standing discount on physical books. */
  discountPercent: number;
}

export interface PriceBreakdown {
  unitPrice: string;
  subtotal: string;
  discount: string;
  shipping: string;
  total: string;
  currency: Currency;
  quantity: number;
  pageCount: number;
  /** Pages charged beyond the product's included allowance. */
  extraPages: number;
  estimatedDeliveryMin: number;
  estimatedDeliveryMax: number;
}

export class PricingError extends Error {
  constructor(
    message: string,
    readonly code: 'PAGE_COUNT_OUT_OF_RANGE' | 'INVALID_QUANTITY',
  ) {
    super(message);
    this.name = 'PricingError';
  }
}

const MAX_QUANTITY = 10;

/**
 * The single place a price is decided.
 *
 * The client sends a configuration — which product, how many copies, which
 * address — and never a price. Everything here is derived from the catalogue in
 * the database, so a tampered request cannot buy a hardback for one lira
 * (master prompt §82). The same function computes the quote shown at checkout
 * and the amount actually charged, so the two cannot drift apart.
 *
 * All arithmetic is in integer kuruş. A price is never a float.
 */
export function quotePrice(request: PriceQuoteRequest): PriceBreakdown {
  const { product, shipping, pageCount, quantity, discountPercent } = request;

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new PricingError(`Quantity must be between 1 and ${MAX_QUANTITY}`, 'INVALID_QUANTITY');
  }
  if (pageCount < product.minPages || pageCount > product.maxPages) {
    throw new PricingError(
      `This book has ${String(pageCount)} pages; ${product.sku} takes ${String(product.minPages)}–${String(product.maxPages)}`,
      'PAGE_COUNT_OUT_OF_RANGE',
    );
  }

  const base: Minor = fromDecimalString(product.basePrice);
  const perPage: Minor = fromDecimalString(product.perPagePrice);
  const extraPages = Math.max(0, pageCount - product.includedPages);

  const unitPrice: Minor = base + perPage * extraPages;
  const subtotal: Minor = unitPrice * quantity;
  const discount: Minor = discountPercent > 0 ? percentOf(subtotal, discountPercent) : 0;
  const discountedSubtotal: Minor = subtotal - discount;

  // The free-shipping threshold is checked against what the customer actually
  // pays, not the pre-discount subtotal — the other way round would promise
  // free shipping and then charge for it.
  const shippingCost: Minor = fromDecimalString(shipping.price);
  const freeAbove =
    shipping.freeAboveSubtotal === null ? null : fromDecimalString(shipping.freeAboveSubtotal);
  const shippingCharge: Minor =
    freeAbove !== null && discountedSubtotal >= freeAbove ? 0 : shippingCost;

  return {
    unitPrice: toDecimalString(unitPrice),
    subtotal: toDecimalString(subtotal),
    discount: toDecimalString(discount),
    shipping: toDecimalString(shippingCharge),
    total: toDecimalString(discountedSubtotal + shippingCharge),
    currency: product.currency,
    quantity,
    pageCount,
    extraPages,
    estimatedDeliveryMin: product.productionDays + shipping.minDeliveryDays,
    estimatedDeliveryMax: product.productionDays + shipping.maxDeliveryDays,
  };
}
