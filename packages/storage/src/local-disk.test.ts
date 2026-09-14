import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalDiskStorageProvider } from './local-disk';
import { buildObjectKey, extensionForContentType, StorageObjectNotFoundError } from './types';

describe('LocalDiskStorageProvider', () => {
  let rootDir: string;
  let storage: LocalDiskStorageProvider;
  const now = new Date('2026-08-13T20:00:00.000Z');

  beforeAll(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'masalim-storage-'));
    storage = new LocalDiskStorageProvider({
      rootDir,
      publicBaseUrl: 'http://localhost:3000',
      signingSecret: 'test-signing-secret',
    });
  });

  afterAll(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('round-trips an object', async () => {
    const key = 'narration_audio/user1/abc.mp3';
    await storage.putObject({ key, body: Buffer.from('hello'), contentType: 'audio/mpeg' });

    expect((await storage.getObject(key)).toString()).toBe('hello');

    const head = await storage.headObject(key);
    expect(head?.sizeBytes).toBe(5);
    expect(head?.contentType).toBe('audio/mpeg');
  });

  it('reports a missing object rather than throwing a raw fs error', async () => {
    await expect(storage.getObject('missing/nope.mp3')).rejects.toBeInstanceOf(
      StorageObjectNotFoundError,
    );
    expect(await storage.headObject('missing/nope.mp3')).toBeNull();
  });

  it('deletes an object and its metadata sidecar', async () => {
    const key = 'illustration/user1/del.png';
    await storage.putObject({ key, body: Buffer.from('x'), contentType: 'image/png' });
    await storage.deleteObject(key);
    expect(await storage.headObject(key)).toBeNull();
  });

  describe('path traversal', () => {
    it.each([
      '../escape.txt',
      'voice_recording/../../escape.txt',
      '/etc/passwd',
      '..%2f..%2fescape',
    ])('refuses key %s', async (key) => {
      // `..%2f` is not decoded by the driver, so it is a valid (harmless) key;
      // the ones that actually resolve outside the root must be rejected.
      const resolvesOutside = !path
        .resolve(rootDir, key)
        .startsWith(rootDir + path.sep);
      if (!resolvesOutside) {
        await expect(
          storage.putObject({ key, body: Buffer.from('x'), contentType: 'text/plain' }),
        ).resolves.toBeUndefined();
        return;
      }
      await expect(
        storage.putObject({ key, body: Buffer.from('x'), contentType: 'text/plain' }),
      ).rejects.toThrow('Invalid storage key');
    });
  });

  describe('signed URLs', () => {
    it('produces an upload URL bound to key, type and size', async () => {
      const upload = await storage.createSignedUploadUrl({
        key: 'voice_recording/user1/rec.m4a',
        contentType: 'audio/m4a',
        sizeBytes: 1024,
        ttlSeconds: 600,
      });

      const url = new URL(upload.url);
      expect(url.pathname).toBe('/uploads/local');
      expect(url.searchParams.get('key')).toBe('voice_recording/user1/rec.m4a');
      expect(url.searchParams.get('ct')).toBe('audio/m4a');
      expect(url.searchParams.get('max')).toBe('1024');
      expect(upload.headers['content-type']).toBe('audio/m4a');
    });

    it('accepts a signature it produced', async () => {
      const upload = await storage.createSignedUploadUrl({
        key: 'voice_recording/user1/rec.m4a',
        contentType: 'audio/m4a',
        sizeBytes: 1024,
        ttlSeconds: 600,
      });
      const url = new URL(upload.url);

      const valid = storage.verifySignature(
        {
          key: 'voice_recording/user1/rec.m4a',
          operation: 'put',
          expiresAt: Number(url.searchParams.get('exp')),
          contentType: 'audio/m4a',
          maxBytes: 1024,
        },
        url.searchParams.get('sig') ?? '',
        now,
      );
      expect(valid).toBe(true);
    });

    it('rejects a signature when the key is swapped', async () => {
      const upload = await storage.createSignedUploadUrl({
        key: 'voice_recording/user1/rec.m4a',
        contentType: 'audio/m4a',
        sizeBytes: 1024,
        ttlSeconds: 600,
      });
      const url = new URL(upload.url);

      // This is the attack that matters: another family's key, same signature.
      const valid = storage.verifySignature(
        {
          key: 'voice_recording/user2/rec.m4a',
          operation: 'put',
          expiresAt: Number(url.searchParams.get('exp')),
          contentType: 'audio/m4a',
          maxBytes: 1024,
        },
        url.searchParams.get('sig') ?? '',
        now,
      );
      expect(valid).toBe(false);
    });

    it('rejects a signature when the declared size is inflated', async () => {
      const upload = await storage.createSignedUploadUrl({
        key: 'voice_recording/user1/rec.m4a',
        contentType: 'audio/m4a',
        sizeBytes: 1024,
        ttlSeconds: 600,
      });
      const url = new URL(upload.url);

      const valid = storage.verifySignature(
        {
          key: 'voice_recording/user1/rec.m4a',
          operation: 'put',
          expiresAt: Number(url.searchParams.get('exp')),
          contentType: 'audio/m4a',
          maxBytes: 999_999_999,
        },
        url.searchParams.get('sig') ?? '',
        now,
      );
      expect(valid).toBe(false);
    });

    it('rejects an expired signature', async () => {
      const downloadUrl = await storage.createSignedDownloadUrl('a/b.mp3', 60);
      const url = new URL(downloadUrl);

      const wellAfterExpiry = new Date(Date.now() + 3600 * 1000);
      const valid = storage.verifySignature(
        {
          key: 'a/b.mp3',
          operation: 'get',
          expiresAt: Number(url.searchParams.get('exp')),
        },
        url.searchParams.get('sig') ?? '',
        wellAfterExpiry,
      );
      expect(valid).toBe(false);
    });

    it('does not accept a download signature for an upload', async () => {
      const downloadUrl = await storage.createSignedDownloadUrl('a/b.mp3', 600);
      const url = new URL(downloadUrl);

      const valid = storage.verifySignature(
        { key: 'a/b.mp3', operation: 'put', expiresAt: Number(url.searchParams.get('exp')) },
        url.searchParams.get('sig') ?? '',
        now,
      );
      expect(valid).toBe(false);
    });
  });
});

describe('object keys', () => {
  it('includes an unguessable id so keys cannot be enumerated', () => {
    const key = buildObjectKey({
      kind: 'VOICE_RECORDING',
      ownerId: 'user123',
      id: 'clx0987654321hgfedcba',
      extension: '.m4a',
    });
    expect(key).toBe('voice_recording/user123/clx0987654321hgfedcba.m4a');
  });

  it('handles shared assets with no owner', () => {
    const key = buildObjectKey({
      kind: 'VOICE_PREVIEW',
      ownerId: null,
      id: 'abc',
      extension: 'mp3',
    });
    expect(key).toBe('voice_preview/shared/abc.mp3');
  });

  it('maps content types to sensible extensions', () => {
    expect(extensionForContentType('audio/mpeg')).toBe('.mp3');
    expect(extensionForContentType('image/png')).toBe('.png');
    expect(extensionForContentType('application/pdf')).toBe('.pdf');
    expect(extensionForContentType('application/x-unknown')).toBe('.bin');
  });
});
