import { z } from 'zod';
import { ASSET_KINDS, UPLOAD_CONSTRAINTS, type AssetKind } from '@masalim/types';

/**
 * Requesting a signed upload URL.
 *
 * Both the MIME type and the byte size are validated against the per-kind
 * constraints before a URL is issued, so an oversized or wrong-typed object can
 * never reach the bucket (§45).
 */
export const requestUploadSchema = z
  .object({
    kind: z.enum(ASSET_KINDS),
    contentType: z.string().min(3).max(120),
    sizeBytes: z.number().int().min(1),
    fileName: z.string().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    const constraint = UPLOAD_CONSTRAINTS[value.kind as AssetKind];
    if (!constraint.allowedMimeTypes.includes(value.contentType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contentType'],
        message: 'UPLOAD_TYPE_NOT_ALLOWED',
      });
    }
    if (value.sizeBytes > constraint.maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sizeBytes'],
        message: 'UPLOAD_TOO_LARGE',
      });
    }
  });
export type RequestUploadInput = z.infer<typeof requestUploadSchema>;

export const confirmUploadSchema = z.object({
  assetId: z.string().min(20).max(40),
  checksum: z.string().max(128).optional(),
});
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;
