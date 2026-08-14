import type { CharacterBible, IllustrationStyle } from '@masalim/types';

/**
 * Illustration styles.
 *
 * These live entirely on the server. The client sends a style key and never a
 * raw prompt, so a crafted request cannot steer the image model somewhere a
 * children's book should not go (master prompt §26).
 */
const STYLE_TEMPLATES: Record<IllustrationStyle, string> = {
  watercolor:
    'Soft watercolour children\'s book illustration. Gentle washes, visible paper texture, warm muted palette, delicate ink linework. Dreamy and calm.',
  soft3d:
    'Soft 3D rendered children\'s illustration. Rounded friendly shapes, subsurface-scattered soft lighting, pastel palette, shallow depth of field. Cosy, not plastic or toy-like.',
  classic_storybook:
    'Classic mid-century storybook illustration. Textured gouache, limited warm palette, confident simple shapes, slight print grain. Timeless and hand-made.',
  pastel:
    'Soft pastel chalk illustration. Powdery texture, gentle blended edges, airy light palette, minimal detail. Quiet and soothing.',
  hand_drawn:
    'Hand-drawn coloured pencil illustration. Visible pencil strokes, slightly imperfect linework, warm natural palette, cream paper. Intimate and personal.',
};

/**
 * Shared rules appended to every illustration prompt.
 *
 * The negative constraints matter more than the positive ones here: these
 * pictures are for young children and end up printed in a physical book.
 */
const UNIVERSAL_RULES = [
  'Children\'s picture book illustration for ages 0-12.',
  'No text, no letters, no numbers, no watermarks, no signatures anywhere in the image.',
  'No frightening imagery, no weapons, no blood, no injury, no darkness that reads as menacing.',
  'Full-bleed composition with the subject comfortably inside the frame.',
  'Warm, safe, and inviting atmosphere.',
].join(' ');

/** Turns the character bible into a stable physical description. */
export function describeCharacter(bible: CharacterBible): string {
  const parts = [
    bible.ageInYears !== null ? `about ${bible.ageInYears} years old` : null,
    bible.species && bible.species !== 'child' ? bible.species : 'a child',
    bible.hair ? `${bible.hair} hair` : null,
    bible.eyes ? `${bible.eyes} eyes` : null,
    bible.skinTone ? `${bible.skinTone} skin` : null,
    bible.clothing ? `wearing ${bible.clothing}` : null,
    ...bible.distinguishingFeatures,
  ].filter((part): part is string => Boolean(part));

  return `THE MAIN CHARACTER (must look identical in every image): ${parts.join(', ')}.`;
}

/**
 * Assembles the final prompt for one page.
 *
 * The character description is repeated verbatim on every page — that
 * repetition, plus the reference image, is what keeps the hero the same person
 * from the cover to the last page.
 */
export function buildStylePrompt(
  style: IllustrationStyle,
  scenePrompt: string,
  bible: CharacterBible,
): string {
  return [
    STYLE_TEMPLATES[style],
    UNIVERSAL_RULES,
    describeCharacter(bible),
    bible.colourPalette.length > 0
      ? `Colour palette: ${bible.colourPalette.join(', ')}.`
      : '',
    bible.styleNotes,
    '',
    `SCENE: ${scenePrompt}`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export function styleTemplateFor(style: IllustrationStyle): string {
  return STYLE_TEMPLATES[style];
}
