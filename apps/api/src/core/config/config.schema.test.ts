import { describe, expect, it } from 'vitest';
import { parseEnv } from './config.schema';

/**
 * The production guard is a safety mechanism, so it gets tested like one.
 *
 * Shipping a build that quietly used MockPaymentProvider or wrote a family's
 * voice recordings to ephemeral container disk would be far worse than failing
 * to boot, which is why these are hard errors rather than warnings.
 */
const BASE_ENV = {
  DATABASE_URL: 'postgresql://masalim:masalim@localhost:5432/masalim',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
} satisfies NodeJS.ProcessEnv;

const PRODUCTION_ENV = {
  ...BASE_ENV,
  APP_ENV: 'production',
  NODE_ENV: 'production',
  AI_PROVIDER: 'anthropic',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  MODERATION_PROVIDER: 'openai',
  OPENAI_API_KEY: 'sk-test',
  IMAGE_PROVIDER: 'openai',
  TTS_PROVIDER: 'elevenlabs',
  ELEVENLABS_API_KEY: 'el-test',
  VOICE_CLONE_PROVIDER: 'elevenlabs',
  PAYMENT_PROVIDER: 'iyzico',
  IYZICO_API_KEY: 'iyz-key',
  IYZICO_SECRET_KEY: 'iyz-secret',
  SUBSCRIPTION_PROVIDER: 'revenuecat',
  REVENUECAT_SECRET_API_KEY: 'rc-key',
  PUSH_PROVIDER: 'expo',
  STORAGE_PROVIDER: 's3',
  STORAGE_ACCESS_KEY: 'key',
  STORAGE_SECRET_KEY: 'secret',
} satisfies NodeJS.ProcessEnv;

describe('environment configuration', () => {
  describe('development defaults', () => {
    it('runs with nothing but a database, Redis and secrets', () => {
      const env = parseEnv(BASE_ENV);
      expect(env.APP_ENV).toBe('development');
      expect(env.AI_PROVIDER).toBe('mock');
      expect(env.STORAGE_PROVIDER).toBe('local');
      expect(env.PAYMENT_PROVIDER).toBe('mock');
    });

    it('allows every provider to be a mock', () => {
      expect(() =>
        parseEnv({ ...BASE_ENV, AI_PROVIDER: 'mock', TTS_PROVIDER: 'mock' }),
      ).not.toThrow();
    });

    it('coerces numeric settings', () => {
      const env = parseEnv({ ...BASE_ENV, API_PORT: '4000', JWT_ACCESS_TTL: '600' });
      expect(env.API_PORT).toBe(4000);
      expect(env.JWT_ACCESS_TTL).toBe(600);
    });

    it('rejects a short JWT secret', () => {
      expect(() => parseEnv({ ...BASE_ENV, JWT_ACCESS_SECRET: 'too-short' })).toThrow(
        /JWT_ACCESS_SECRET/,
      );
    });

    it('rejects a missing database url', () => {
      const { DATABASE_URL: _omitted, ...withoutDatabase } = BASE_ENV;
      expect(() => parseEnv(withoutDatabase)).toThrow(/DATABASE_URL/);
    });
  });

  describe('production guards', () => {
    it('accepts a fully configured production environment', () => {
      expect(() => parseEnv(PRODUCTION_ENV)).not.toThrow();
    });

    it.each([
      'AI_PROVIDER',
      'MODERATION_PROVIDER',
      'IMAGE_PROVIDER',
      'TTS_PROVIDER',
      'VOICE_CLONE_PROVIDER',
      'PAYMENT_PROVIDER',
      'SUBSCRIPTION_PROVIDER',
      'PUSH_PROVIDER',
    ])('refuses to boot when %s is a mock', (field) => {
      expect(() => parseEnv({ ...PRODUCTION_ENV, [field]: 'mock' })).toThrow(
        new RegExp(`${field}.*mock`),
      );
    });

    it('refuses local disk storage', () => {
      expect(() => parseEnv({ ...PRODUCTION_ENV, STORAGE_PROVIDER: 'local' })).toThrow(
        /STORAGE_PROVIDER/,
      );
    });

    it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'])(
      'refuses the development placeholder in %s',
      (field) => {
        expect(() =>
          parseEnv({
            ...PRODUCTION_ENV,
            [field]: 'dev-only-secret-change-me-before-any-deployment',
          }),
        ).toThrow(new RegExp(field));
      },
    );

    it.each([
      ['ANTHROPIC_API_KEY', { AI_PROVIDER: 'anthropic' }],
      ['ELEVENLABS_API_KEY', { TTS_PROVIDER: 'elevenlabs' }],
      ['IYZICO_SECRET_KEY', { PAYMENT_PROVIDER: 'iyzico' }],
      ['REVENUECAT_SECRET_API_KEY', { SUBSCRIPTION_PROVIDER: 'revenuecat' }],
    ])('requires %s when its provider is selected', (key, providerSettings) => {
      expect(() =>
        parseEnv({ ...PRODUCTION_ENV, ...providerSettings, [key]: '' }),
      ).toThrow(new RegExp(key));
    });

    it('reports every problem at once rather than one per restart', () => {
      let message = '';
      try {
        parseEnv({
          ...PRODUCTION_ENV,
          AI_PROVIDER: 'mock',
          TTS_PROVIDER: 'mock',
          STORAGE_PROVIDER: 'local',
        });
      } catch (error) {
        message = error instanceof Error ? error.message : '';
      }

      expect(message).toContain('AI_PROVIDER');
      expect(message).toContain('TTS_PROVIDER');
      expect(message).toContain('STORAGE_PROVIDER');
    });
  });
});
