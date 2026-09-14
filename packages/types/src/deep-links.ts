/**
 * Deep links (master prompt §89).
 *
 * Push notifications carry a `link` field built with these helpers so tapping a
 * notification lands on exactly the right screen.
 */
export const DEEP_LINK_SCHEME = 'masalim';

export const DEEP_LINK_HOSTS = {
  STORY: 'story',
  BOOK: 'book',
  ORDER: 'order',
  VOICE: 'voice',
  JOB: 'job',
  SUBSCRIPTION: 'subscription',
} as const;

export type DeepLinkHost = (typeof DEEP_LINK_HOSTS)[keyof typeof DEEP_LINK_HOSTS];

export function buildDeepLink(host: DeepLinkHost, id?: string): string {
  return id ? `${DEEP_LINK_SCHEME}://${host}/${id}` : `${DEEP_LINK_SCHEME}://${host}`;
}

export interface ParsedDeepLink {
  host: DeepLinkHost;
  id: string | null;
}

const HOST_VALUES = new Set<string>(Object.values(DEEP_LINK_HOSTS));

export function parseDeepLink(url: string): ParsedDeepLink | null {
  const prefix = `${DEEP_LINK_SCHEME}://`;
  if (!url.startsWith(prefix)) return null;

  const [host, id] = url.slice(prefix.length).split('/');
  if (!host || !HOST_VALUES.has(host)) return null;

  return { host: host as DeepLinkHost, id: id && id.length > 0 ? id : null };
}
