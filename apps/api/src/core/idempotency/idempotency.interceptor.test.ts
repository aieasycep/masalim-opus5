import { describe, expect, it, vi } from 'vitest';
import { of, lastValueFrom } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import type { PrismaService } from '../prisma/prisma.service';
import type { Clock } from '../time/clock';

/**
 * The ordering guarantee, tested where it is observable.
 *
 * An end-to-end test cannot catch a late write: by the time it can query the
 * database, any fire-and-forget insert has already landed. The window only
 * exists between the response being emitted and the write committing, so the
 * assertion has to be on the observable itself — it must not emit until the
 * record is stored.
 */

interface Harness {
  interceptor: IdempotencyInterceptor;
  context: ExecutionContext;
  resolveCreate: () => void;
  created: () => boolean;
}

function harness(): Harness {
  let createResolved = false;
  let release: (() => void) | undefined;

  const create = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      release = () => {
        createResolved = true;
        resolve();
      };
    });
    return {};
  });

  const prisma = {
    client: {
      idempotencyRecord: {
        findUnique: vi.fn(async () => null),
        create,
        delete: vi.fn(async () => ({})),
      },
    },
  } as unknown as PrismaService;

  const clock = {
    timestamp: () => 0,
    plusSeconds: () => new Date(0),
  } as unknown as Clock;

  const reflector = { getAllAndOverride: () => true } as unknown as Reflector;

  const response = { statusCode: 201, setHeader: vi.fn(), status: vi.fn() };
  const request = {
    method: 'POST',
    path: '/stories',
    headers: {},
    body: { idempotencyKey: 'key-1' },
    user: { id: 'user-1' },
  };

  const context = {
    getType: () => 'http',
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  return {
    interceptor: new IdempotencyInterceptor(reflector, prisma, clock),
    context,
    resolveCreate: () => {
      release?.();
    },
    created: () => createResolved,
  };
}

describe('IdempotencyInterceptor', () => {
  it('does not emit the response until the record is committed', async () => {
    const { interceptor, context, resolveCreate, created } = harness();
    const next: CallHandler = { handle: () => of({ story: { id: 'story-1' } }) };

    let emitted = false;
    const result = lastValueFrom(interceptor.intercept(context, next)).then((body) => {
      emitted = true;
      return body;
    });

    // Drained through a macrotask, not a couple of microtasks: a
    // fire-and-forget store would let the stream settle within this window, so
    // if the response is still pending here it is genuinely waiting on the
    // write rather than merely on promise plumbing.
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(created()).toBe(false);
    expect(emitted).toBe(false);

    resolveCreate();
    await expect(result).resolves.toEqual({ story: { id: 'story-1' } });
    expect(created()).toBe(true);
  });
});
