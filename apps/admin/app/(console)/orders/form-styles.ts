import type { CSSProperties } from 'react';

/**
 * The few form styles the two fulfilment forms share.
 *
 * Plain objects rather than a component, because the forms differ enough in
 * layout that wrapping them in one abstraction would cost more than it saves.
 * Colours come from the CSS custom properties the console already sets.
 */

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

export function primaryButtonStyle(pending: boolean, tone: 'primary' | 'danger'): CSSProperties {
  return {
    padding: '10px 16px',
    borderRadius: 10,
    border: 'none',
    background: tone === 'danger' ? 'var(--destructive)' : 'var(--primary)',
    color: tone === 'danger' ? 'var(--destructive-foreground)' : 'var(--primary-foreground)',
    fontWeight: 600,
    fontSize: 14,
    cursor: pending ? 'default' : 'pointer',
    opacity: pending ? 0.7 : 1,
  };
}
