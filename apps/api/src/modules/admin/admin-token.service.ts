import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { ERROR_CODES, type AdminRole } from '@masalim/types';
import { ADMIN_SESSION_TTL_SECONDS } from '@masalim/validation';
import { AppConfigService } from '../../core/config/config.service';
import { RedisService } from '../../core/redis/redis.service';
import { AppError } from '../../core/errors/app-error';

const ADMIN_AUDIENCE = 'masalim-admin';
const ADMIN_ISSUER = 'masalim-api';

/** Revoked session ids live here until the token they belong to expires anyway. */
const REVOCATION_PREFIX = 'admin:session:revoked:';

export interface AdminTokenPayload {
  sub: string;
  role: AdminRole;
  /** Token type; the parent guard requires `access`, so the two never overlap. */
  typ: 'admin';
  jti: string;
}

/**
 * Admin tokens, kept cryptographically separate from parent tokens.
 *
 * Three things stop a token crossing between the two surfaces, and any one of
 * them would be enough on its own:
 *
 *  - the signing key is derived from `JWT_ACCESS_SECRET` rather than being it,
 *    so a parent token does not even verify here;
 *  - the audience and issuer are checked, not merely present;
 *  - the `typ` claim is `admin`, which the parent guard rejects outright.
 *
 * Deriving the key rather than adding an environment variable keeps the split
 * real without a deployment being able to forget to configure it.
 */
@Injectable()
export class AdminTokenService {
  private readonly secret: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    config: AppConfigService,
  ) {
    this.secret = createHash('sha256')
      .update(`${config.get('JWT_ACCESS_SECRET')}:admin-console`)
      .digest('hex');
  }

  async sign(adminUserId: string, role: AdminRole): Promise<{ token: string; sessionId: string }> {
    const sessionId = randomUUID();
    const token = await this.jwt.signAsync(
      { sub: adminUserId, role, typ: 'admin' } satisfies Omit<AdminTokenPayload, 'jti'>,
      {
        secret: this.secret,
        expiresIn: ADMIN_SESSION_TTL_SECONDS,
        audience: ADMIN_AUDIENCE,
        issuer: ADMIN_ISSUER,
        jwtid: sessionId,
      },
    );
    return { token, sessionId };
  }

  async verify(token: string): Promise<AdminTokenPayload> {
    let payload: AdminTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AdminTokenPayload>(token, {
        secret: this.secret,
        audience: ADMIN_AUDIENCE,
        issuer: ADMIN_ISSUER,
      });
    } catch (error) {
      const expired = error instanceof Error && error.name === 'TokenExpiredError';
      throw new AppError(expired ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.TOKEN_INVALID);
    }

    if (payload.typ !== 'admin' || !payload.jti) {
      throw new AppError(ERROR_CODES.TOKEN_INVALID);
    }

    if (await this.isRevoked(payload.jti)) {
      throw new AppError(ERROR_CODES.TOKEN_INVALID, 'This admin session was signed out');
    }

    return payload;
  }

  /**
   * Sign-out has to mean something.
   *
   * The token stays cryptographically valid until it expires, so the session id
   * is denied in Redis for a full session lifetime. That is an upper bound
   * rather than the token's exact remainder: it over-covers a token signed
   * moments before sign-out, which is the safe direction to be wrong in, and
   * Redis expires the key either way so the list stays bounded.
   */
  async revoke(sessionId: string): Promise<void> {
    await this.redis.client.set(
      `${REVOCATION_PREFIX}${sessionId}`,
      '1',
      'EX',
      ADMIN_SESSION_TTL_SECONDS,
    );
  }

  private async isRevoked(sessionId: string): Promise<boolean> {
    return (await this.redis.client.exists(`${REVOCATION_PREFIX}${sessionId}`)) === 1;
  }
}
