import { describe, expect, it } from 'vitest';
import { quotePrice, PricingError, type PriceQuoteRequest } from './pricing';
import { fromDecimalString, percentOf, toDecimalString } from './money';

function request(overrides: Partial<PriceQuoteRequest> = {}): PriceQuoteRequest {
  return {
    product: {
      id: 'prod_1',
      sku: 'SQ-HC',
      basePrice: '499.00',
      perPagePrice: '12.50',
      includedPages: 12,
      minPages: 4,
      maxPages: 24,
      currency: 'TRY',
      productionDays: 3,
    },
    shipping: {
      price: '79.90',
      freeAboveSubtotal: '750.00',
      minDeliveryDays: 2,
      maxDeliveryDays: 5,
    },
    pageCount: 12,
    quantity: 1,
    discountPercent: 0,
    ...overrides,
  };
}

describe('money', () => {
  it('round-trips decimal strings without losing a kuruş', () => {
    for (const value of ['0.00', '0.01', '9.99', '499.00', '1234.56', '-12.30']) {
      expect(toDecimalString(fromDecimalString(value))).toBe(value);
    }
  });

  it('pads a single-digit fraction rather than misreading it', () => {
    // "10.5" is ten lira fifty, not ten lira five kuruş.
    expect(fromDecimalString('10.5')).toBe(1050);
  });

  it('rejects anything that is not a money amount', () => {
    for (const value of ['abc', '1.234', '', '1,50', '1e3']) {
      expect(() => fromDecimalString(value)).toThrow();
    }
  });

  it('rounds a percentage half-up', () => {
    expect(percentOf(1005, 10)).toBe(101);
    expect(percentOf(1004, 10)).toBe(100);
  });
});

describe('price quote', () => {
  it('charges the base price when the book is within the included pages', () => {
    const quote = quotePrice(request());

    expect(quote.unitPrice).toBe('499.00');
    expect(quote.extraPages).toBe(0);
    expect(quote.subtotal).toBe('499.00');
    expect(quote.shipping).toBe('79.90');
    expect(quote.total).toBe('578.90');
    expect(quote.currency).toBe('TRY');
  });

  it('charges only for pages beyond the allowance', () => {
    const quote = quotePrice(request({ pageCount: 16 }));

    expect(quote.extraPages).toBe(4);
    // 499.00 + 4 × 12.50
    expect(quote.unitPrice).toBe('549.00');
  });

  it('multiplies by quantity before discounting', () => {
    const quote = quotePrice(request({ quantity: 3 }));
    expect(quote.subtotal).toBe('1497.00');
  });

  it('applies the premium discount to the subtotal', () => {
    const quote = quotePrice(request({ quantity: 2, discountPercent: 10 }));

    expect(quote.subtotal).toBe('998.00');
    expect(quote.discount).toBe('99.80');
    // Subtotal after discount is 898.20, above the free-shipping threshold.
    expect(quote.shipping).toBe('0.00');
    expect(quote.total).toBe('898.20');
  });

  it('tests the free-shipping threshold against what is actually paid', () => {
    // Subtotal 799.00 clears the 750.00 threshold, but a 10% discount drops the
    // amount paid to 719.10 — promising free shipping and then charging for it
    // would be worse than never offering it.
    const quote = quotePrice(
      request({
        product: { ...request().product, basePrice: '799.00' },
        discountPercent: 10,
      }),
    );

    expect(quote.discount).toBe('79.90');
    expect(quote.shipping).toBe('79.90');
    expect(quote.total).toBe('799.00');
  });

  it('adds production and shipping days for the delivery estimate', () => {
    const quote = quotePrice(request());
    expect(quote.estimatedDeliveryMin).toBe(5);
    expect(quote.estimatedDeliveryMax).toBe(8);
  });

  it('refuses a page count the product cannot print', () => {
    expect(() => quotePrice(request({ pageCount: 40 }))).toThrow(PricingError);
    expect(() => quotePrice(request({ pageCount: 2 }))).toThrow(/4–24/);
  });

  it('refuses an implausible quantity', () => {
    expect(() => quotePrice(request({ quantity: 0 }))).toThrow(PricingError);
    expect(() => quotePrice(request({ quantity: 99 }))).toThrow(PricingError);
    expect(() => quotePrice(request({ quantity: 1.5 }))).toThrow(PricingError);
  });

  it('never produces a floating-point artefact', () => {
    // 0.1 + 0.2 territory: a naive float implementation returns 3.0000000000000004
    const quote = quotePrice(
      request({
        product: { ...request().product, basePrice: '0.10', perPagePrice: '0.20' },
        pageCount: 13,
        shipping: { ...request().shipping, price: '0.00', freeAboveSubtotal: null },
      }),
    );

    expect(quote.unitPrice).toBe('0.30');
    expect(quote.total).toBe('0.30');
  });
});
