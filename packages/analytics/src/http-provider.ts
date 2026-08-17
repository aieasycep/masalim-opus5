import type { AnalyticsEvent, AnalyticsProperties } from '@masalim/types';
import type { AnalyticsProvider } from './types';

/** How many events accumulate before a send is triggered. */
const BATCH_SIZE = 20;

/** Longest an event waits for company before going on its own. */
const FLUSH_INTERVAL_MS = 15_000;

/**
 * Beyond this the queue drops its oldest entries.
 *
 * A device that has been offline all evening must not grow an unbounded array
 * of bedtime metrics in memory. Losing the oldest is the right end to lose
 * from: recent events are the ones still worth anything.
 */
const MAX_QUEUE = 200;

interface QueuedEvent {
  event: string;
  properties: AnalyticsProperties;
  timestamp: string;
}

/**
 * Ships events over PostHog's capture API.
 *
 * Written against the HTTP endpoint rather than a vendor SDK, which keeps a
 * native dependency out of the app for what is ultimately a JSON POST, and
 * keeps this package free of anything platform-specific — the same provider
 * works from the API process.
 *
 * Everything is fire-and-forget. A send that fails is dropped rather than
 * retried forever: analytics is the least important traffic this app makes, and
 * a vendor outage must never turn into a queue that grows until the app is
 * slow. `flush()` is the one place a caller can await, and it still resolves on
 * failure.
 */
export class HttpAnalyticsProvider implements AnalyticsProvider {
  readonly name = 'posthog-http';

  private queue: QueuedEvent[] = [];
  private distinctId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly host: string,
    /** Injected so tests do not reach the network. */
    private readonly fetchImpl: typeof fetch = fetch,
    /**
     * Injected for the same reason as `fetchImpl`: an event's timestamp is part
     * of what gets sent, so a test that cannot control it cannot assert on it.
     */
    // eslint-disable-next-line no-restricted-syntax -- this default IS the clock source
    private readonly now: () => Date = () => new Date(),
  ) {}

  capture(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
    this.queue.push({
      event,
      properties: properties ?? {},
      timestamp: this.now().toISOString(),
    });

    if (this.queue.length > MAX_QUEUE) {
      this.queue = this.queue.slice(-MAX_QUEUE);
    }

    if (this.queue.length >= BATCH_SIZE) {
      void this.flush();
      return;
    }
    this.scheduleFlush();
  }

  /**
   * Associates an account.
   *
   * The id is whatever the caller passes and is expected to be an opaque
   * account id — never an email. `Analytics` redacts properties, but a distinct
   * id is not a property, so this one is on the call site.
   */
  identify(distinctId: string, properties?: AnalyticsProperties): void {
    this.distinctId = distinctId;
    this.capture('$identify' as AnalyticsEvent, properties);
  }

  reset(): void {
    this.distinctId = null;
    // Anything still queued was captured under the identity being discarded.
    this.queue = [];
    this.clearTimer();
  }

  async flush(): Promise<void> {
    this.clearTimer();
    if (this.queue.length === 0) return;

    const batch = this.queue;
    this.queue = [];

    try {
      await this.fetchImpl(`${this.host.replace(/\/$/, '')}/batch/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          batch: batch.map((entry) => ({
            event: entry.event,
            timestamp: entry.timestamp,
            distinct_id: this.distinctId ?? 'anonymous',
            properties: entry.properties,
          })),
        }),
      });
    } catch {
      // Dropped on purpose. See the class comment: retrying analytics forever
      // is how a metrics outage becomes an app problem.
    }
  }

  private scheduleFlush(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    // Node keeps the process alive for a pending timer; the API should be able
    // to exit with metrics still queued.
    this.timer.unref?.();
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
