import { z } from 'zod';
import { BOOK_PAGE_LAYOUTS, ILLUSTRATION_STYLES } from '@masalim/types';
import { freeTextSchema, idSchema } from './primitives';

/**
 * The client picks a style key only. Raw image prompts are never accepted from
 * the client — the server owns the style templates (§26).
 */
export const createIllustrationSetSchema = z.object({
  style: z.enum(ILLUSTRATION_STYLES),
  idempotencyKey: z.string().uuid(),
});
export type CreateIllustrationSetInput = z.infer<typeof createIllustrationSetSchema>;

export const regenerateIllustrationSchema = z.object({
  illustrationId: idSchema,
  idempotencyKey: z.string().uuid(),
});
export type RegenerateIllustrationInput = z.infer<typeof regenerateIllustrationSchema>;

export const selectIllustrationVariantSchema = z.object({
  illustrationId: idSchema,
});
export type SelectIllustrationVariantInput = z.infer<typeof selectIllustrationVariantSchema>;

export const createBookSchema = z.object({
  storyId: idSchema,
  illustrationSetId: idSchema,
  idempotencyKey: z.string().uuid(),
});
export type CreateBookInput = z.infer<typeof createBookSchema>;

/** Book Builder autosaves with a debounce; every field is optional. */
export const updateBookSchema = z.object({
  title: freeTextSchema(120).optional(),
  subtitle: freeTextSchema(120).optional(),
  dedication: freeTextSchema(280).optional(),
  backCoverText: freeTextSchema(600).optional(),
  coverIllustrationId: idSchema.optional(),
});
export type UpdateBookInput = z.infer<typeof updateBookSchema>;

export const updateBookPageSchema = z.object({
  text: freeTextSchema(2000).optional(),
  illustrationId: idSchema.optional(),
  layout: z.enum(BOOK_PAGE_LAYOUTS).optional(),
});
export type UpdateBookPageInput = z.infer<typeof updateBookPageSchema>;

export const renderBookSchema = z.object({
  kind: z.enum(['DIGITAL_PREVIEW', 'PRINT_PDF']),
  idempotencyKey: z.string().uuid(),
});
export type RenderBookInput = z.infer<typeof renderBookSchema>;
