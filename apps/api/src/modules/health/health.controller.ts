import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../core/auth/auth.decorators';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { AppConfigService } from '../../core/config/config.service';

interface HealthReport {
  status: 'ok' | 'degraded';
  environment: string;
  checks: Record<string, { status: 'up' | 'down'; latencyMs?: number; error?: string }>;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe including database and Redis' })
  async ready(): Promise<HealthReport> {
    const checks: HealthReport['checks'] = {};

    checks.database = await this.timed(() => this.prisma.raw.$queryRaw`SELECT 1`);
    checks.redis = await this.timed(() => this.redis.client.ping());

    const allUp = Object.values(checks).every((check) => check.status === 'up');
    return {
      status: allUp ? 'ok' : 'degraded',
      environment: this.config.get('APP_ENV'),
      checks,
    };
  }

  private async timed(
    probe: () => Promise<unknown>,
  ): Promise<{ status: 'up' | 'down'; latencyMs?: number; error?: string }> {
    const startedAt = process.hrtime.bigint();
    try {
      await probe();
      return {
        status: 'up',
        latencyMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000),
      };
    } catch (error) {
      return {
        status: 'down',
        error: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }
}
