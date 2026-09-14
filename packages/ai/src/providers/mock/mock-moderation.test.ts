import { describe, expect, it } from 'vitest';
import { MockModerationProvider } from './mock-moderation';

const provider = new MockModerationProvider();

async function verdict(text: string) {
  const result = await provider.check({
    text,
    subject: 'PARENT_PROMPT',
    ageRange: 'AGE_3_5',
  });
  return result.data;
}

describe('mock moderation provider', () => {
  it('allows an ordinary bedtime idea', async () => {
    const result = await verdict('Ege uzayda kaybolan küçük bir yıldızı bulsun.');
    expect(result.allowed).toBe(true);
    expect(result.reasonCode).toBeNull();
  });

  /**
   * Turkish is agglutinative: a parent writes "öldürsün", not "öldür". An
   * end-of-word anchor made the deny-list look like it worked while letting
   * every real inflected form through, so this is the case that matters.
   */
  it.each([
    ['Kahraman bıçakla birini öldürsün.', 'violence'],
    ['Silahlarla savaşsınlar.', 'weapons'],
    ['Uyuşturucuyu bulsunlar.', 'drugs'],
    ['Cinsellikten bahsetsin.', 'sexual'],
  ])('rejects %s', async (text, category) => {
    const result = await verdict(text);
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe(category);
  });

  it('reports every category it scored, not only the one that tripped', async () => {
    const result = await verdict('Kahraman birini öldürsün.');
    expect(Object.keys(result.categories).sort()).toEqual([
      'drugs',
      'hate',
      'self_harm',
      'sexual',
      'violence',
      'weapons',
    ]);
    expect(result.categories.violence).toBe(1);
    expect(result.categories.drugs).toBe(0);
  });
});
