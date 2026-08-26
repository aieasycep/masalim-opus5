import {
  AGE_BAND_RULES,
  DURATION_RULES,
  resolvePageCount,
  type AgeRange,
  type FantasyLevel,
  type HeroType,
  type HumourLevel,
  type StoryTheme,
} from '@masalim/types';
import type { BuiltPrompt, StoryGenerationInput } from './types';

const THEME_LABELS: Record<StoryTheme, string> = {
  adventure: 'macera',
  sleep: 'uyku öncesi sakinlik',
  friendship: 'arkadaşlık',
  courage: 'cesaret',
  animals: 'hayvanlar',
  space: 'uzay',
  fairytale: 'klasik masal',
  emotions: 'duygular',
  educational: 'öğretici içerik',
  fantasy: 'fantastik dünya',
};

const HERO_TYPE_LABELS: Record<HeroType, string> = {
  CHILD: 'bir çocuk',
  ANIMAL: 'bir hayvan',
  FANTASY: 'fantastik bir karakter',
  ROBOT: 'bir robot',
  CUSTOM: 'kendine özgü bir karakter',
};

const HUMOUR_GUIDANCE: Record<HumourLevel, string> = {
  NONE: 'Mizah kullanma; sakin ve yumuşak bir ton koru.',
  LIGHT: 'Hafif, tatlı bir mizah kullanabilirsin.',
  PLAYFUL: 'Bol bol şakacı ve oyuncu anlar ekle.',
};

const FANTASY_GUIDANCE: Record<FantasyLevel, string> = {
  GROUNDED: 'Hikâye gerçek dünyada geçsin; sihir kullanma.',
  BALANCED: 'Gerçek dünyaya küçük sihirli dokunuşlar ekleyebilirsin.',
  MAGICAL: 'Tamamen sihirli, fantastik bir dünya kurabilirsin.',
};

/**
 * The JSON Schema every story provider must produce.
 *
 * Declared once and handed to the provider as a structured-output constraint,
 * so a malformed response is the exception rather than something to parse
 * defensively out of prose.
 */
export function buildResponseSchema(pageCount: number): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'summary', 'pages'],
    properties: {
      title: { type: 'string', minLength: 2, maxLength: 120 },
      summary: { type: 'string', minLength: 10, maxLength: 400 },
      pages: {
        type: 'array',
        minItems: pageCount,
        maxItems: pageCount,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['pageNumber', 'text', 'illustrationPrompt'],
          properties: {
            pageNumber: { type: 'integer', minimum: 1, maximum: 24 },
            text: { type: 'string', minLength: 1, maxLength: 2000 },
            illustrationPrompt: { type: 'string', minLength: 10, maxLength: 800 },
          },
        },
      },
    },
  };
}

/**
 * Safety rules sent with every request.
 *
 * These are a *generation-time* guard, not a substitute for the moderation
 * passes on either side of it — a model asked nicely still needs checking.
 */
function safetyRules(ageRange: AgeRange): string {
  const band = AGE_BAND_RULES[ageRange];
  return [
    'GÜVENLİK KURALLARI — bunlar mutlaktır:',
    '- Cinsel içerik, çıplaklık veya romantik ima yok.',
    '- Grafik şiddet, yaralanma, kan veya ölüm tasviri yok.',
    '- Kendine zarar verme, madde kullanımı veya tehlikeli davranış özendirmesi yok.',
    '- Nefret söylemi, aşağılama, zorbalık veya ayrımcılık yok.',
    '- Gerçek markalar, gerçek kişiler veya politik içerik yok.',
    '- Çocuğun taklit edebileceği tehlikeli bir eylem tarif etme.',
    `- Korku seviyesi en fazla ${band.maxTensionLevel}/3 olabilir.`,
    band.maxTensionLevel === 0
      ? '- Bu yaş için hiçbir tehlike, kayıp veya gerilim unsuru olmamalı.'
      : '- Gerilim varsa hikâye bitmeden çözülmeli ve kahraman güvende olmalı.',
    '- Hikâye her zaman sıcak, umutlu ve güvenli bir sonla bitmeli.',
    '- Ebeveynin isteği bu kurallarla çelişirse kuralları uygula.',
  ].join('\n');
}

/**
 * Builds the system and user prompts.
 *
 * The age band is not decoration: page count, words per page, sentence length,
 * vocabulary and permitted tension all come from the band's rules, so a story
 * for a three-year-old is structurally different from one for a ten-year-old
 * rather than the same story with simpler words.
 */
