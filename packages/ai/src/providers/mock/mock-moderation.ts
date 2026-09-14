import type {
  ModerationInput,
  ModerationProvider,
  ModerationVerdict,
  ProviderResult,
} from '../../types';

/**
 * Turkish and English terms that must never reach a children's story.
 *
 * Deliberately narrow and literal: the mock exists so the safety *pipeline* can
 * be exercised without a provider, not to be a real classifier. Production uses
 * the moderation API plus an LLM safety pass; this list only has to make the
 * rejection path reachable in tests and local development.
 *
 * Two things the obvious `\b(term)\b` spelling gets wrong for Turkish, both of
 * which make the deny-list look like it works while never firing:
 *
 * - A trailing `\b` misses every inflected form, and Turkish is agglutinative:
 *   a parent writes "öldürsün", "silahlarla", "uyuşturucuyu", never the bare
 *   stem. So the patterns anchor at the start of a word only.
 * - `\b` itself is defined over ASCII word characters, so it does not match
 *   before "öldür" or "ırkçı" — the boundary between a space and "ö" is not a
 *   boundary as far as `\b` is concerned. A Unicode-aware lookbehind is used
 *   instead.
 */
const WORD_START = String.raw`(?<![\p{L}\p{N}])`;

function blocked(terms: string[]): RegExp {
  return new RegExp(`${WORD_START}(${terms.join('|')})`, 'iu');
}

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  {
    pattern: blocked(['seks', 'cinsel', 'porno', 'çıplak', 'sex', 'porn', 'nude']),
    category: 'sexual',
  },
  {
    pattern: blocked([
      'öldür',
      'katlet',
      String.raw`kan\s?revan`,
      'işkence',
      'cinayet',
      'bıçakla',
      'kill',
      'murder',
      'torture',
    ]),
    category: 'violence',
  },
  {
    pattern: blocked([
      'intihar',
      String.raw`kendine\s?zarar`,
      'suicide',
      String.raw`self[-\s]?harm`,
    ]),
    category: 'self_harm',
  },
  {
    pattern: blocked(['uyuşturucu', 'esrar', 'kokain', 'eroin', 'drugs', 'cocaine', 'heroin']),
    category: 'drugs',
  },
  {
    pattern: blocked(['silah', 'tabanca', 'bomba', 'gun', 'pistol', 'bomb']),
    category: 'weapons',
  },
  {
    pattern: blocked(['nefret', 'ırkçı', 'aşağıla', String.raw`hate\s?speech`, 'racist']),
    category: 'hate',
  },
];

export class MockModerationProvider implements ModerationProvider {
  readonly name = 'mock';

  async check(input: ModerationInput): Promise<ProviderResult<ModerationVerdict>> {
    const startedAt = Date.now();
    const categories: Record<string, number> = {};
    let reasonCode: string | null = null;

    for (const { pattern, category } of BLOCKED_PATTERNS) {
      const matched = pattern.test(input.text);
      categories[category] = matched ? 1 : 0;
      if (matched && !reasonCode) {
        reasonCode = category;
      }
    }

    return {
      data: {
        allowed: reasonCode === null,
        reasonCode,
        categories,
      },
      usage: {
        provider: this.name,
        model: 'mock-moderation-v1',
        characters: input.text.length,
        latencyMs: Date.now() - startedAt,
      },
    };
  }
}
