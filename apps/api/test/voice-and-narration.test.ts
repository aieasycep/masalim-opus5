import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AIJobDto, NarrationDto, NarrationSegment, VoiceProfileDto } from '@masalim/types';
import { VOICE_CONSENT_VERSION } from '@masalim/validation';
import {
  authHeader,
  createTestApp,
  resetRedis,
  resetUserData,
  signUp,
  type SignedUpUser,
  type TestContext,
} from './helpers/test-app';
import { startWorkers, waitForJob } from './helpers/jobs';
import { fakeVoiceRecording } from './helpers/audio-fixtures';

interface UploadResponse {
  assetId: string;
  uploadUrl: string;
  headers: Record<string, string>;
}

/**
 * Journey 2 of the definition of done: consent → recording → clone → a story
 * narrated in the parent's own voice.
 *
 * The clone and the speech come from the mock providers; the consent gate, the
 * quality control, the signed upload, the chunking, the ffmpeg assembly and the
 * entitlement wall are all real.
 */
describe('voice cloning and narration', () => {
  let context: TestContext;
  let parent: SignedUpUser;
  let freeVoiceId: string;

  beforeAll(async () => {
    context = await createTestApp();
    startWorkers(context);

    const voice = await context.prisma.client.systemVoice.findFirst({
      where: { premiumOnly: false },
    });
    if (!voice) throw new Error('seed did not provide a free system voice');
    freeVoiceId = voice.id;
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await resetUserData(context.prisma);
    await resetRedis(context.redis);
    parent = await signUp(context, { name: 'Ayşe' });
  });

  async function upgradeToPremium(): Promise<void> {
    await context.prisma.client.user.update({
      where: { id: parent.userId },
      data: { subscriptionTier: 'PREMIUM', subscriptionStatus: 'ACTIVE' },
    });
  }

  async function acceptConsent(): Promise<void> {
    await context
      .http()
      .post('/voices/consent')
      .set(...authHeader(parent))
      .send({ consentVersion: VOICE_CONSENT_VERSION, accepted: true })
      .expect(201);
  }

  async function createProfile(displayName = 'Anne'): Promise<VoiceProfileDto> {
    const response = await context
      .http()
      .post('/voices')
      .set(...authHeader(parent))
      .send({
        ownerType: 'MOTHER',
        displayName,
        consentVersion: VOICE_CONSENT_VERSION,
        consentAccepted: true,
      })
      .expect(201);
    return response.body as VoiceProfileDto;
  }

  /** Walks the real signed-upload round trip rather than writing to storage directly. */
  async function uploadRecording(audio: Buffer): Promise<string> {
    const requested = await context
      .http()
      .post('/uploads')
      .set(...authHeader(parent))
      .send({
        kind: 'VOICE_RECORDING',
        contentType: 'audio/wav',
        sizeBytes: audio.byteLength,
      })
      .expect(201);

    const upload = requested.body as UploadResponse;
    const path = upload.uploadUrl.slice(upload.uploadUrl.indexOf('/uploads/local'));

    const put = context.http().put(path);
    for (const [name, value] of Object.entries(upload.headers)) {
      put.set(name, value);
    }
    await put.send(audio).expect(200);

    await context
      .http()
      .post('/uploads/confirm')
      .set(...authHeader(parent))
      .send({ assetId: upload.assetId })
      .expect(201);

    return upload.assetId;
  }

  async function cloneVoice(audio = fakeVoiceRecording()): Promise<VoiceProfileDto> {
    await acceptConsent();
    const profile = await createProfile();
    const assetId = await uploadRecording(audio);

    const submitted = await context
      .http()
      .post(`/voices/${profile.id}/recording`)
      .set(...authHeader(parent))
      .send({ assetId, durationSeconds: 62, idempotencyKey: randomUUID() })
      .expect(201);

    const { job } = submitted.body as { voice: VoiceProfileDto; job: AIJobDto };
    const settled = await waitForJob(context, parent, job.id, { timeoutMs: 60_000 });
    expect(settled.status).toBe('COMPLETED');

    const ready = await context
      .http()
      .get(`/voices/${profile.id}`)
      .set(...authHeader(parent))
      .expect(200);
    return ready.body as VoiceProfileDto;
  }

  async function readyStory(): Promise<string> {
    const created = await context
      .http()
      .post('/stories')
      .set(...authHeader(parent))
      .send({
        heroName: 'Ege',
        heroType: 'CHILD',
        themes: ['adventure'],
        ageRange: 'AGE_3_5',
        durationTarget: 'SHORT',
        advancedSettings: {},
        systemVoiceId: freeVoiceId,
        idempotencyKey: randomUUID(),
      })
      .expect(201);

    const { story, job } = created.body as { story: { id: string }; job: AIJobDto };
    const settled = await waitForJob(context, parent, job.id);
    expect(settled.status).toBe('COMPLETED');
    return story.id;
  }

  describe('consent', () => {
    it('refuses to create a voice profile before consent is recorded', async () => {
      const response = await context
        .http()
        .post('/voices')
        .set(...authHeader(parent))
        .send({
          ownerType: 'MOTHER',
          displayName: 'Anne',
          // The client claims consent; the server has no record of it, and the
          // record is what counts.
          consentVersion: VOICE_CONSENT_VERSION,
          consentAccepted: true,
        })
        .expect(403);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VOICE_CONSENT_REQUIRED',
      );
      expect(await context.prisma.client.voiceProfile.count()).toBe(0);
    });

    it('records consent with its version and a hashed address', async () => {
      await acceptConsent();

      const rows = await context.prisma.client.voiceConsent.findMany({
        where: { userId: parent.userId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.version).toBe(VOICE_CONSENT_VERSION);
      // The audit trail proves the session was real without keeping the address.
      expect(rows[0]?.ipHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('reports whether consent has been given', async () => {
      const before = await context
        .http()
        .get('/voices/consent')
        .set(...authHeader(parent))
        .expect(200);
      expect((before.body as { acceptedAt: string | null }).acceptedAt).toBeNull();

      await acceptConsent();

      const after = await context
        .http()
        .get('/voices/consent')
        .set(...authHeader(parent))
        .expect(200);
      expect((after.body as { acceptedAt: string | null }).acceptedAt).not.toBeNull();
    });
  });

  describe('quality control', () => {
    it('rejects a recording that is too short, before any provider call', async () => {
      await acceptConsent();
      const profile = await createProfile();
      const assetId = await uploadRecording(fakeVoiceRecording({ seconds: 20 }));

      const response = await context
        .http()
        .post(`/voices/${profile.id}/recording`)
        .set(...authHeader(parent))
        .send({ assetId, durationSeconds: 50, idempotencyKey: randomUUID() })
        .expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe('AUDIO_TOO_SHORT');
      expect(await context.prisma.client.aIJob.count()).toBe(0);

      // The parent can try again: the profile is still waiting for a recording.
      const profileRow = await context.prisma.client.voiceProfile.findUniqueOrThrow({
        where: { id: profile.id },
      });
      expect(profileRow.status).toBe('AWAITING_RECORDING');
    });

    it('rejects a room that is too noisy', async () => {
      await acceptConsent();
      const profile = await createProfile();
      const assetId = await uploadRecording(
        fakeVoiceRecording({ speechAmplitude: 3000, noiseAmplitude: 2200 }),
      );

      const response = await context
        .http()
        .post(`/voices/${profile.id}/recording`)
        .set(...authHeader(parent))
        .send({ assetId, durationSeconds: 62, idempotencyKey: randomUUID() })
        .expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe('AUDIO_TOO_NOISY');
    });

    it('refuses a recording belonging to another parent', async () => {
      await acceptConsent();
      const profile = await createProfile();

      const stranger = await signUp(context, { name: 'Mehmet' });
      const strangerAsset = await context
        .http()
        .post('/uploads')
        .set(...authHeader(stranger))
        .send({ kind: 'VOICE_RECORDING', contentType: 'audio/wav', sizeBytes: 1000 })
        .expect(201);

      await context
        .http()
        .post(`/voices/${profile.id}/recording`)
        .set(...authHeader(parent))
        .send({
          assetId: (strangerAsset.body as UploadResponse).assetId,
          durationSeconds: 62,
          idempotencyKey: randomUUID(),
        })
        .expect(404);
    });
  });

  describe('cloning', () => {
    it('clones a good recording and produces a playable preview', async () => {
      const voice = await cloneVoice();

      expect(voice.status).toBe('READY');
      expect(voice.previewUrl).toBeTruthy();
      expect(voice.consentAcceptedAt).not.toBeNull();

      const row = await context.prisma.client.voiceProfile.findUniqueOrThrow({
        where: { id: voice.id },
      });
      expect(row.providerVoiceId).toMatch(/^mock-voice-/);
      // The raw recording is kept for a window so a poor clone can be redone
      // without asking the parent to read the passage again.
      expect(row.rawRetentionUntil).not.toBeNull();
      expect(row.originalAssetId).not.toBeNull();
    });

    it('stops a second profile once the tier limit is reached', async () => {
      await acceptConsent();
      await createProfile('Anne');

      const response = await context
        .http()
        .post('/voices')
        .set(...authHeader(parent))
        .send({
          ownerType: 'FATHER',
          displayName: 'Baba',
          consentVersion: VOICE_CONSENT_VERSION,
          consentAccepted: true,
        })
        .expect(409);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VOICE_PROFILE_LIMIT_REACHED',
      );
    });

    it('deletes the voice at the provider before forgetting it locally', async () => {
      const voice = await cloneVoice();
      const before = await context.prisma.client.voiceProfile.findUniqueOrThrow({
        where: { id: voice.id },
      });
      const providerVoiceId = before.providerVoiceId;
      expect(providerVoiceId).toBeTruthy();

      await context
        .http()
        .delete(`/voices/${voice.id}`)
        .set(...authHeader(parent))
        .expect(204);

      // Gone from the API...
      await context
        .http()
        .get(`/voices/${voice.id}`)
        .set(...authHeader(parent))
        .expect(404);

      // ...and the provider reference is cleared rather than left dangling.
      const after = await context.prisma.raw.voiceProfile.findUniqueOrThrow({
        where: { id: voice.id },
      });
      expect(after.deletedAt).not.toBeNull();
      expect(after.providerVoiceId).toBeNull();
      expect(after.originalAssetId).toBeNull();

      // The consent record survives: it is the proof the clone was authorised.
      expect(await context.prisma.client.voiceConsent.count()).toBe(1);
    });
  });

  describe('narration', () => {
    it('reads a story in a system voice and stores sentence timings', async () => {
      const storyId = await readyStory();

      const created = await context
        .http()
        .post(`/stories/${storyId}/narrations`)
        .set(...authHeader(parent))
        .send({ systemVoiceId: freeVoiceId, idempotencyKey: randomUUID() })
        .expect(201);

      const { narration, job } = created.body as { narration: NarrationDto; job: AIJobDto };
      expect(narration.status).toBe('PENDING');

      const settled = await waitForJob(context, parent, job.id, { timeoutMs: 120_000 });
      expect(settled.status).toBe('COMPLETED');

      const ready = await context
        .http()
        .get(`/narrations/${narration.id}`)
        .set(...authHeader(parent))
        .expect(200);
      const finished = ready.body as NarrationDto;

      expect(finished.status).toBe('READY');
      expect(finished.audioUrl).toBeTruthy();
      expect(finished.durationSeconds).toBeGreaterThan(0);
      expect(finished.narratorLabel.length).toBeGreaterThan(0);

      const segmentsResponse = await context
        .http()
        .get(`/narrations/${narration.id}/segments`)
        .set(...authHeader(parent))
        .expect(200);
      const segments = segmentsResponse.body as NarrationSegment[];

      expect(segments.length).toBeGreaterThan(0);
      // Timings must be monotonic, or the read-along highlight jumps backwards.
      for (let index = 1; index < segments.length; index += 1) {
        const previous = segments[index - 1];
        const current = segments[index];
        if (!previous || !current) throw new Error('segment list has a hole');
        expect(current.startSeconds).toBeGreaterThanOrEqual(previous.startSeconds - 0.001);
        expect(current.endSeconds).toBeGreaterThanOrEqual(current.startSeconds);
      }
      const last = segments.at(-1);
      expect(last?.endSeconds).toBeLessThanOrEqual((finished.durationSeconds ?? 0) + 2);
    });

    it('lets the audio be fetched through its signed URL', async () => {
      const storyId = await readyStory();
      const created = await context
        .http()
        .post(`/stories/${storyId}/narrations`)
        .set(...authHeader(parent))
        .send({ systemVoiceId: freeVoiceId, idempotencyKey: randomUUID() })
        .expect(201);
      const { narration, job } = created.body as { narration: NarrationDto; job: AIJobDto };
      await waitForJob(context, parent, job.id, { timeoutMs: 120_000 });

      const ready = await context
        .http()
        .get(`/narrations/${narration.id}`)
        .set(...authHeader(parent))
        .expect(200);
      const audioUrl = (ready.body as NarrationDto).audioUrl;
      if (!audioUrl) throw new Error('narration has no audio URL');

      const path = audioUrl.slice(audioUrl.indexOf('/uploads/local'));
      const download = await context.http().get(path).expect(200);

      expect(download.headers['content-type']).toContain('audio/mpeg');
      expect(download.body.byteLength).toBeGreaterThan(1000);
    });

    it('walls a free account off from narrating with the parent voice', async () => {
      // The wall is here, at the point of use — not before the recording, which
      // is the whole point of §36. The clone itself was allowed.
      const voice = await cloneVoice();
      const storyId = await readyStory();

      const response = await context
        .http()
        .post(`/stories/${storyId}/narrations`)
        .set(...authHeader(parent))
        .send({ voiceProfileId: voice.id, idempotencyKey: randomUUID() })
        .expect(403);

      expect((response.body as { error: { code: string } }).error.code).toBe('PREMIUM_REQUIRED');
      expect(await context.prisma.client.narration.count()).toBe(0);
    });

    it('narrates in the parent voice once the account is premium', async () => {
      const voice = await cloneVoice();
      const storyId = await readyStory();
      await upgradeToPremium();

      const created = await context
        .http()
        .post(`/stories/${storyId}/narrations`)
        .set(...authHeader(parent))
        .send({ voiceProfileId: voice.id, idempotencyKey: randomUUID() })
        .expect(201);

      const { narration, job } = created.body as { narration: NarrationDto; job: AIJobDto };
      const settled = await waitForJob(context, parent, job.id, { timeoutMs: 120_000 });
      expect(settled.status).toBe('COMPLETED');

      const ready = await context
        .http()
        .get(`/narrations/${narration.id}`)
        .set(...authHeader(parent))
        .expect(200);
      expect((ready.body as NarrationDto).narratorLabel).toBe('Anne');
    });

    it('leaves the story text untouched when a second voice is added', async () => {
      const storyId = await readyStory();
      const before = await context.prisma.client.story.findUniqueOrThrow({
        where: { id: storyId },
        include: { pages: true },
      });

      for (const index of [0, 1]) {
        const created = await context
          .http()
          .post(`/stories/${storyId}/narrations`)
          .set(...authHeader(parent))
          .send({ systemVoiceId: freeVoiceId, idempotencyKey: randomUUID() })
          .expect(201);
        const { job } = created.body as { job: AIJobDto };
        const settled = await waitForJob(context, parent, job.id, { timeoutMs: 120_000 });
        expect(settled.status).toBe('COMPLETED');
        expect(index).toBeGreaterThanOrEqual(0);
      }

      const after = await context.prisma.client.story.findUniqueOrThrow({
        where: { id: storyId },
        include: { pages: true },
      });
      expect(after.storyText).toBe(before.storyText);
      expect(after.version).toBe(before.version);
      expect(after.pages.map((page) => page.text)).toEqual(
        before.pages.map((page) => page.text),
      );

      const narrations = await context
        .http()
        .get(`/stories/${storyId}/narrations`)
        .set(...authHeader(parent))
        .expect(200);
      expect((narrations.body as NarrationDto[]).length).toBe(2);
    });

    it('refuses another parent’s narration', async () => {
      const storyId = await readyStory();
      const created = await context
        .http()
        .post(`/stories/${storyId}/narrations`)
        .set(...authHeader(parent))
        .send({ systemVoiceId: freeVoiceId, idempotencyKey: randomUUID() })
        .expect(201);
      const { narration } = created.body as { narration: NarrationDto };

      const stranger = await signUp(context, { name: 'Mehmet' });
      await context
        .http()
        .get(`/narrations/${narration.id}`)
        .set(...authHeader(stranger))
        .expect(404);
    });
  });
});
