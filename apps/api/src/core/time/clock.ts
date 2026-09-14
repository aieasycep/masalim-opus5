import { Injectable } from '@nestjs/common';

/**
 * Injectable clock.
 *
 * Quota periods, token expiry, retention windows and delivery estimates all
 * depend on "now". Injecting it keeps those testable without freezing global
 * time, and it is why `new Date()` is banned by lint outside this file.
 */
@Injectable()
export class Clock {
  now(): Date {
    // eslint-disable-next-line no-restricted-syntax
    return new Date();
  }

  timestamp(): number {
    return Date.now();
  }

  /** `now` shifted by a number of seconds; negative values move backwards. */
  plusSeconds(seconds: number): Date {
    return new Date(this.timestamp() + seconds * 1000);
  }

  plusDays(days: number): Date {
    return this.plusSeconds(days * 24 * 60 * 60);
  }
}

/** Deterministic clock for tests. */
export class FixedClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  override now(): Date {
    return new Date(this.current.getTime());
  }

  override timestamp(): number {
    return this.current.getTime();
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }

  set(date: Date): void {
    this.current = date;
  }
}
