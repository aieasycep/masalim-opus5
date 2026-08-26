import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { OAuth2Client } from 'google-auth-library';
import { ERROR_CODES } from '@masalim/types';
import { AppConfigService } from '../../core/config/config.service';
import { AppError } from '../../core/errors/app-error';

export interface VerifiedSocialIdentity {
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');

/**
 * Verifies Apple and Google identity tokens.
 *
 * The client's claimed email or user id is never trusted: the token is checked
 * against the provider's published keys, and the subject is taken from the
 * verified claims. Without this, anyone could sign in as anyone by posting a
 * handcrafted JSON body.
 */
@Injectable()
export class SocialVerifierService {
  private readonly appleJwks = createRemoteJWKSet(APPLE_JWKS_URL);
  private readonly googleClient = new OAuth2Client();

  constructor(private readonly config: AppConfigService) {}

  async verifyApple(identityToken: string, nonce?: string): Promise<VerifiedSocialIdentity> {
    const audiences = [
      this.config.get('APPLE_BUNDLE_ID'),
      this.config.get('APPLE_SERVICE_ID'),
    ].filter((value): value is string => Boolean(value));

    try {
      const { payload } = await jwtVerify(identityToken, this.appleJwks, {
        issuer: APPLE_ISSUER,
        audience: audiences,
      });

      if (!payload.sub) {
        throw new AppError(ERROR_CODES.SOCIAL_AUTH_FAILED, 'Apple token has no subject');
      }

      // Replay protection: the app generates a nonce per attempt and Apple
      // echoes its hash back in the token.
      if (nonce && payload.nonce !== nonce) {
        throw new AppError(ERROR_CODES.SOCIAL_AUTH_FAILED, 'Apple nonce mismatch');
      }

      const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
      return {
        providerAccountId: payload.sub,
        email,
        emailVerified:
          payload.email_verified === true || payload.email_verified === 'true',
        name: null,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(ERROR_CODES.SOCIAL_AUTH_FAILED, 'Apple identity token rejected', {
        cause: error,
      });
    }
  }

  async verifyGoogle(identityToken: string): Promise<VerifiedSocialIdentity> {
    const audiences = [
      this.config.get('GOOGLE_IOS_CLIENT_ID'),
      this.config.get('GOOGLE_ANDROID_CLIENT_ID'),
      this.config.get('GOOGLE_WEB_CLIENT_ID'),
    ].filter((value): value is string => Boolean(value));

    if (audiences.length === 0) {
      throw new AppError(
        ERROR_CODES.SOCIAL_AUTH_FAILED,
        'No Google client ids configured; set GOOGLE_*_CLIENT_ID',
      );
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: identityToken,
        audience: audiences,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) {
        throw new AppError(ERROR_CODES.SOCIAL_AUTH_FAILED, 'Google token has no subject');
      }

      return {
        providerAccountId: payload.sub,
        email: payload.email ? payload.email.toLowerCase() : null,
        emailVerified: payload.email_verified === true,
        name: payload.name ?? null,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(ERROR_CODES.SOCIAL_AUTH_FAILED, 'Google identity token rejected', {
        cause: error,
      });
    }
  }
}
