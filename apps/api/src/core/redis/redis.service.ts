import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/config.service';

/**
 * Redis connections.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on the connections it owns, and
 * a subscriber connection cannot issue ordinary commands, so the three roles are
 * kept apart rather than sharing one client.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly url: string;
  private commandClient: Redis | undefined;
  private subscriberClient: Redis | undefined;
  private publisherClient: Redis | undefined;
  private readonly queueConnections: Redis[] = [];

  constructor(config: AppConfigService) {
    this.url = config.get('REDIS_URL');
  }

  /** General-purpose client for rate limiting, caching and idempotency. */
  get client(): Redis {
    this.commandClient ??= new Redis(this.url, { maxRetriesPerRequest: 3 });
    return this.commandClient;
  }

  /** Dedicated publisher for job-progress fan-out. */
  get publisher(): Redis {
    this.publisherClient ??= new Redis(this.url, { maxRetriesPerRequest: 3 });
    return this.publisherClient;
  }

  /** Dedicated subscriber; once subscribed it cannot run other commands. */
  get subscriber(): Redis {
    this.subscriberClient ??= new Redis(this.url, { maxRetriesPerRequest: 3 });
    return this.subscriberClient;
  }

  /** Fresh connection for a BullMQ queue or worker. */
  createQueueConnection(): Redis {
    const connection = new Redis(this.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    this.queueConnections.push(connection);
    return connection;
  }

  async onModuleDestroy(): Promise<void> {
    const clients = [
      this.commandClient,
      this.publisherClient,
      this.subscriberClient,
      ...this.queueConnections,
    ].filter((client): client is Redis => client !== undefined);

    await Promise.all(clients.map((client) => client.quit().catch(() => undefined)));
  }
}
