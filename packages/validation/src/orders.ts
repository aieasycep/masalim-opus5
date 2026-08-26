import { z } from 'zod';
import { BOOK_SIZES, COVER_TYPES } from '@masalim/types';
import {
  freeTextSchema,
  idSchema,
  personNameSchema,
  turkishPhoneSchema,
  turkishPostalCodeSchema,
} from './primitives';

export const MAX_ORDER_QUANTITY = 10;

export const addressSchema = z.object({
  fullName: personNameSchema,
  phone: turkishPhoneSchema,
  line1: freeTextSchema(200).pipe(z.string().min(5, 'ADDRESS_TOO_SHORT')),
  line2: freeTextSchema(200).optional(),
  /** İlçe */
  district: freeTextSchema(60).pipe(z.string().min(2, 'DISTRICT_REQUIRED')),
  /** İl */
  city: freeTextSchema(60).pipe(z.string().min(2, 'CITY_REQUIRED')),
  postalCode: turkishPostalCodeSchema,
  countryCode: z.literal('TR').default('TR'),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const updateAddressSchema = addressSchema.partial();
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

/**
 * Product configuration only. There is deliberately no price field: the total is
 * always computed server-side from the catalogue, so a tampered request cannot
 * buy a book for 1 lira (§82).
 */
export const priceQuoteSchema = z.object({
  bookId: idSchema,
  bookSize: z.enum(BOOK_SIZES),
  coverType: z.enum(COVER_TYPES),
  quantity: z.number().int().min(1).max(MAX_ORDER_QUANTITY),
  addressId: idSchema.optional(),
});
export type PriceQuoteInput = z.infer<typeof priceQuoteSchema>;

export const createOrderSchema = priceQuoteSchema.extend({
  addressId: idSchema,
  idempotencyKey: z.string().uuid(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * Payment initiation. Card data never touches our servers in raw form for the
 * hosted-checkout flow; the token/callback path is provider-specific and handled
 * inside the payment adapter.
 */
export const initiatePaymentSchema = z.object({
  orderId: idSchema,
  /** Where the provider should return the user after 3D Secure. */
  returnUrl: z.string().url().max(500),
  idempotencyKey: z.string().uuid(),
});
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

export const verifyPaymentSchema = z.object({
  orderId: idSchema,
  providerPaymentId: z.string().min(1).max(200),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
