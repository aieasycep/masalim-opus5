import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { ERROR_CODES } from '@masalim/types';
import { AppConfigService } from '../config/config.service';
import { AppError } from '../errors/app-error';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  locale: string;
  /** Token type, so a refresh token can never be presented as an access token. */
  typ: 'access';
}

export interface RefreshTokenClaims {
  userId: string;
  familyId: string;
  /** Opaque secret; only its hash is stored. */
  secret: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async signAccessToken(payload: Omit<AccessTokenPayload, 'typ'>): Promise<string> {
    return this.jwt.signAsync(
      { ...payload, typ: 'access' },
      {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_TTL'),
      },
    );
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
      });
      if (payload.typ !== 'access') {
        throw new AppError(ERROR_CODES.TOKEN_INVALID);
      }
      return payload;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const expired = error instanceof Error && error.name === 'TokenExpiredError';
      throw new AppError(expired ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.TOKEN_INVALID);
    }
  }

  /**
   * Refresh tokens are opaque random strings rather than JWTs.
   *
   * Only a SHA-256 hash is persisted, so a database leak does not hand over
   * working sessions, and the value can be revoked server-side the moment reuse
   * is detected.
   */
  generateRefreshSecret(): string {
    return randomBytes(48).toString('base64url');
  }

  hashRefreshSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  /** Wire format: `<familyId>.<secret>` so lookup needs no extra round trip. */
  encodeRefreshToken(familyId: string, secret: string): string {
    return `${familyId}.${secret}`;
  }

  decodeRefreshToken(token: string): { familyId: string; secret: string } {
    const separator = token.indexOf('.');
    if (separator <= 0 || separator === token.length - 1) {
      throw new AppError(ERROR_CODES.TOKEN_INVALID);
    }
    return {
      familyId: token.slice(0, separator),
      secret: token.slice(separator + 1),
    };
  }

  secretMatchesHash(secret: string, hash: string): boolean {
    const computed = Buffer.from(this.hashRefreshSecret(secret));
    const stored = Buffer.from(hash);
    if (computed.length !== stored.length) return false;
    return timingSafeEqual(computed, stored);
  }

  /** IP addresses are hashed before storage — we need them for anomaly checks,
   *  not for tracking families. */
  hashIp(ip: string | undefined): string | null {
    return this.hashIdentifier(ip);
  }

  /**
   * A pseudonym for anything we must be able to correlate but have no business
   * storing in clear — an IP, or the address someone typed at a login form they
   * failed. Keyed on the refresh secret, so the output is useless to anyone who
   * only has the database.
   */
  hashIdentifier(value: string | undefined): string | null {
    if (!value) return null;
    return createHash('sha256')
      .update(`${value}:${this.config.get('JWT_REFRESH_SECRET')}`)
      .digest('hex')
      .slice(0, 32);
  }
}
