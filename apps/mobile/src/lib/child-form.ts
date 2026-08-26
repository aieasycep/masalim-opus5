import { z } from 'zod';
import { createChildSchema } from '@masalim/validation';

/** Whether the parent is giving an exact date or picking a band. */
export type AgeMode = 'birthDate' | 'ageRange';

const CHILD_FIELDS = createChildSchema.innerType().shape;

/** Peels off `.default()`, `.transform()` and `.optional()` to reach the real field. */
function core(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodEffects) return core(schema.innerType());
  if (schema instanceof z.ZodDefault) return core(schema.removeDefault());
  if (schema instanceof z.ZodOptional) return core(schema.unwrap());
  return schema;
}

/**
 * The cap the API will enforce for a field, read off the schema itself.
 *
 * `undefined` means the field is uncapped, and the form then leaves the limit
 * entirely to the server rather than inventing one.
 */
function maxOf(schema: z.ZodTypeAny): number | undefined {
  const inner = core(schema);
  if (inner instanceof z.ZodArray) return inner._def.maxLength?.value;
  if (inner instanceof z.ZodString) {
    for (const check of inner._def.checks) {
      if (check.kind === 'max') return check.value;
    }
  }
  return undefined;
}

const customInterestsArray = core(CHILD_FIELDS.customInterests);

/**
 * Every limit the two child forms enforce, derived rather than declared.
 *
 * Both screens read these instead of carrying their own copies, so a change to
 * `createChildSchema` reaches the UI without anyone remembering to follow it —
 * and the two forms cannot quietly disagree about how many interests a child
 * may have.
 */
export const CHILD_LIMITS = {
  nameMax: maxOf(CHILD_FIELDS.name),
  interests: maxOf(CHILD_FIELDS.interestSlugs) ?? Number.POSITIVE_INFINITY,
  customInterests: maxOf(CHILD_FIELDS.customInterests) ?? Number.POSITIVE_INFINITY,
  customInterestLength:
    customInterestsArray instanceof z.ZodArray ? maxOf(customInterestsArray.element) : undefined,
} as const;

/** Groups digits as they are typed, so the field reads `04.09.2019`. */
export function formatDateInput(typed: string): string {
  const digits = typed.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)]
    .filter((part) => part.length > 0)
    .join('.');
}

/** `GG.AA.YYYY` as a parent types it → the `YYYY-MM-DD` the API takes. */
export function toIsoDate(typed: string): string | null {
  const digits = typed.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  return `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

/** The stored date, back in the shape the field displays. */
export function fromIsoDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}.${month}.${year}` : '';
}
