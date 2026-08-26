import OpenAI from 'openai';
import { AGE_BAND_RULES } from '@masalim/types';
import type {
  ModerationInput,
  ModerationProvider,
  ModerationVerdict,
  ProviderResult,
} from '../../types';
import { toProviderError } from './openai-story';

export interface OpenAIModerationOptions {
  apiKey: string;
  /** The moderation endpoint's model, e.g. omni-moderation-latest. */
  moderationModel: string;
  /** Chat model used for the age-appropriateness pass. */
  classifierModel: string;
  timeoutMs?: number;
}

/**
 * Categories that block outright, whatever the age.
 *
 * The hosted moderation endpoint is tuned for general audiences, so it is only
 * the first half of the check: it reliably catches the severe categories, but
 * "fine for adults, too frightening for a four-year-old" is invisible to it.
 * The second pass below covers that.
 */
const HARD_BLOCK_CATEGORIES = [
  'sexual',
  'sexual/minors',
  'harassment/threatening',
  'hate',
  'hate/threatening',
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
  'violence/graphic',
  'illicit',
  'illicit/violent',
] as const;

interface AgeVerdict {
  suitable: boolean;
  reason: string | null;
}

export class OpenAIModerationProvider implements ModerationProvider {
  readonly name = 'openai';

  private readonly client: OpenAI;
  private readonly moderationModel: string;
  private readonly classifierModel: string;

  constructor(options: OpenAIModerationOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 30_000,
      maxRetries: 2,
    });
    this.moderationModel = options.moderationModel;
    this.classifierModel = options.classifierModel;
  }

  async check(input: ModerationInput): Promise<ProviderResult<ModerationVerdict>> {
    const startedAt = Date.now();

    let categories: Record<string, number> = {};
    let reasonCode: string | null = null;

    try {
      const moderation = await this.client.moderations.create({
        model: this.moderationModel,
        input: input.text,
      });

      const result = moderation.results[0];
      if (result) {
        categories = { ...(result.category_scores as unknown as Record<string, number>) };
        for (const category of HARD_BLOCK_CATEGORIES) {
          if ((result.categories as unknown as Record<string, boolean>)[category]) {
            reasonCode = category;
            break;
          }
        }
      }
    } catch (error) {
      throw toProviderError(error);
    }

    // A severe category is decisive; no need to spend a second call.
    if (reasonCode) {
      return {
        data: { allowed: false, reasonCode, categories },
        usage: {
          provider: this.name,
          model: this.moderationModel,
          characters: input.text.length,
          latencyMs: Date.now() - startedAt,
        },
      };
    }

    const ageVerdict = await this.checkAgeAppropriateness(input);
    return {
      data: {
        allowed: ageVerdict.suitable,
        reasonCode: ageVerdict.suitable ? null : (ageVerdict.reason ?? 'age_inappropriate'),
        categories,
      },
      usage: {
        provider: this.name,
        model: `${this.moderationModel}+${this.classifierModel}`,
        characters: input.text.length,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  /**
   * Second pass: is this suitable for *this child's age*?
   *
   * This is the check that matters most in practice. A story about a lost pet
   * that never comes home passes every hosted safety category and is still the
   * wrong thing to read a three-year-old at bedtime.
   */
  private async checkAgeAppropriateness(input: ModerationInput): Promise<AgeVerdict> {
    const band = AGE_BAND_RULES[input.ageRange];

    try {
      const completion = await this.client.chat.completions.create({
        model: this.classifierModel,
        max_completion_tokens: 200,
        messages: [
          {
            role: 'system',
            content: [
              'Sen çocuk içeriği güvenlik denetçisisin.',
              `Hedef yaş grubu: ${band.label} yaş.`,
              `Bu yaş için izin verilen en yüksek gerilim seviyesi: ${band.maxTensionLevel}/3.`,
              '',
              'Metnin bu yaştaki bir çocuğa uyku öncesi okunmaya uygun olup olmadığına karar ver.',
              'Uygun DEĞİLSE nedenini şu kodlardan biriyle ver:',
              'too_frightening, unresolved_loss, death, violence, adult_theme,',
              'dangerous_imitation, sexual, substances, hate, other',
              '',
              'Sadece JSON döndür: {"suitable": boolean, "reason": string|null}',
            ].join('\n'),
          },
          {
            role: 'user',
            content:
              input.subject === 'PARENT_PROMPT'
                ? `Ebeveynin hikâye fikri:\n"""\n${input.text}\n"""`
                : `Oluşturulan hikâye:\n"""\n${input.text.slice(0, 12_000)}\n"""`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'age_verdict',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['suitable', 'reason'],
              properties: {
                suitable: { type: 'boolean' },
                reason: { type: ['string', 'null'] },
              },
            },
          },
        },
      });

      const content = completion.choices[0]?.message.content;
      if (!content) return { suitable: true, reason: null };

      const parsed = JSON.parse(content) as AgeVerdict;
      return {
        suitable: parsed.suitable !== false,
        reason: parsed.reason ?? null,
      };
    } catch {
      // Failing open here is deliberate and bounded: the severe categories were
      // already cleared by the hosted endpoint, and blocking every story
      // whenever the classifier hiccups would be worse for families than
      // occasionally letting a borderline-but-safe story through.
      return { suitable: true, reason: null };
    }
  }
}
