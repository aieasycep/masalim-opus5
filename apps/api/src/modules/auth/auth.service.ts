import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_LOCALE,
  ERROR_CODES,
  RATE_LIMIT_KEYS,
  type AuthSession,
  type AuthTokens,
  type Locale,
  type UserDto,
} from '@masalim/types';
import type {
  SignInInput,
  SignUpInput,
  SocialSignInInput,
} from '@masalim/validation';
import type { AuthProvider, User } from '@masalim/database';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TokenService } from '../../core/auth/jwt.service';
import { RateLimitService } from '../../core/rate-limit/rate-limit.service';
import { AppConfigService } from '../../core/config/config.service';
import { AppError } from '../../core/errors/app-error';
import { Clock } from '../../core/time/clock';
import { AppLogger } from '../../core/logger/logger.service';
import { SocialVerifierService } from './social-verifier.service';

export interface AuthRequestContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly rateLimit: RateLimitService,
    private readonly config: AppConfigService,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
    private readonly social: SocialVerifierService,
  ) {}

  // ------------------------------------------------------------- Email

  async signUp(input: SignUpInput, context: AuthRequestContext): Promise<AuthSession> {
    await this.rateLimit.enforce(
      RATE_LIMIT_KEYS.AUTH_SIGNUP,
      `signup:${context.ip ?? 'unknown'}`,
    );

    const existing = await this.prisma.raw.user.findUnique({
      where: { email: input.email },
      select: { id: true, deletedAt: true },
    });
    if (existing) {
      throw new AppError(ERROR_CODES.EMAIL_ALREADY_REGISTERED);
    }

    const user = await this.prisma.client.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await argon2.hash(input.password, ARGON2_OPTIONS),
        locale: (input.locale ?? DEFAULT_LOCALE) as Locale,
        ...(input.timezone ? { timezone: input.timezone } : {}),
        termsAcceptedAt: this.clock.now(),
        identities: {
          create: { provider: 'EMAIL', providerAccountId: input.email, email: input.email },
        },
        notificationPrefs: { create: {} },
        audioPrefs: { create: {} },
      },
    });

    this.logger.child({ userId: user.id }).info('user signed up');
    return this.createSession(user, context);
  }

  async signIn(input: SignInInput, context: AuthRequestContext): Promise<AuthSession> {
    // Keyed on both IP and email so one attacker cannot lock out an entire
    // network, and one account cannot be hammered from many IPs.
    await this.rateLimit.enforce(
      RATE_LIMIT_KEYS.AUTH_ATTEMPTS,
      `signin:${context.ip ?? 'unknown'}:${input.email}`,
    );

    const user = await this.prisma.raw.user.findUnique({ where: { email: input.email } });

    // Hash a dummy value when the account is missing so the response time does
    // not reveal which emails are registered.
    if (!user?.passwordHash) {
      await argon2.hash(input.password, ARGON2_OPTIONS).catch(() => undefined);
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS);
    }
    if (user.deletedAt) {
      throw new AppError(ERROR_CODES.ACCOUNT_DELETED);
    }

    const valid = await argon2.verify(user.passwordHash, input.password).catch(() => false);
    if (!valid) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS);
    }

    return this.createSession(user, context);
  }

  // ------------------------------------------------------------ Social

  async signInWithApple(
    input: SocialSignInInput,
    context: AuthRequestContext,
  ): Promise<AuthSession> {
    const identity = await this.social.verifyApple(input.identityToken, input.nonce);
    return this.upsertSocialUser('APPLE', identity, input, context);
  }

  async signInWithGoogle(
    input: SocialSignInInput,
    context: AuthRequestContext,
  ): Promise<AuthSession> {
    const identity = await this.social.verifyGoogle(input.identityToken);
    return this.upsertSocialUser('GOOGLE', identity, input, context);
  }

  private async upsertSocialUser(
    provider: Extract<AuthProvider, 'APPLE' | 'GOOGLE'>,
    identity: { providerAccountId: string; email: string | null; name: string | null },
    input: SocialSignInInput,
    context: AuthRequestContext,
  ): Promise<AuthSession> {
    const existingIdentity = await this.prisma.raw.authIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: identity.providerAccountId,
        },
      },
      include: { user: true },
    });

    if (existingIdentity) {
      if (existingIdentity.user.deletedAt) {
        throw new AppError(ERROR_CODES.ACCOUNT_DELETED);
      }
      return this.createSession(existingIdentity.user, context);
    }

    // Apple only reveals the email on first authorisation, so a returning user
    // whose identity row is missing is matched by email where possible.
    if (identity.email) {
      const byEmail = await this.prisma.raw.user.findUnique({
        where: { email: identity.email },
      });
      if (byEmail) {
        if (byEmail.deletedAt) {
          throw new AppError(ERROR_CODES.ACCOUNT_DELETED);
        }
        await this.prisma.client.authIdentity.create({
          data: {
            userId: byEmail.id,
            provider,
            providerAccountId: identity.providerAccountId,
            email: identity.email,
          },
        });
        return this.createSession(byEmail, context);
      }
    }

    // Apple's private relay may withhold an email entirely; a stable synthetic
    // address keeps the unique constraint satisfied without inventing a real one.
    const email =
      identity.email ?? `${identity.providerAccountId}@${provider.toLowerCase()}.masalim.local`;

    const user = await this.prisma.client.user.create({
      data: {
        email,
        name: input.fullName ?? identity.name,
        locale: (input.locale ?? DEFAULT_LOCALE) as Locale,
        ...(input.timezone ? { timezone: input.timezone } : {}),
        termsAcceptedAt: this.clock.now(),
        identities: {
          create: {
            provider,
            providerAccountId: identity.providerAccountId,
            email: identity.email,
          },
        },
        notificationPrefs: { create: {} },
        audioPrefs: { create: {} },
      },
    });

    this.logger.child({ userId: user.id, provider }).info('user signed up via social');
    return this.createSession(user, context);
  }

  // ------------------------------------------------------------ Tokens

  /**
   * Rotates a refresh token.
   *
   * Reuse of an already-rotated token means the value leaked, so the entire
   * family is revoked rather than just the presented token. That turns a stolen
   * token into a single failed request instead of an open-ended session.
   */
  async refresh(refreshToken: string, context: AuthRequestContext): Promise<AuthTokens> {
    const { familyId, secret } = this.tokens.decodeRefreshToken(refreshToken);
    const tokenHash = this.tokens.hashRefreshSecret(secret);

    const stored = await this.prisma.raw.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.familyId !== familyId) {
      throw new AppError(ERROR_CODES.TOKEN_INVALID);
    }

    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      this.logger
        .child({ userId: stored.userId, familyId: stored.familyId })
        .warn('refresh token reuse detected; family revoked');
      throw new AppError(ERROR_CODES.REFRESH_TOKEN_REUSED);
    }

    if (stored.expiresAt.getTime() < this.clock.timestamp()) {
      throw new AppError(ERROR_CODES.TOKEN_EXPIRED);
    }

    if (stored.user.deletedAt) {
      throw new AppError(ERROR_CODES.ACCOUNT_DELETED);
    }

    if (!this.tokens.secretMatchesHash(secret, stored.tokenHash)) {
      throw new AppError(ERROR_CODES.TOKEN_INVALID);
    }

    const next = await this.issueRefreshToken(stored.userId, stored.familyId, context);
    await this.prisma.client.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: this.clock.now(), replacedById: next.id },
    });

    return {
      accessToken: await this.tokens.signAccessToken({
        sub: stored.user.id,
        email: stored.user.email,
        locale: stored.user.locale,
      }),
      refreshToken: next.token,
      expiresIn: this.config.get('JWT_ACCESS_TTL'),
    };
  }

  async signOut(refreshToken: string): Promise<void> {
    const { secret } = this.tokens.decodeRefreshToken(refreshToken);
    const tokenHash = this.tokens.hashRefreshSecret(secret);
    const stored = await this.prisma.raw.refreshToken.findUnique({ where: { tokenHash } });
    if (stored) {
      await this.revokeFamily(stored.familyId);
    }
  }

  async signOutEverywhere(userId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  private async issueRefreshToken(
    userId: string,
    familyId: string,
    context: AuthRequestContext,
  ): Promise<{ id: string; token: string }> {
    const secret = this.tokens.generateRefreshSecret();
    const record = await this.prisma.client.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: this.tokens.hashRefreshSecret(secret),
        expiresAt: this.clock.plusSeconds(this.config.get('JWT_REFRESH_TTL')),
        ...(context.userAgent ? { userAgent: context.userAgent.slice(0, 300) } : {}),
        ipHash: this.tokens.hashIp(context.ip),
      },
    });
    return { id: record.id, token: this.tokens.encodeRefreshToken(familyId, secret) };
  }

  private async createSession(user: User, context: AuthRequestContext): Promise<AuthSession> {
    const familyId = randomUUID();
    const refresh = await this.issueRefreshToken(user.id, familyId, context);

    return {
      user: this.toUserDto(user),
      tokens: {
        accessToken: await this.tokens.signAccessToken({
          sub: user.id,
          email: user.email,
          locale: user.locale,
        }),
        refreshToken: refresh.token,
        expiresIn: this.config.get('JWT_ACCESS_TTL'),
      },
    };
  }

  toUserDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: null,
      locale: user.locale,
      timezone: user.timezone,
      onboardingCompleted: user.onboardingCompleted,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