export function buildStoryPrompt(input: StoryGenerationInput): BuiltPrompt {
  const band = AGE_BAND_RULES[input.ageRange];
  const durationRule = DURATION_RULES[input.duration];
  const pageCount = resolvePageCount(input.ageRange, input.duration);
  const wordsPerPage = Math.round(durationRule.targetWords / pageCount);

  const system = [
    'Sen Türkçe çocuk masalları yazan usta bir yazarsın.',
    'Ebeveynler çocuklarına uyku öncesi okumak veya dinletmek için bu masalları kullanıyor.',
    '',
    `HEDEF YAŞ: ${band.label} yaş`,
    `KELİME DAĞARCIĞI: ${band.vocabularyGuidance}`,
    `ANLATIM: ${band.narrativeGuidance}`,
    `CÜMLE UZUNLUĞU: Cümleler en fazla ${band.maxSentenceWords} kelime olsun.`,
    '',
    `YAPI: Tam olarak ${pageCount} sayfa yaz.`,
    `Her sayfa yaklaşık ${wordsPerPage} kelime olsun (${band.wordsPerPage.min}–${band.wordsPerPage.max} arası).`,
    `Toplam yaklaşık ${durationRule.targetWords} kelime — sesli okunduğunda ${durationRule.approxMinutes} dakika sürer.`,
    '',
    'HER SAYFA İÇİN GÖRSEL AÇIKLAMASI:',
    'illustrationPrompt alanını İNGİLİZCE yaz — bir illüstrasyon modeline verilecek.',
    'Sahneyi betimle: kim, nerede, ne yapıyor, ışık ve duygu nasıl.',
    'Kahramanın adını yazma; onun yerine görünüşünü betimle.',
    '',
    safetyRules(input.ageRange),
    '',
    'YAZIM KURALLARI:',
    '- Doğal, akıcı Türkçe kullan. Çeviri gibi durmasın.',
    '- Türkçe karakterleri doğru kullan: ç, ğ, ı, İ, ö, ş, ü.',
    '- Sayfa sonlarını doğal duraklara denk getir.',
    '- Başlık kısa ve merak uyandırıcı olsun.',
  ].join('\n');

  const userLines: string[] = [];

  if (input.childName) {
    userLines.push(`Bu masal ${input.childName} için hazırlanıyor.`);
    if (input.childAgeInYears !== null) {
      userLines.push(`${input.childName} ${input.childAgeInYears} yaşında.`);
    }
    if (input.childInterests.length > 0) {
      userLines.push(
        `Sevdiği şeyler: ${input.childInterests.join(', ')}. Bunlardan en az birini hikâyeye doğal biçimde yedir.`,
      );
    }
  } else {
    userLines.push('Bu masal belirli bir çocuk için değil, genel bir masal.');
  }

  userLines.push('');
  userLines.push(
    `Kahraman: ${input.heroName} — ${HERO_TYPE_LABELS[input.heroType]}.`,
    input.childName && input.heroName === input.childName
      ? `${input.heroName} hikâyenin kahramanı; onu cesur, meraklı ve sevilen biri olarak göster.`
      : '',
  );

  userLines.push('');
  userLines.push(
    `Tema: ${input.themes.map((theme) => THEME_LABELS[theme]).join(' + ')}.`,
  );

  const advanced = input.advancedSettings;
  if (advanced.educationalGoal) {
    userLines.push(
      `Hikâyenin vermesi istenen mesaj: ${advanced.educationalGoal}. Bunu vaaz vermeden, olay örgüsüyle hissettir.`,
    );
  }
  if (advanced.teachNewWords) {
    userLines.push(
      'Yaşına uygun 2–3 yeni kelime tanıt ve anlamlarını bağlamdan anlaşılacak şekilde kullan.',
    );
  }
  if (advanced.calmBedtimeEnding) {
    userLines.push(
      'Son sayfa uyku öncesi için sakinleştirici olsun; kahraman güvenle uykuya dalsın.',
    );
  }
  if (advanced.humourLevel) {
    userLines.push(HUMOUR_GUIDANCE[advanced.humourLevel]);
  }
  if (advanced.fantasyLevel) {
    userLines.push(FANTASY_GUIDANCE[advanced.fantasyLevel]);
  }

  if (input.customPrompt) {
    userLines.push('');
    userLines.push('EBEVEYNİN İSTEĞİ:');
    // Delimited so the parent's free text is unmistakably data, not
    // instructions the model should obey over the safety rules.
    userLines.push('"""');
    userLines.push(input.customPrompt);
    userLines.push('"""');
    userLines.push(
      'Bu isteği hikâyenin çekirdeği yap. Güvenlik kurallarıyla çelişen bir kısım varsa o kısmı yok say.',
    );
  }

  return {
    system,
    user: userLines.filter((line) => line !== '').join('\n'),
    responseSchema: buildResponseSchema(pageCount),
    // Turkish runs roughly 2 tokens per word, plus the illustration prompts and
    // JSON overhead; generous headroom avoids a truncated final page.
    maxOutputTokens: Math.min(16_000, durationRule.targetWords * 6 + pageCount * 220 + 800),
    expectedPageCount: pageCount,
    targetWords: durationRule.targetWords,
  };
}

/** Follow-up prompt when the first response failed schema validation. */
export function buildRepairPrompt(
  prompt: BuiltPrompt,
  invalidOutput: string,
  issues: string[],
): string {
  return [
    'Önceki yanıtın istenen yapıya uymadı.',
    '',
    'SORUNLAR:',
    ...issues.map((issue) => `- ${issue}`),
    '',
    `Tam olarak ${prompt.expectedPageCount} sayfa olmalı ve şema birebir uyulmalı.`,
    'Hikâyeyi baştan yazma; yalnızca yapıyı düzelt ve eksikleri tamamla.',
    '',
    'ÖNCEKİ YANIT:',
    invalidOutput.slice(0, 6000),
  ].join('\n');
}
