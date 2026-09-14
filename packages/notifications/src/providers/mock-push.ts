import type { PushMessage, PushProvider, PushRecipient, PushResult } from '../types';

export interface SentPush {
  recipients: PushRecipient[];
  message: PushMessage;
}

/**
 * Push without a push service.
 *
 * Keeps what it was asked to send so tests can assert a parent was told their
 * story is ready, and treats a token starting with `invalid-` as a dead device
 * so the token-cleanup path is reachable without uninstalling an app.
 */
export class MockPushProvider implements PushProvider {
  readonly name = 'mock';
  private readonly sent: SentPush[] = [];

  async send(recipients: PushRecipient[], message: PushMessage): Promise<PushResult[]> {
    this.sent.push({ recipients, message });

    return recipients.map((recipient) => {
      const dead = recipient.token.startsWith('invalid-');
      return {
        token: recipient.token,
        delivered: !dead,
        permanentlyInvalid: dead,
        ...(dead ? { errorCode: 'DeviceNotRegistered' } : {}),
      };
    });
  }

  /** Test affordance: everything this provider was handed, in order. */
  outbox(): readonly SentPush[] {
    return this.sent;
  }

  clear(): void {
    this.sent.length = 0;
  }
}
