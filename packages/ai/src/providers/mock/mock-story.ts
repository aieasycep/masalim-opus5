import { AGE_BAND_RULES } from '@masalim/types';
import type { GeneratedStory } from '@masalim/validation';
import type {
  BuiltPrompt,
  ProviderResult,
  StoryGenerationInput,
  StoryGenerationProvider,
} from '../../types';

/**
 * Deterministic pseudo-randomness.
 *
 * Seeded from the input so the same wizard choices always produce the same
 * demo story — a test that asserts on page four would otherwise be flaky.
 */
function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const OPENINGS = [
  '{hero} o akşam pencereden dışarı baktığında gökyüzü her zamankinden başkaydı.',
  'Bir varmış bir yokmuş, {hero} adında meraklı biri varmış.',
  '{hero} yatağına uzandığında odanın köşesinde küçük bir ışık fark etti.',
  'O sabah {hero} uyandığında dünya biraz daha renkli görünüyordu.',
];

const MIDDLES = [
  '{hero} bir adım attı, sonra bir adım daha. Kalbi hızlı atıyordu ama durmadı.',
  'Yol uzundu ve {hero} yorulmuştu. Yine de her adımda biraz daha cesaretlendi.',
  '"Korkma," dedi {hero} kendi kendine. "Ben buradayım."',
  '{hero} etrafına baktı. Aradığı şey tam oradaydı, gözlerinin önünde.',
  'Küçük bir ses duydu {hero}. Eğildi ve dikkatle dinledi.',
  '{hero} elini uzattı. Parmakları ılık bir şeye değdi.',
  'Rüzgâr yavaşladı. Sanki dünya {hero} için bir an duraklamıştı.',
  '"Birlikte yaparız," dedi yeni arkadaşı. {hero} gülümsedi.',
  '{hero} artık biliyordu: en zor kısım başlamaktı, o da geride kalmıştı.',
  'Gökyüzü yavaşça koyulaştı ve ilk yıldızlar göründü.',
  '{hero} derin bir nefes aldı. İçi ferahladı.',
  'Her şey yerli yerine oturmaya başladı.',
];

const ENDINGS = [
  '{hero} eve döndüğünde yorganı hâlâ sıcaktı. Gözlerini kapattı ve gülümsedi. İyi geceler, {hero}.',
  'O gece {hero} çok güzel bir rüya gördü. Ve sabaha kadar hiç uyanmadı. İyi geceler, {hero}.',
  '{hero} yatağına uzandı. Bugün öğrendiği şeyi hiç unutmayacaktı. İyi geceler, {hero}.',
];

const SCENES = [
  'A small child looking out of a window at a starry night sky, warm lamplight, soft watercolour children\'s book illustration.',
  'A curious child walking along a gentle forest path in golden afternoon light, soft watercolour storybook style.',
  'A child crouching to look at something small and glowing in their hands, tender expression, soft watercolour.',
  'A wide calm landscape at dusk with a small figure in the distance, warm pastel sky, soft watercolour.',
  'A child and a small friendly creature sitting together, cosy and safe, soft watercolour children\'s book.',
  'A child asleep in bed with a faint warm glow nearby, moonlit bedroom, peaceful, soft watercolour.',
];

/**
 * Story generation without a provider.
 *
 * Produces a complete, schema-valid Turkish story of the right length and page
 * count for the requested age band, so every downstream stage — narration,
 * illustration, the book builder, the print renderer — has realistic material
 * to work with and the whole product runs with no API keys at all.
 */
export class MockStoryProvider implements StoryGenerationProvider {
  readonly name = 'mock';

  async generateStory(
    input: StoryGenerationInput,
    prompt: BuiltPrompt,
  ): Promise<ProviderResult<GeneratedStory>> {
    const startedAt = Date.now();

    // A prompt the safety layer should reject still gets rejected in mock mode,
    // so the moderation path can be exercised without a real provider.
    const random = seededRandom(
      `${input.heroName}:${input.themes.join(',')}:${input.ageRange}:${input.duration}`,
    );

    const band = AGE_BAND_RULES[input.ageRange];
    const pageCount = prompt.expectedPageCount;
    const wordsPerPage = Math.round(prompt.targetWords / pageCount);

    const pick = <T>(items: readonly T[]): T =>
      items[Math.floor(random() * items.length)] as T;

    const hero = input.heroName;
    const pages = Array.from({ length: pageCount }, (_, index) => {
      const pageNumber = index + 1;
      let text: string;
      if (pageNumber === 1) {
        text = pick(OPENINGS).replaceAll('{hero}', hero);
      } else if (pageNumber === pageCount) {
        text = pick(ENDINGS).replaceAll('{hero}', hero);
      } else {
        text = pick(MIDDLES).replaceAll('{hero}', hero);
      }

      // Pad toward the band's words-per-page target so the generated story is
      // the length the wizard promised the parent.
      while (countWords(text) < wordsPerPage && countWords(text) < band.wordsPerPage.max) {
        text = `${text} ${pick(MIDDLES).replaceAll('{hero}', hero)}`;
      }

      return {
        pageNumber,
        text: text.trim(),
        illustrationPrompt: pick(SCENES),
      };
    });

    const themeLabel = input.themes[0] ?? 'macera';
    const title = `${hero} ve ${TITLE_SUFFIX[themeLabel] ?? 'Küçük Yolculuk'}`;

    return {
      data: {
        title,
        summary: `${hero}, ${TITLE_SUFFIX[themeLabel] ?? 'küçük bir yolculuk'} sırasında cesaretini keşfeder.`,
        pages,
      },
      usage: {
        provider: this.name,
        model: 'mock-story-v1',
        inputTokens: Math.round((prompt.system.length + prompt.user.length) / 4),
        outputTokens: Math.round(prompt.targetWords * 2),
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  async repairStory(
    prompt: BuiltPrompt,
    _invalidOutput: string,
    _issues: string[],
  ): Promise<ProviderResult<GeneratedStory>> {
    // The mock always emits valid output, so a repair request means the caller
    // is exercising the retry path; produce a minimal valid story.
    return this.generateStory(
      {
        childName: null,
        childAgeInYears: null,
        childInterests: [],
        heroName: 'Kahraman',
        heroType: 'CHILD',
        themes: ['adventure'],
        ageRange: 'AGE_6_8',
        duration: 'SHORT',
        customPrompt: null,
        advancedSettings: {},
        language: 'tr',
      },
      prompt,
    );
  }
}

const TITLE_SUFFIX: Record<string, string> = {
  adventure: 'Uzun Yol',
  sleep: 'Uykuya Giden Yıldız',
  friendship: 'Yeni Arkadaşı',
  courage: 'Cesaret Taşı',
  animals: 'Ormanın Sesi',
  space: 'Kayıp Yıldız',
  fairytale: 'Sihirli Kapı',
  emotions: 'Kalbindeki Işık',
  educational: 'Merak Ettiği Şey',
  fantasy: 'Rüya Ülkesi',
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}
