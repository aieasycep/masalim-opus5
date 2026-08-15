/**
 * The few inline styles both user pages share.
 *
 * Kept together so the lookup and the detail view cannot drift into looking
 * like two different tools; all colour still comes from the CSS custom
 * properties the console sets, never from a literal.
 */

export const sectionTitleStyle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
} as const;

export const sectionNoteStyle = {
  margin: '6px 0 0',
  fontSize: 13,
  color: 'var(--muted-foreground)',
} as const;

export const linkButtonStyle = {
  display: 'inline-block',
  padding: '7px 14px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  fontSize: 13,
  fontWeight: 600,
} as const;

export const monoStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  wordBreak: 'break-all',
} as const;

export const metaListStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 14,
  margin: '18px 0 0',
} as const;
