import { z } from 'zod';
import { DEVICE_PLATFORMS, LOCALES } from '@masalim/types';

/**
 * Device registration for push.
 *
 * The token is opaque to us — Expo's format today, something else tomorrow — so
 * it is length-bounded rather than pattern-matched.
 */
export const registerDeviceSchema = z.object({
  token: z.string().min(10).max(512),
  platform: z.enum(DEVICE_PLATFORMS),
  appVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'INVALID_VERSION')
    .optional(),
  locale: z.enum(LOCALES).default('tr'),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export const unregisterDeviceSchema = z.object({
  token: z.string().min(10).max(512),
});
export type UnregisterDeviceInput = z.infer<typeof unregisterDeviceSchema>;

/**
 * What the app reports about itself so the server can answer with the right
 * version policy and feature flags.
 */
export const appConfigQuerySchema = z.object({
  platform: z.enum(DEVICE_PLATFORMS).optional(),
  appVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'INVALID_VERSION')
    .optional(),
});
export type AppConfigQuery = z.infer<typeof appConfigQuerySchema>;
