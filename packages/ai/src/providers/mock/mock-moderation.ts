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
 */
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\b(seks|cinsel|porno|çıplak|sex|porn|nude)\b/i, category: 'sexual' },
  {
    pattern: /\b(öldür|katlet|kan\s?revan|işkence|cinayet|kill|murder|torture)\b/i,
    category: 'violence',
  },
  {
    pattern: /\b(intihar|kendine\s?zarar|suicide|self[-\s]?harm)\b/i,
    category: 'self_harm',
  },
  {
    pattern: /\b(uyuşturucu|esrar|kokain|eroin|drugs|cocaine|heroin)\b/i,
    category: 'drugs',
  },
  { pattern: /\b(silah|tabanca|bomba|gun|pistol|bomb)\b/i, category: 'weapons' },
  {
    pattern: /\b(nefret|ırkçı|aşağıla|hate\s?speech|racist)\b/i,
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
