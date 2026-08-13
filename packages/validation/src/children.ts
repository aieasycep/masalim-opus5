import { z } from 'zod';
import { AGE_RANGES } from '@masalim/types';
import { freeTextSchema, idSchema, isoDateSchema, personNameSchema } from './primitives';

const MAX_INTERESTS = 12;
const MAX_CUSTOM_INTERESTS = 6;

/**
 * A child's birth date must be in the past and within the product's 0–12 range.
 * `refine` runs against a caller-supplied clock in tests via `Date.parse`, which
 * is why the comparison uses the parsed value rather than constructing dates.
 */
const birthDateSchema = isoDateSchema.refine((value) => {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return false;
  const now = Date.now();
  const thirteenYearsMs = 13 * 365.25 * 24 * 60 * 60 * 1000;
  return parsed <= now && parsed >= now - thirteenYearsMs;
}, 'BIRTH_DATE_OUT_OF_RANGE');

export const createChildSchema = z
  .object({
    name: personNameSchema,
    birthDate: birthDateSchema.optional(),
    /** Required only when no birth date is supplied. */
    ageRange: z.enum(AGE_RANGES).optional(),
    avatarAssetId: idSchema.optional(),
    interestSlugs: z.array(z.string().min(1).max(40)).max(MAX_INTERESTS).default([]),
    customInterests: z
      .array(freeTextSchema(30))
      .max(MAX_CUSTOM_INTERESTS)
      .default([])
      .transform((values) => values.filter((value) => value.length > 0)),
    preferences: z
      .object({
        /** How the story should address the child, e.g. "Ege" or "minik kaşif". */
        addressAs: freeTextSchema(40).optional(),
        favouriteColour: freeTextSchema(24).optional(),
      })
      .default({}),
  })
  .refine((value) => value.birthDate !== undefined || value.ageRange !== undefined, {
    message: 'AGE_REQUIRED',
    path: ['ageRange'],
  });
export type CreateChildInput = z.infer<typeof createChildSchema>;

export const updateChildSchema = createChildSchema.innerType().partial();
export type UpdateChildInput = z.infer<typeof updateChildSchema>;
