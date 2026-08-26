import type { CSSProperties } from 'react';

/**
 * The inline styles the flag list and its confirmation step share.
 *
 * Colour comes from the CSS custom properties the console already sets, never
 * from a literal, so this page cannot drift away from the rest of the panel.
 */

export const monoStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  wordBreak: 'break-all',
};

export const metaStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--muted-foreground)',
};

export const fieldLabelStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
};

export const inputStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--background)',
  fontWeight: 400,
  width: '100%',
};

export const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 400,
  color: 'var(--muted-foreground)',
};

export const fieldErrorStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--destructive)',
};

export function actionButtonStyle(tone: 'primary' | 'danger' | 'quiet', disabled: boolean): CSSProperties {
  const base: CSSProperties = {
    padding: '9px 16px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };

  if (tone === 'quiet') {
    return {
      ...base,
      border: '1px solid var(--border)',
      background: 'transparent',
      color: 'var(--foreground)',
    };
  }

  return {
    ...base,
    border: 'none',
    background: tone === 'danger' ? 'var(--destructive)' : 'var(--primary)',
    color: tone === 'danger' ? 'var(--destructive-foreground)' : 'var(--primary-foreground)',
  };
}
