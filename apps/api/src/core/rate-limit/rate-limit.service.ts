import { Injectable } from '@nestjs/common';
import { ERROR_CODES, RATE_LIMITS, type RateLimitKey } from '@masalim/types';
import { RedisService } from '../redis/redis.service';
import { AppError } from '../errors/app-error';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Fixed-window rate limiting in Redis.
 *
 * The INCR + conditional EXPIRE pair runs as one Lua script so a burst of
 * concurrent requests cannot land between the two commands and leave a counter
 * without a TTL — which would otherwise lock a user out permanently.
 */
const CONSUME_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { current, ttl }
`;

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  private key(bucket: RateLimitKey, subject: string): string {
    return `ratelimit:${bucket}:${subject}`;
  }

  async consume(bucket: RateLimitKey, subject: string): Promise<RateLimitResult> {
    const rule = RATE_LIMITS[bucket];
    const raw = (await this.redis.client.eval(
      CONSUME_SCRIPT,
      1,
      this.key(bucket, subject),
      String(rule.windowSeconds),
    )) as [number, number];

    const [count, ttl] = raw;
    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetInSeconds: ttl > 0 ? ttl : rule.windowSeconds,
    };
  }

  /** Consume one token or reject with the standard rate-limit error. */
  async enforce(bucket: RateLimitKey, subject: string): Promise<void> {
    const result = await this.consume(bucket, subject);
    if (!result.allowed) {
      throw new AppError(ERROR_CODES.RATE_LIMITED, 'Rate limit exceeded', {
        logContext: { bucket, resetInSeconds: result.resetInSeconds },
      });
    }
  }

  /**
   * Enforce several buckets together, e.g. story generation is capped both
   * hourly and daily.
   */
  async enforceAll(buckets: readonly RateLimitKey[], subject: string): Promise<void> {
    for (const bucket of buckets) {
      await this.enforce(bucket, subject);
    }
  }

  /** Undo a consumed token when the guarded operation never actually ran. */
  async refund(bucket: RateLimitKey, subject: string): Promise<void> {
    const key = this.key(bucket, subject);
    const current = await this.redis.client.get(key);
    if (current && Number(current) > 0) {
      await this.redis.client.decr(key);
    }
  }
}
