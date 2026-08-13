import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';
import { ERROR_CODES } from '@masalim/types';
import { AppError } from '../errors/app-error';

/**
 * Validates and *replaces* the incoming payload with the parsed result, so
 * handlers receive coerced, trimmed, normalised values (a phone number arrives
 * as +90…, not as the parent typed it) and nothing unvalidated leaks through.
 *
 * Uses `safeParse` rather than catching a thrown `ZodError`. pnpm gives
 * `@masalim/validation` and this app their own copies of zod, so an
 * `instanceof ZodError` check across that boundary is not reliable — it silently
 * turned every validation failure into a 500. The discriminated result has no
 * such problem.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Request validation failed', {
        // Field paths and stable codes only — never the raw input, which may
        // contain a child's name or a parent's address.
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.message,
        })),
      });
    }

    return result.data;
  }
}

/** Convenience factory so controllers read `@Body(zodBody(schema))`. */
export function zodBody(schema: ZodTypeAny): ZodValidationPipe {
  return new ZodValidationPipe(schema);
}

export function zodQuery(schema: ZodTypeAny): ZodValidationPipe {
  return new ZodValidationPipe(schema);
}
