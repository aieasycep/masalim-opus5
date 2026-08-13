import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  authHeader,
  createTestApp,
  resetRateLimits,
  resetUserData,
  signUp,
  type SignedUpUser,
  type TestContext,
} from './helpers/test-app';

/**
 * Ownership and isolation.
 *
 * These are the tests that matter most in this product: the data involved is a
 * family's children and voice recordings. Every one of them describes an attack
 * rather than a happy path.
 */
describe('data ownership', () => {
  let context: TestContext;
  let owner: SignedUpUser;
  let stranger: SignedUpUser;
  let childId: string;

  beforeAll(async () => {
    context = await createTestApp();
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await resetUserData(context.prisma);
    await resetRateLimits(context.redis);
    owner = await signUp(context, { name: 'Ayşe' });
    stranger = await signUp(context, { name: 'Mehmet' });

    const response = await context
      .http()
      .post('/children')
      .set(...authHeader(owner))
      .send({
        name: 'Ege',
        birthDate: '2020-03-14',
        interestSlugs: ['space'],
        customInterests: ['gökyüzü'],
      })
      .expect(201);
    childId = response.body.id;
  });

  describe('children', () => {
    it('lets the owner read their child', async () => {
      const response = await context
        .http()
        .get(`/children/${childId}`)
        .set(...authHeader(owner))
        .expect(200);
      expect(response.body.name).toBe('Ege');
    });

    it('answers not-found — never forbidden — for another parent’s child', async () => {
      // Returning 403 would confirm the id exists, which is enough to enumerate
      // every child in the database.
      const response = await context
        .http()
        .get(`/children/${childId}`)
        .set(...authHeader(stranger))
        .expect(404);
      expect(response.body.error.code).toBe('CHILD_NOT_FOUND');
    });

    it('gives the same answer for a child that does not exist at all', async () => {
      const real = await context
        .http()
        .get(`/children/${childId}`)
        .set(...authHeader(stranger));
      const imaginary = await context
        .http()
        .get('/children/clxdoesnotexist000000')
        .set(...authHeader(stranger));

      expect(imaginary.status).toBe(real.status);
      expect(imaginary.body.error.code).toBe(real.body.error.code);
    });

    it('refuses a cross-account update and leaves the record untouched', async () => {
      await context
        .http()
        .patch(`/children/${childId}`)
        .set(...authHeader(stranger))
        .send({ name: 'Hacked' })
        .expect(404);

      const after = await context
        .http()
        .get(`/children/${childId}`)
        .set(...authHeader(owner))
        .expect(200);
      expect(after.body.name).toBe('Ege');
    });

    it('refuses a cross-account delete', async () => {
      await context
        .http()
        .delete(`/children/${childId}`)
        .set(...authHeader(stranger))
        .expect(404);

      await context
        .http()
        .get(`/children/${childId}`)
        .set(...authHeader(owner))
        .expect(200);
    });

    it('never leaks another account’s children into a list', async () => {
      const response = await context
        .http()
        .get('/children')
        .set(...authHeader(stranger))
        .expect(200);
      expect(response.body).toEqual([]);
    });

    it('hides a soft-deleted child from the owner too', async () => {
      await context
        .http()
        .delete(`/children/${childId}`)
        .set(...authHeader(owner))
        .expect(204);

      await context
        .http()
        .get(`/children/${childId}`)
        .set(...authHeader(owner))
        .expect(404);

      const list = await context
        .http()
        .get('/children')
        .set(...authHeader(owner))
        .expect(200);
      expect(list.body).toEqual([]);
    });
  });

  describe('child profile data', () => {
    it('derives the age band from the birth date', async () => {
      const response = await context
        .http()
        .get(`/children/${childId}`)
        .set(...authHeader(owner))
        .expect(200);

      expect(response.body.ageRange).toBe('AGE_6_8');
      expect(response.body.ageInYears).toBe(6);
    });

    it('keeps Turkish characters in custom interests intact', async () => {
      const response = await context
        .http()
        .get(`/children/${childId}`)
        .set(...authHeader(owner))
        .expect(200);
      expect(response.body.customInterests).toEqual(['gökyüzü']);
    });

    it('resolves interest slugs to the seeded catalogue', async () => {
      const response = await context
        .http()
        .get(`/children/${childId}`)
        .set(...authHeader(owner))
        .expect(200);
      expect(response.body.interests[0].slug).toBe('space');
      expect(response.body.interests[0].labelKey).toBe('interest.space');
    });
  });

  describe('uploads', () => {
    it('refuses to attach another account’s asset as an avatar', async () => {
      const upload = await context
        .http()
        .post('/uploads')
        .set(...authHeader(stranger))
        .send({ kind: 'CHILD_AVATAR', contentType: 'image/png', sizeBytes: 1024 })
        .expect(201);

      // The stranger owns this asset id; the owner must not be able to claim it.
      const response = await context
        .http()
        .patch('/users/me')
        .set(...authHeader(owner))
        .send({ avatarAssetId: upload.body.assetId })
        .expect(404);
      expect(response.body.error.code).toBe('ASSET_NOT_FOUND');
    });

    it('rejects a content type outside the allowed list for the kind', async () => {
      const response = await context
        .http()
        .post('/uploads')
        .set(...authHeader(owner))
        .send({
          kind: 'VOICE_RECORDING',
          contentType: 'application/x-msdownload',
          sizeBytes: 1024,
        })
        .expect(400);
      expect(response.body.error.details[0].code).toBe('UPLOAD_TYPE_NOT_ALLOWED');
    });

    it('rejects a size beyond the per-kind limit before issuing a URL', async () => {
      const response = await context
        .http()
        .post('/uploads')
        .set(...authHeader(owner))
        .send({ kind: 'VOICE_RECORDING', contentType: 'audio/m4a', sizeBytes: 99_999_999 })
        .expect(400);
      expect(response.body.error.details[0].code).toBe('UPLOAD_TOO_LARGE');
    });

    it('round-trips an upload through the signed URL', async () => {
      const payload = Buffer.from('fake audio bytes for the test');
      const upload = await context
        .http()
        .post('/uploads')
        .set(...authHeader(owner))
        .send({
          kind: 'VOICE_RECORDING',
          contentType: 'audio/m4a',
          sizeBytes: payload.byteLength,
        })
        .expect(201);

      const url = new URL(upload.body.uploadUrl);
      await context
        .http()
        .put(`${url.pathname}${url.search}`)
        .set('content-type', 'audio/m4a')
        .send(payload)
        .expect(200);

      await context
        .http()
        .post('/uploads/confirm')
        .set(...authHeader(owner))
        .send({ assetId: upload.body.assetId })
        .expect(201);
    });

    it('rejects a tampered upload signature', async () => {
      const upload = await context
        .http()
        .post('/uploads')
        .set(...authHeader(owner))
        .send({ kind: 'VOICE_RECORDING', contentType: 'audio/m4a', sizeBytes: 32 })
        .expect(201);

      const url = new URL(upload.body.uploadUrl);
      url.searchParams.set('sig', 'tampered-signature-value');

      await context
        .http()
        .put(`${url.pathname}${url.search}`)
        .set('content-type', 'audio/m4a')
        .send(Buffer.from('x'))
        .expect(401);
    });

    it('rejects a signature replayed against a different key', async () => {
      const upload = await context
        .http()
        .post('/uploads')
        .set(...authHeader(owner))
        .send({ kind: 'VOICE_RECORDING', contentType: 'audio/m4a', sizeBytes: 32 })
        .expect(201);

      const url = new URL(upload.body.uploadUrl);
      url.searchParams.set('key', 'voice_recording/someone-else/stolen.m4a');

      await context
        .http()
        .put(`${url.pathname}${url.search}`)
        .set('content-type', 'audio/m4a')
        .send(Buffer.from('x'))
        .expect(401);
    });
  });
});
