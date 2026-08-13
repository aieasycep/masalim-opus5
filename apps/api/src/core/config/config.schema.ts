import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/**
 * Environment schema.
 *
 * Validated once at boot: a misconfigured deployment fails immediately with a
 * readable message instead of throwing somewhere deep in a request handler.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_BASE_URL: z.string().url().default('http://localhost:3000'),
    CORS_ORIGINS: z.string().default(''),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),

    APPLE_BUNDLE_ID: z.string().default('com.masalim.app'),
    APPLE_SERVICE_ID: z.string().optional(),
    GOOGLE_IOS_CLIENT_ID: z.string().optional(),
    GOOGLE_ANDROID_CLIENT_ID: z.string().optional(),
    GOOGLE_WEB_CLIENT_ID: z.string().optional(),

    STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
    STORAGE_BUCKET: z.string().default('masalim-media'),
    STORAGE_REGION: z.string().default('auto'),
    STORAGE_ACCESS_KEY: z.string().default(''),
    STORAGE_SECRET_KEY: z.string().default(''),
    STORAGE_ENDPOINT: z.string().optional(),
    STORAGE_PUBLIC_URL: z.string().optional(),
    STORAGE_FORCE_PATH_STYLE: booleanString.default('true'),
    STORAGE_LOCAL_DIR: z.string().default('.storage'),
    SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),

    AI_PROVIDER: z.enum(['mock', 'anthropic', 'openai']).default('mock'),
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_STORY_MODEL: z.string().default('claude-sonnet-5'),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_STORY_MODEL: z.string().default('gpt-5'),

    MODERATION_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
    MODERATION_MODEL: z.string().default('omni-moderation-latest'),

    IMAGE_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
    IMAGE_MODEL: z.string().default('gpt-image-1'),
    IMAGE_USE_REFERENCE_IMAGES: booleanString.default('true'),

    TTS_PROVIDER: z.enum(['mock', 'elevenlabs']).default('mock'),
    ELEVENLABS_API_KEY: z.string().optional(),
    ELEVENLABS_TTS_MODEL: z.string().default('eleven_multilingual_v2'),

    VOICE_CLONE_PROVIDER: z.enum(['mock', 'elevenlabs']).default('mock'),
    VOICE_RAW_RETENTION_DAYS: z.coerce.number().int().min(0).max(365).default(30),

    PAYMENT_PROVIDER: z.enum(['mock', 'iyzico']).default('mock'),
    IYZICO_API_KEY: z.string().optional(),
    IYZICO_SECRET_KEY: z.string().optional(),
    IYZICO_BASE_URL: z.string().default('https://sandbox-api.iyzipay.com'),

    SUBSCRIPTION_PROVIDER: z.enum(['mock', 'revenuecat']).default('mock'),
    REVENUECAT_SECRET_API_KEY: z.string().optional(),
    REVENUECAT_WEBHOOK_AUTH_HEADER: z.string().optional(),

    PRINT_PROVIDER: z.enum(['mock']).default('mock'),

    PUSH_PROVIDER: z.enum(['mock', 'expo']).default('mock'),
    EXPO_ACCESS_TOKEN: z.string().optional(),

    ANALYTICS_PROVIDER: z.enum(['noop', 'posthog']).default('noop'),
    POSTHOG_API_KEY: z.string().optional(),
    POSTHOG_HOST: z.string().default('https://eu.i.posthog.com'),

    SENTRY_DSN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== 'production') return;

    // Mocks must never be reachable in production, and neither must a
    // development secret. Failing at boot is the whole point.
    const mockFields = [
      ['AI_PROVIDER', env.AI_PROVIDER],
      ['MODERATION_PROVIDER', env.MODERATION_PROVIDER],
      ['IMAGE_PROVIDER', env.IMAGE_PROVIDER],
      ['TTS_PROVIDER', env.TTS_PROVIDER],
      ['VOICE_CLONE_PROVIDER', env.VOICE_CLONE_PROVIDER],
      ['PAYMENT_PROVIDER', env.PAYMENT_PROVIDER],
      ['SUBSCRIPTION_PROVIDER', env.SUBSCRIPTION_PROVIDER],
      ['PUSH_PROVIDER', env.PUSH_PROVIDER],
    ] as const;

    for (const [name, value] of mockFields) {
      if (value === 'mock') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message: `${name}=mock is not allowed when APP_ENV=production`,
        });
      }
    }

    if (env.STORAGE_PROVIDER === 'local') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STORAGE_PROVIDER'],
        message: 'STORAGE_PROVIDER=local is not allowed when APP_ENV=production',
      });
    }

    for (const [name, value] of [
      ['JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET],
      ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET],
    ] as const) {
      if (value.includes('dev-only') || value.includes('change-me')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message: `${name} still holds the development placeholder`,
        });
      }
    }

    const requiredKeys: Array<[string, string | undefined, boolean]> = [
      ['ANTHROPIC_API_KEY', env.ANTHROPIC_API_KEY, env.AI_PROVIDER === 'anthropic'],
      ['OPENAI_API_KEY', env.OPENAI_API_KEY, env.AI_PROVIDER === 'openai'],
      ['OPENAI_API_KEY', env.OPENAI_API_KEY, env.IMAGE_PROVIDER === 'openai'],
      ['OPENAI_API_KEY', env.OPENAI_API_KEY, env.MODERATION_PROVIDER === 'openai'],
      ['ELEVENLABS_API_KEY', env.ELEVENLABS_API_KEY, env.TTS_PROVIDER === 'elevenlabs'],
      [
        'ELEVENLABS_API_KEY',
        env.ELEVENLABS_API_KEY,
        env.VOICE_CLONE_PROVIDER === 'elevenlabs',
      ],
      ['IYZICO_API_KEY', env.IYZICO_API_KEY, env.PAYMENT_PROVIDER === 'iyzico'],
      ['IYZICO_SECRET_KEY', env.IYZICO_SECRET_KEY, env.PAYMENT_PROVIDER === 'iyzico'],
      [
        'REVENUECAT_SECRET_API_KEY',
        env.REVENUECAT_SECRET_API_KEY,
        env.SUBSCRIPTION_PROVIDER === 'revenuecat',
      ],
    ];

    for (const [name, value, required] of requiredKeys) {
      if (required && !value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message: `${name} is required for the selected provider`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
