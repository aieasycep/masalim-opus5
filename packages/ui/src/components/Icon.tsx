import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../theme/ThemeProvider';

/**
 * The icon vocabulary.
 *
 * A closed set mapped onto Feather, rather than letting screens reach for any of
 * the thousand icons a set ships with. Feather's thin, rounded line work is the
 * closest match to the Figma export, and constraining the names here is what
 * stops the same idea being drawn three different ways across fifty screens.
 */
export const ICONS = {
  back: 'chevron-left',
  forward: 'chevron-right',
  up: 'chevron-up',
  down: 'chevron-down',
  close: 'x',
  check: 'check',
  plus: 'plus',
  minus: 'minus',
  home: 'home',
  library: 'book-open',
  create: 'feather',
  profile: 'user',
  play: 'play',
  pause: 'pause',
  skipBack: 'rotate-ccw',
  skipForward: 'rotate-cw',
  microphone: 'mic',
  stop: 'square',
  volume: 'volume-2',
  moon: 'moon',
  heart: 'heart',
  book: 'book',
  image: 'image',
  edit: 'edit-2',
  trash: 'trash-2',
  share: 'share-2',
  download: 'download',
  settings: 'settings',
  bell: 'bell',
  lock: 'lock',
  info: 'info',
  alert: 'alert-circle',
  warning: 'alert-triangle',
  search: 'search',
  filter: 'sliders',
  refresh: 'refresh-cw',
  clock: 'clock',
  calendar: 'calendar',
  truck: 'truck',
  creditCard: 'credit-card',
  mapPin: 'map-pin',
  star: 'star',
  sparkle: 'zap',
  offline: 'wifi-off',
  mail: 'mail',
  eye: 'eye',
  eyeOff: 'eye-off',
  logOut: 'log-out',
  chevronsRight: 'chevrons-right',
  moreHorizontal: 'more-horizontal',
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number | undefined;
  /** Any theme colour; defaults to the current foreground. */
  color?: string | undefined;
  testID?: string | undefined;
}

export function Icon({ name, size = 20, color, testID }: IconProps) {
  const theme = useTheme();
  return (
    <Feather
      name={ICONS[name]}
      size={size}
      color={color ?? theme.colors.foreground}
      testID={testID}
      // Icons are decorative: every control that uses one carries its own
      // accessible label, and announcing "chevron-left" as well would be noise.
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
