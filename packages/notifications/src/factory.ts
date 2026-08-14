import { ExpoPushProvider } from './providers/expo-push';
import { MockPushProvider } from './providers/mock-push';
import type { PushProvider } from './types';

export interface PushProviderConfig {
  isProduction: boolean;
  provider: string;
  expoAccessToken?: string | undefined;
}

export function createPushProvider(config: PushProviderConfig): PushProvider {
  if (config.isProduction && config.provider === 'mock') {
    throw new Error(
      'The mock push provider cannot be used in production. Configure PUSH_PROVIDER=expo.',
    );
  }

  if (config.provider === 'expo') {
    return new ExpoPushProvider(config.expoAccessToken);
  }
  return new MockPushProvider();
}
