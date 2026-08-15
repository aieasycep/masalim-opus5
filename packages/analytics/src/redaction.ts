import type { AnalyticsProperties } from '@masalim/types';

/**
 * Property keys that must never leave the device.
 *
 * A product like this one has an unusually sharp version of the usual analytics
 * risk: the interesting fields are a child's name, the prompt a parent wrote
 * about them, and the story that came back. Any of those in an event payload
 * would ship a family's bedtime into a third-party dashboard, so the guard is
 * placed in the pipeline rather than trusted to every call site.
 *
 * Matching is on the key, case-insensitively, and by substring — `childName`,
 * `child_name` and `heroName` all match `name`. That is deliberately blunt.
 * Losing a harmless property to over-matching costs a metric; letting one
 * through costs something that cannot be taken back.
 */
const FORBIDDEN_KEY_FRAGMENTS = [
  'name',
  'email',
  'phone',
  'address',
  'prompt',
  'text',
  'title',
  'dedication',
  'password',
  'token',
  'url',
  'city',
  'postal',
  'birth',
] as const;

/** Long free text is a story or a prompt, whatever the key is called. */
const MAX_STRING_LENGTH = 64;

export function isForbiddenKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return FORBIDDEN_KEY_FRAGMENTS.some((fragment) => lowered.includes(fragment));
}

/**
 * Strips anything identifying from a payload before it is sent.
 *
 * Returns a new object; forbidden keys are dropped entirely rather than
 * replaced with a placeholder, because a `"[redacted]"` value in a dashboard
 * invites someone to go looking for where the real one went.
 */
export function redact(properties: AnalyticsProperties | undefined): AnalyticsProperties {
  if (!properties) return {};

  const safe: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (isForbiddenKey(key)) continue;
    if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) continue;
    safe[key] = value;
  }
  return safe;
}
