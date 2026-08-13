import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import { ERROR_CODES } from '@masalim/types';

/**
 * Publishes the OpenAPI document at /docs.
 *
 * The error schema is declared once here because every endpoint shares it — the
 * API only ever returns `{ error: { code, message, requestId } }` on failure.
 */
export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Masalım API')
    .setDescription(
      [
        'Backend for Masalım — personalised AI bedtime stories with parent voice narration.',
        '',
        'Every failure returns the same shape:',
        '```json',
        '{ "error": { "code": "STORY_CONTENT_NOT_SUITABLE", "message": "...", "requestId": "..." } }',
        '```',
        'Clients translate `code` into localised copy and never display `message` directly.',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('auth', 'Sign-up, sign-in and refresh-token rotation')
    .addTag('users', 'Profile, preferences, entitlements and account deletion')
    .addTag('children', 'Child profiles and interests')
    .addTag('uploads', 'Signed upload URLs for media')
    .addTag('health', 'Liveness and readiness probes')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.ApiError = {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message', 'requestId'],
        properties: {
          code: { type: 'string', enum: Object.values(ERROR_CODES) },
          message: {
            type: 'string',
            description: 'Diagnostic text for logs; clients render their own localised copy.',
          },
          requestId: { type: 'string' },
          details: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                code: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
    swaggerOptions: { persistAuthorization: true },
  });
}
