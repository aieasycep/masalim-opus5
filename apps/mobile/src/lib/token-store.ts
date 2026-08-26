import * as SecureStore from 'expo-secure-store';
import type { AuthTokens } from '@masalim/types';
import type { TokenStore } from '@masalim/api-client';

const ACCESS_KEY = 'masalim.accessToken';
const REFRESH_KEY = 'masalim.refreshToken';

/**
 * Session tokens, in the device keychain.
 *
 * SecureStore rather than AsyncStorage, always. A refresh token is a long-lived
 * credential to a family's stories, their child's name and their saved address;
 * AsyncStorage is a plaintext file that any backup or a rooted device hands
 * over (master prompt §83).
 *
 * Reads are cached in memory because every request needs the access token and a
 * keychain round trip on each one is measurable.
 */
class SecureTokenStore implements TokenStore {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private hydrated = false;

  async getAccessToken(): Promise<string | null> {
    await this.hydrate();
    return this.accessToken;
  }

  async getRefreshToken(): Promise<string | null> {
    await this.hydrate();
    return this.refreshToken;
  }

  async setTokens(tokens: AuthTokens): Promise<void> {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.hydrated = true;

    await Promise.all([
      SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
      SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
    ]);
  }

  async clear(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.hydrated = true;

    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
    ]);
  }

  /** True when a session exists to restore, without exposing the tokens. */
  async hasSession(): Promise<boolean> {
    await this.hydrate();
    return this.refreshToken !== null;
  }

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;

    const [access, refresh] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_KEY),
      SecureStore.getItemAsync(REFRESH_KEY),
    ]);

    this.accessToken = access;
    this.refreshToken = refresh;
    this.hydrated = true;
  }
}

export const tokenStore = new SecureTokenStore();
