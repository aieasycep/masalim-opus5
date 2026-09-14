import type { DevicePlatform, Locale, NotificationType } from '@masalim/types';

export interface PushRecipient {
  token: string;
  platform: DevicePlatform;
  locale: Locale;
}

export interface PushMessage {
  type: NotificationType;
  /** Already localised by the caller: the device shows this verbatim. */
  title: string;
  body: string;
  /** Deep link the notification opens, e.g. `masalim://story/abc`. */
  deepLink: string;
  /** Small payload the app reads on open; never sensitive. */
  data?: Record<string, string>;
  badge?: number;
}

export interface PushResult {
  token: string;
  delivered: boolean;
  /**
   * Set when the device is gone for good — an uninstalled app, a revoked token.
   * The caller disables the row rather than retrying forever.
   */
  permanentlyInvalid: boolean;
  errorCode?: string;
}

export interface PushProvider {
  readonly name: string;
  send(recipients: PushRecipient[], message: PushMessage): Promise<PushResult[]>;
}
