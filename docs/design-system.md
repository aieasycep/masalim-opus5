# The design system

`packages/ui` holds the tokens and the components both apps draw on. It is a React
Native package — the mobile app consumes all of it, the Next.js console consumes only
the colour tokens through the `@masalim/ui/tokens/colors` subpath, which is
platform-neutral.

## One rule about colour

**No file outside `packages/ui/src/tokens/colors.ts` may contain a hex literal.**

That is the rule the whole system rests on. It is why the operator console looks like
part of the product without anyone copying values between projects: `apps/admin`
generates its CSS custom properties from the same token file at build time
(`apps/admin/src/lib/theme.ts`).

Two themes, `lightColors` and `nightColors`, both satisfying the `ThemeColors`
interface. The interface declares `string` rather than inferring from one palette,
because literal hex types from two themes intersect to `never` and would make
`theme.colors.primary` unusable.

Night mode exists because a parent reads in a dark room with a child falling asleep.
The console does not offer it — an operator at a desk does not need one, and a
half-tested second theme is maintenance without a reader.

### Contrast is tested, not asserted

`packages/ui/src/tokens/contrast.test.ts` computes real WCAG ratios for both themes:
body text on background and on card, primary and destructive button labels at their own
type sizes, and muted secondary text against the large-text threshold. A palette change
that breaks contrast fails the build rather than shipping.

## Type

`typography.ts` defines families, sizes, line heights, letter spacing, and a
`textVariants` map covering `hero` through `caption`. `Text` takes a `variant` rather
than loose style props, so a heading is a heading everywhere.

`bodyStory` is its own variant: story text is read aloud at bedtime, often in low light,
and it earns a larger size and looser line height than ordinary body copy.

## Space and shape

`layout.ts` carries `spacing`, `radius`, `shadows`, `durations`, and two constants worth
knowing:

- `MIN_TOUCH_TARGET = 44` — every interactive element meets it. A parent taps this app
  one-handed in the dark.
- `SCREEN_PADDING` and `SECTION_GAP` derive from the spacing scale, so screens agree
  about their margins without each one deciding.

`DESIGN_WIDTH = 390` is the width the Figma export was drawn at, used where something
genuinely has to scale proportionally rather than reflow.

## Components

20 modules in `packages/ui/src/components/`:

| | |
| --- | --- |
| Layout | `Screen`, `ScreenHeader`, `Card` |
| Text and identity | `Text`, `Avatar`, `Icon` |
| Actions | `Button`, `IconButton`, `Chip`, `OptionCard`, `SegmentedControl` |
| Input | `Input`, `ListItem` |
| Overlay | `BottomSheet`, `ConfirmDialog`, `Toast` |
| Progress and marks | `StepIndicator`, `feedback` (ProgressBar, Skeleton, Badge, Divider) |
| Status | `states` (LoadingState, ErrorState, EmptyState, OfflineBanner) |
| Domain | `StoryCard` |

`Screen` is the only scrolling container a screen should use; it handles safe areas,
keyboard avoidance and the `footerHeight` reserved for a fixed CTA. A raw `ScrollView`
in a screen is a bug.

`states` exists so that loading, failure and emptiness are designed rather than
improvised per screen — and so that an `ErrorState` always offers a retry.

## Conventions that keep it coherent

- Components take semantic props (`tone="muted"`, `variant="title"`), never raw colours
  or sizes. A caller that needs a colour is a signal the component is missing a variant.
- Styles live in a `StyleSheet.create({...})` at the bottom of the file.
- Anything whose purpose is not its visible text carries an `accessibilityLabel`;
  anything that updates after an action carries `accessibilityLiveRegion="polite"`.
- Theme is read through `useTheme()`, never imported directly, so a component works in
  both palettes without knowing which one it is in.

## Adding to it

A component belongs here once a second screen needs it. Until then it belongs beside the
screen that uses it — `apps/mobile/src/components/` holds the ones that have not earned
promotion, such as `SaveIndicator`, which three screens now share and which would be a
reasonable candidate to move if a fourth appears.
