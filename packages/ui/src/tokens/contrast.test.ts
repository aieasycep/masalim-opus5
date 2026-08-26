import { describe, expect, it } from 'vitest';
import { lightColors, nightColors, type ThemeColors } from './colors';
import { fontSizes, textVariants } from './typography';
import { MIN_TOUCH_TARGET, spacing } from './layout';

/** Relative luminance per WCAG 2.1. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

const WCAG_AA_NORMAL = 4.5;
const WCAG_AA_LARGE = 3;

/** WCAG 2.1 large text: 18pt regular, or 14pt and bold. */
function isLargeText(fontSize: number, fontFamily: string | undefined): boolean {
  const bold = Boolean(fontFamily && /Bold/.test(fontFamily));
  return fontSize >= 18 || (bold && fontSize >= 14);
}

function requiredRatioForButtonLabel(): number {
  const { fontSize, fontFamily } = textVariants.button;
  return isLargeText(fontSize ?? 0, fontFamily) ? WCAG_AA_LARGE : WCAG_AA_NORMAL;
}

/**
 * Accessibility is a stated requirement in the design brief, and this app is
 * used in a dark room by a tired adult. Contrast is asserted rather than
 * eyeballed so a future palette tweak cannot quietly regress it.
 */
describe('colour contrast', () => {
  const themes: Array<[string, ThemeColors]> = [
    ['light', lightColors],
    ['night', nightColors],
  ];

  describe.each(themes)('%s theme', (_name, colors) => {
    it('body text on the background meets WCAG AA (4.5:1)', () => {
      expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5);
    });

    it('body text on a card meets WCAG AA', () => {
      expect(contrastRatio(colors.cardForeground, colors.card)).toBeGreaterThanOrEqual(4.5);
    });

    /**
     * Button labels are 17pt ExtraBold, which WCAG 2.1 classifies as large text
     * (≥14pt bold), where the AA threshold is 3:1 rather than 4.5:1.
     *
     * The threshold is derived from the actual type tokens rather than
     * hard-coded, so shrinking the button label below the large-text boundary
     * fails this test and forces the fill colour to be darkened instead of
     * quietly shipping unreadable text.
     */
    it('primary button label meets the AA threshold for its own type size', () => {
      expect(contrastRatio(colors.primaryForeground, colors.primary)).toBeGreaterThanOrEqual(
        requiredRatioForButtonLabel(),
      );
    });

    it('destructive button label meets the AA threshold for its own type size', () => {
      expect(
        contrastRatio(colors.destructiveForeground, colors.destructive),
      ).toBeGreaterThanOrEqual(requiredRatioForButtonLabel());
    });

    it('muted secondary text meets at least WCAG AA for large text (3:1)', () => {
      // Muted text is used for metadata such as "6 dk · Anne'nin sesi", which is
      // supporting information rather than the primary reading path.
      expect(contrastRatio(colors.mutedForeground, colors.background)).toBeGreaterThanOrEqual(
        3,
      );
    });
  });

  it('classifies the button label as WCAG large text, which is why 3:1 applies', () => {
    expect(requiredRatioForButtonLabel()).toBe(WCAG_AA_LARGE);
    expect(textVariants.button.fontSize).toBeGreaterThanOrEqual(14);
    expect(textVariants.button.fontFamily).toMatch(/Bold/);
  });

  it('night background is genuinely darker than the light one', () => {
    expect(luminance(nightColors.background)).toBeLessThan(
      luminance(lightColors.background),
    );
  });
});

describe('layout tokens', () => {
  it('keeps the accessibility touch-target floor at 44pt', () => {
    expect(MIN_TOUCH_TARGET).toBe(44);
  });

  it('uses an 8pt grid for the main steps', () => {
    for (const step of [spacing.sm, spacing.base, spacing.xl, spacing.xxl, spacing.xxxl]) {
      expect(step % 8).toBe(0);
    }
  });
});

describe('typography tokens', () => {
  it('never uses a font size below the readable floor', () => {
    // 10pt is reserved for uppercase badges; nothing may go smaller.
    for (const size of Object.values(fontSizes)) {
      expect(size).toBeGreaterThanOrEqual(10);
    }
  });

  it('resolves every line height to absolute pixels', () => {
    // React Native does not accept a unitless multiplier; a value below ~4
    // would mean a raw ratio slipped through.
    for (const [name, variant] of Object.entries(textVariants)) {
      expect(variant.lineHeight, `${name} lineHeight`).toBeGreaterThan(10);
      expect(variant.fontFamily, `${name} fontFamily`).toBeTruthy();
    }
  });

  it('gives story prose the most generous line height', () => {
    const story = textVariants.bodyStory.lineHeight ?? 0;
    const body = textVariants.body.lineHeight ?? 0;
    expect(story).toBeGreaterThan(body);
  });
});
