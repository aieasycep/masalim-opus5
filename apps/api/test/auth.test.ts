import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  authHeader,
  createTestApp,
  resetRedis,
  resetUserData,
  signUp,
  uniqueEmail,
  VALID_PASSWORD,
  type TestContext,
} from './helpers/test-app';

describe('authentication', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestApp();
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await resetUserData(context.prisma);
    await resetRedis(context.redis);
  });

  describe('protected routes', () => {
    it('rejects a request with no token', async () => {
      const response = await context.http().get('/users/me').expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a malformed authorization header', async () => {
      await context.http().get('/users/me').set('authorization', 'NotBearer x').expect(401);
    });

    it('rejects a forged token', async () => {
      const response = await context
        .http()
        .get('/users/me')
        .set('authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.wrong-signature')
        .expect(401);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });

    it('returns the standard error envelope with a request id', async () => {
      const response = await context.http().get('/users/me').expect(401);
      expect(response.body).toEqual({
        error: {
          code: expect.any(String),
          message: expect.any(String),
          requestId: expect.any(String),
        },
      });
      expect(response.headers['x-request-id']).toBe(response.body.error.requestId);
    });
  });

  describe('sign up', () => {
    it('creates an account and returns a session', async () => {
      const email = uniqueEmail();
      const response = await context
        .http()
        .post('/auth/sign-up')
        .send({ email, password: VALID_PASSWORD, name: 'Ayşe', acceptedTerms: true })
        .expect(201);

      expect(response.body.user.email).toBe(email);
      expect(response.body.user.subscriptionTier).toBe('FREE');
      expect(response.body.tokens.accessToken).toEqual(expect.any(String));
      expect(response.body.tokens.refreshToken).toEqual(expect.any(String));
    });

    it('never returns the password hash', async () => {
      const user = await signUp(context);
      const response = await context.http().get('/users/me').set(...authHeader(user));
      expect(JSON.stringify(response.body)).not.toContain('argon2');
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('rejects a weak password with field-level codes', async () => {
      const response = await context
        .http()
        .post('/auth/sign-up')
        .send({ email: uniqueEmail(), password: 'short', name: 'A', acceptedTerms: true })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      const codes = response.body.error.details.map((d: { code: string }) => d.code);
      expect(codes).toContain('PASSWORD_TOO_SHORT');
    });

    it('requires the terms to be accepted', async () => {
      await context
        .http()
        .post('/auth/sign-up')
        .send({ email: uniqueEmail(), password: VALID_PASSWORD, name: 'A' })
        .expect(400);
    });

    it('rejects a duplicate email', async () => {
      const email = uniqueEmail();
      await signUp(context, { email });
      const response = await context
        .http()
        .post('/auth/sign-up')
        .send({ email, password: VALID_PASSWORD, name: 'A', acceptedTerms: true })
        .expect(409);
      expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('normalises the email so casing cannot create a second account', async () => {
      const email = uniqueEmail();
      await signUp(context, { email });
      await context
        .http()
        .post('/auth/sign-up')
        .send({
          email: email.toUpperCase(),
          password: VALID_PASSWORD,
          name: 'A',
          acceptedTerms: true,
        })
        .expect(409);
    });
  });

  describe('sign in', () => {
    it('signs in with the right password', async () => {
      const user = await signUp(context);
      const response = await context
        .http()
        .post('/auth/sign-in')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(200);
      expect(response.body.user.id).toBe(user.userId);
    });

    it('rejects a wrong password', async () => {
      const user = await signUp(context);
      const response = await context
        .http()
        .post('/auth/sign-in')
        .send({ email: user.email, password: 'wrong-password-1' })
        .expect(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('gives the same answer for an unknown account, so emails cannot be probed', async () => {
      const user = await signUp(context);

      const wrongPassword = await context
        .http()
        .post('/auth/sign-in')
        .send({ email: user.email, password: 'wrong-password-1' });
      const unknownEmail = await context
        .http()
        .post('/auth/sign-in')
        .send({ email: uniqueEmail('nobody'), password: 'wrong-password-1' });

      expect(unknownEmail.status).toBe(wrongPassword.status);
      expect(unknownEmail.body.error.code).toBe(wrongPassword.body.error.code);
    });
  });

  describe('refresh token rotation', () => {
    it('issues a different refresh token each time', async () => {
      const user = await signUp(context);
      const response = await context
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);

      expect(response.body.refreshToken).not.toBe(user.refreshToken);
      expect(response.body.accessToken).toEqual(expect.any(String));
    });

    it('detects reuse of a rotated token and revokes the whole family', async () => {
      const user = await signUp(context);

      const rotated = await context
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);

      // A stolen token being replayed is exactly this request.
      const replay = await context
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED');

      // The legitimate device is signed out too — the safe outcome when we
      // cannot tell which holder is the attacker.
      const afterRevocation = await context
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: rotated.body.refreshToken })
        .expect(401);
      expect(afterRevocation.body.error.code).toBe('REFRESH_TOKEN_REUSED');
    });

    it('rejects a refresh token that was never issued', async () => {
      await context
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: 'family-id.completely-made-up-secret-value' })
        .expect(401);
    });

    it('signs out this device only', async () => {
      const user = await signUp(context);
      await context
        .http()
        .post('/auth/sign-out')
        .send({ refreshToken: user.refreshToken })
        .expect(204);

      await context
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
    });
  });

  describe('deleted accounts', () => {
    it('stops accepting a still-valid access token once the account is gone', async () => {
      const user = await signUp(context);
      await context.http().get('/users/me').set(...authHeader(user)).expect(200);

      await context
        .http()
        .post('/users/me/deletion-request')
        .set(...authHeader(user))
        .send({ confirmEmail: user.email })
        .expect(201);

      // The JWT is still cryptographically valid; liveness is what stops it.
      const response = await context
        .http()
        .get('/users/me')
        .set(...authHeader(user))
        .expect(401);
      expect(response.body.error.code).toBe('ACCOUNT_DELETED');
    });

    it('requires the email to match before scheduling deletion', async () => {
      const user = await signUp(context);
      const response = await context
        .http()
        .post('/users/me/deletion-request')
        .set(...authHeader(user))
        .send({ confirmEmail: 'someone-else@masalim.test' })
        .expect(400);
      expect(response.body.error.details[0].code).toBe('EMAIL_MISMATCH');
    });
  });
});
