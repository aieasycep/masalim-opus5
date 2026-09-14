import type { Locale } from '@masalim/types';

/**
 * The passage a parent reads aloud to create their voice.
 *
 * Kept out of the message catalogue because it is not interface copy: it is
 * training material. Roughly sixty seconds at a calm bedtime pace, phonetically
 * varied enough for a clone, and warm enough that reading it aloud does not feel
 * like a chore — a parent reads this once, and it should sound like something
 * worth reading.
 *
 * Versioned, because a clone is only comparable to another clone made from the
 * same script, and the version is stored with the voice profile.
 */
export const VOICE_ENROLMENT_SCRIPT_VERSION = '2026-08-01';

const tr: readonly string[] = [
  'Bir varmış bir yokmuş, çok uzak dağların ötesinde, yıldızların arasında küçük bir köy varmış. Bu köyde yaşayan çocuklar her gece gökyüzüne bakarlarmış. Onlar için her yıldız bir hikâyenin başlangıcıymış.',
  'Köyün en küçük evinde, pencere kenarında oturan bir çocuk yaşarmış. Adı neydi bilen yokmuş ama gülüşünü herkes tanırmış. Her akşam yorganını çenesine kadar çeker, gözlerini kapatır ve o gün duyduğu masalı yeniden kurarmış içinden.',
  'Bazen bir ejderha olurmuş masalında, bazen kaybolmuş bir kedi. Bazen de sadece sıcak bir çorba ve tanıdık bir ses. Çünkü çocuk şunu çok iyi bilirmiş: en güzel masallar, sevdiğin birinin sesiyle anlatılanlarmış.',
  'Ve o ses, ne kadar uzakta olursa olsun, her gece yanına gelirmiş.',
];

const en: readonly string[] = [
  'Once upon a time, far beyond the distant mountains and somewhere among the stars, there was a small village. Every night the children who lived there looked up at the sky. For them, each star was the beginning of a story.',
  'In the smallest house in the village lived a child who sat by the window. Nobody could remember their name, but everybody knew their smile. Every evening they pulled the blanket up to their chin, closed their eyes, and quietly rebuilt the story they had heard that day.',
  'Sometimes there was a dragon in it, sometimes a cat who had lost its way. Sometimes only warm soup and a familiar voice. Because the child knew this very well: the best stories are the ones told in the voice of someone you love.',
  'And that voice, however far away it was, came to them every night.',
];

export const VOICE_ENROLMENT_SCRIPTS: Readonly<Record<Locale, readonly string[]>> = {
  tr,
  en,
};
