import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { themes, type Theme, type ThemeMode } from './theme';

const ThemeContext = createContext<Theme>(themes.light);

export interface ThemeProviderProps {
  mode?: ThemeMode;
  children: ReactNode;
}

/**
 * Supplies the active theme.
 *
 * Screens that are night-first (player, generating, voice recording) wrap
 * themselves in `<ThemeProvider mode="night">` rather than reaching for dark
 * colours directly, so a component nested inside them picks up the right
 * palette without knowing where it is being rendered.
 */
export function ThemeProvider({ mode = 'light', children }: ThemeProviderProps) {
  const theme = useMemo(() => themes[mode], [mode]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** True when rendering inside a night-mode subtree. */
export function useIsNight(): boolean {
  return useTheme().mode === 'night';
}
