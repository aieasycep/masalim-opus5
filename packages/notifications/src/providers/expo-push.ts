import type { PushMessage, PushProvider, PushRecipient, PushResult } from '../types';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
const BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 20_000;

interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Expo's push service, which fronts both APNs and FCM.
 *
 * Chosen because the app is built with EAS: one token format, one credential to
 * manage, and no separate Apple and Google plumbing for a product whose entire
 * notification surface is "your story is ready".
 */
export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';

  constructor(private readonly accessToken?: string) {}

  async send(recipients: PushRecipient[], message: PushMessage): Promise<PushResult[]> {
    const results: PushResult[] = [];

    for (let start = 0; start < recipients.length; start += BATCH_SIZE) {
      const batch = recipients.slice(start, start + BATCH_SIZE);
      results.push(...(await this.sendBatch(batch, message)));
    }

    return results;
  }

  private async sendBatch(
    recipients: PushRecipient[],
    message: PushMessage,
  ): Promise<PushResult[]> {
    const body = recipients.map((recipient) => ({
      to: recipient.token,
      title: message.title,
      body: message.body,
      sound: 'default',
      // Bedtime app: a notification arriving at 3am helps nobody.
      priority: 'normal',
      channelId: 'masalim-default',
      data: { deepLink: message.deepLink, type: message.type, ...message.data },
      ...(message.badge !== undefined ? { badge: message.badge } : {}),
    }));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        // A transport failure is not the device's fault; the tokens stay valid.
        return recipients.map((recipient) => ({
          token: recipient.token,
          delivered: false,
          permanentlyInvalid: false,
          errorCode: `http_${String(response.status)}`,
        }));
      }

      const payload = (await response.json()) as { data?: ExpoTicket[] };
      const tickets = payload.data ?? [];

      return recipients.map((recipient, index) => {
        const ticket = tickets[index];
        if (ticket?.status === 'ok') {
          return { token: recipient.token, delivered: true, permanentlyInvalid: false };
        }
        const error = ticket?.details?.error;
        return {
          token: recipient.token,
          delivered: false,
          // The app was uninstalled or the token revoked: retrying forever would
          // be pure waste.
          permanentlyInvalid: error === 'DeviceNotRegistered',
          ...(error ? { errorCode: error } : {}),
        };
      });
    } catch (error) {
      return recipients.map((recipient) => ({
        token: recipient.token,
        delivered: false,
        permanentlyInvalid: false,
        errorCode: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network',
      }));
    } finally {
      clearTimeout(timer);
    }
  }
}
