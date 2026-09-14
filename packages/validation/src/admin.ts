import { z } from 'zod';
import { ORDER_STATUSES, PAYMENT_STATUSES } from '@masalim/types';
import { emailSchema, freeTextSchema, paginationSchema } from './primitives';

/**
 * An admin session lasts a shift, not a month.
 *
 * The panel can reach every family's operational data, so a console left open
 * on a shared desk stops being one by the end of the day. There is deliberately
 * no refresh token: signing in again is cheap, and a long-lived credential for
 * this surface is not worth the convenience.
 */
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

export const adminLoginSchema = z.object({
  email: emailSchema,
  /**
   * Checked as typed rather than against the password policy: policy is
   * enforced where a password is *set*, so tightening it later must not lock
   * an existing operator out of the console.
   */
  password: z.string().min(1, 'PASSWORD_REQUIRED').max(200, 'PASSWORD_TOO_LONG'),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

// ------------------------------------------------------------ Moderation

/**
 * Verdicts a human may be asked to revisit.
 *
 * The classifier is binary — it writes APPROVED or REJECTED and nothing else —
 * so the queue is the appeal path for what it refused. A false positive is the
 * failure that actually costs something here: an innocent story about a poorly
 * wolf, blocked at bedtime with no way for anyone to look at it. FLAGGED is
 * included so a future classifier that expresses doubt lands in the same queue
 * rather than needing a second one.
 */
export const REVIEWABLE_MODERATION_VERDICTS = ['REJECTED', 'FLAGGED'] as const;
export type ReviewableModerationVerdict = (typeof REVIEWABLE_MODERATION_VERDICTS)[number];

export const MODERATION_SUBJECT_TYPES = ['story', 'prompt'] as const;

export const adminModerationQueueSchema = paginationSchema.extend({
  verdict: z.enum(REVIEWABLE_MODERATION_VERDICTS).optional(),
  subjectType: z.enum(MODERATION_SUBJECT_TYPES).optional(),
});
export type AdminModerationQueueInput = z.infer<typeof adminModerationQueueSchema>;

/**
 * A rejection must say why.
 *
 * The reason never reaches the parent — they see the gentle "let's change the
 * idea together" message — but it is what makes the filter tunable and the
 * decision reviewable months later.
 */
export const adminModerationDecisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    reasonCode: z
      .string()
      .trim()
      .max(60, 'REASON_CODE_TOO_LONG')
      .regex(/^[A-Z0-9_]+$/, 'REASON_CODE_INVALID')
      .optional(),
    note: freeTextSchema(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'REJECT' && !value.reasonCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reasonCode'],
        message: 'REASON_CODE_REQUIRED',
      });
    }
  });
export type AdminModerationDecisionInput = z.infer<typeof adminModerationDecisionSchema>;

// ---------------------------------------------------------------- Orders

export const adminOrderListSchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  orderNumber: z.string().trim().min(3, 'ORDER_NUMBER_TOO_SHORT').max(40).optional(),
  /** Only orders that are paid and not yet delivered — the fulfilment desk. */
  awaitingFulfilment: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type AdminOrderListInput = z.infer<typeof adminOrderListSchema>;

/** Fulfilment states an operator may move an order into by hand. */
export const ADMIN_ORDER_ADVANCE_STATUSES = [
  'IN_PRODUCTION',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type AdminOrderAdvanceStatus = (typeof ADMIN_ORDER_ADVANCE_STATUSES)[number];

export const adminOrderAdvanceSchema = z.object({
  status: z.enum(ADMIN_ORDER_ADVANCE_STATUSES),
  note: freeTextSchema(300).optional(),
});
export type AdminOrderAdvanceInput = z.infer<typeof adminOrderAdvanceSchema>;

export const adminOrderTrackingSchema = z.object({
  trackingNumber: z
    .string()
    .trim()
    .min(4, 'TRACKING_NUMBER_TOO_SHORT')
    .max(64, 'TRACKING_NUMBER_TOO_LONG')
    .regex(/^[A-Za-z0-9-]+$/, 'TRACKING_NUMBER_INVALID'),
  carrier: z.string().trim().min(2, 'CARRIER_TOO_SHORT').max(40, 'CARRIER_TOO_LONG').optional(),
});
export type AdminOrderTrackingInput = z.infer<typeof adminOrderTrackingSchema>;

// ----------------------------------------------------------------- Users

/**
 * Support looks a family up because that family got in touch, so the search
 * needs a real identifier. The minimum length is what stops the box from
 * doubling as a way to page through every parent on the service.
 */
export const ADMIN_USER_SEARCH_MIN_LENGTH = 3;

export const adminUserSearchSchema = paginationSchema.extend({
  query: z
    .string()
    .trim()
    .min(ADMIN_USER_SEARCH_MIN_LENGTH, 'QUERY_TOO_SHORT')
    .max(254, 'QUERY_TOO_LONG'),
  includeDeleted: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type AdminUserSearchInput = z.infer<typeof adminUserSearchSchema>;

// --------------------------------------------------------- Feature flags

export const adminFeatureFlagKeySchema = z
  .string()
  .trim()
  .min(2, 'FLAG_KEY_TOO_SHORT')
  .max(60, 'FLAG_KEY_TOO_LONG')
  .regex(/^[a-z0-9_]+$/, 'FLAG_KEY_INVALID');

export const adminFeatureFlagUpdateSchema = z.object({
  enabled: z.boolean(),
  rolloutPercentage: z.number().int().min(0).max(100).optional(),
  /** Why the switch moved, kept with the audit entry. */
  reason: freeTextSchema(200).optional(),
});
export type AdminFeatureFlagUpdateInput = z.infer<typeof adminFeatureFlagUpdateSchema>;
