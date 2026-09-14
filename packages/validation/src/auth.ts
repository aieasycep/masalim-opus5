import { z } from 'zod';
import {
  emailSchema,
  localeSchema,
  passwordSchema,
  personNameSchema,
  timezoneSchema,
} from './primitives';

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: personNameSchema,
  locale: localeSchema.optional(),
  timezone: timezoneSchema.optional(),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'TERMS_NOT_ACCEPTED' }),
  }),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'PASSWORD_REQUIRED').max(128),
});
export type SignInInput = z.infer<typeof signInSchema>;

/**
 * Social sign-in. The client sends the provider's identity token; the backend
 * verifies it against Apple's / Google's public keys. A client-supplied email or
 * user id is never trusted.
 */
export const socialSignInSchema = z.object({
  identityToken: z.string().min(20).max(8192),
  /** Apple only returns the name on first authorisation, so it may be forwarded. */
  fullName: personNameSchema.optional(),
  /** Apple's nonce, verified against the token claim. */
  nonce: z.string().min(8).max(256).optional(),
  locale: localeSchema.optional(),
  timezone: timezoneSchema.optional(),
});
export type SocialSignInInput = z.infer<typeof socialSignInSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20).max(1024),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const confirmPasswordResetSchema = z.object({
  token: z.string().min(20).max(512),
  password: passwordSchema,
});
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
