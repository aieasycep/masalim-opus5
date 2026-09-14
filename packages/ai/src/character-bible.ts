import type { CharacterBible, HeroType, IllustrationStyle } from '@masalim/types';

/** Deterministic per-hero appearance, so the same hero always looks the same. */
function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

const HAIR = [
  'short dark brown',
  'wavy black',
  'soft chestnut',
  'curly dark',
  'straight black shoulder-length',
  'short wavy light brown',
];

const EYES = ['warm brown', 'dark brown', 'hazel', 'deep brown'];

const SKIN = ['light olive', 'warm olive', 'medium olive', 'fair warm'];

const CLOTHING = [
  'a soft mustard jumper and navy trousers',
  'a red hoodie and blue jeans',
  'a teal jumper and grey trousers',
  'a cream knitted cardigan and dark blue trousers',
  'a striped green shirt and brown shorts',
];

const SPECIES_BY_HERO_TYPE: Record<HeroType, string> = {
  CHILD: 'child',
  ANIMAL: 'small friendly animal',
  FANTASY: 'gentle fantasy creature',
  ROBOT: 'small rounded friendly robot',
  CUSTOM: 'child',
};

const STYLE_NOTES: Record<IllustrationStyle, string> = {
  watercolor: 'Soft edges and visible brush texture; avoid hard outlines.',
  soft3d: 'Rounded volumes with soft rim light; avoid glossy plastic surfaces.',
  classic_storybook: 'Flat textured shapes with a limited palette; slight print grain.',
  pastel: 'Powdery blended edges and a light airy palette.',
  hand_drawn: 'Visible pencil strokes with slightly imperfect linework.',
};

export interface CharacterBibleInput {
  heroName: string;
  heroType: HeroType;
  childAgeInYears: number | null;
  style: IllustrationStyle;
  /** A Turkish palette hint from the child's preferences, when set. */
  favouriteColour?: string | undefined;
}

/**
 * Builds the character description reused on every page.
 *
 * Derived deterministically from the hero's name so a family reopening the same
 * story months later sees the same child, and so regenerating one page cannot
 * quietly produce a different-looking hero than the ones around it.
 *
 * The appearance is intentionally generic rather than derived from a photo of
 * the real child: the product never sends a child's likeness to an image model.
 */
export function buildCharacterBible(input: CharacterBibleInput): CharacterBible {
  const seed = hashSeed(input.heroName.toLocaleLowerCase('tr-TR'));
  const pick = <T>(items: readonly T[], offset: number): T =>
    items[(seed + offset) % items.length] as T;

  const palette = ['soft cream', 'warm lavender', 'muted coral'];
  if (input.favouriteColour) {
    palette.unshift(input.favouriteColour);
  }

  return {
    name: input.heroName,
    ageInYears: input.childAgeInYears,
    species: SPECIES_BY_HERO_TYPE[input.heroType],
    hair: input.heroType === 'CHILD' || input.heroType === 'CUSTOM' ? pick(HAIR, 1) : '',
    eyes: pick(EYES, 2),
    skinTone: input.heroType === 'CHILD' || input.heroType === 'CUSTOM' ? pick(SKIN, 3) : '',
    clothing: pick(CLOTHING, 4),
    distinguishingFeatures: [
      'a warm open expression',
      'a small round face with soft features',
    ],
    colourPalette: palette,
    styleNotes: STYLE_NOTES[input.style],
  };
}
