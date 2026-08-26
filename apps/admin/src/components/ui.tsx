import type { CSSProperties, ReactNode } from 'react';

/**
 * The console's small vocabulary of surfaces.
 *
 * Deliberately plain: this is an internal tool used all day by a handful of
 * people, so it optimises for scanning a table and reading a status, not for
 * looking impressive. Everything draws its colour from the CSS custom
 * properties set on the root, which come from the same tokens the app uses.
 */

export function Card({
  children,
  style,
  padding = 20,
}: {
  children: ReactNode;
  style?: CSSProperties;
  padding?: number;
}) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header style={{ marginBottom: 24 }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{title}</h1>
      {description ? (
        <p style={{ margin: '6px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
          {description}
        </p>
      ) : null}
    </header>
  );
}

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const BADGE_TONES: Record<BadgeTone, { background: string; color: string }> = {
  neutral: { background: 'var(--muted)', color: 'var(--muted-foreground)' },
  primary: { background: 'var(--secondary)', color: 'var(--secondary-foreground)' },
  success: { background: 'var(--success)', color: '#FFFFFF' },
  warning: { background: 'var(--warning)', color: '#2C2825' },
  danger: { background: 'var(--destructive)', color: 'var(--destructive-foreground)' },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  return (
    <span
      style={{
        ...BADGE_TONES[tone],
        display: 'inline-block',
        padding: '3px 9px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/**
 * A number worth watching.
 *
 * `hint` carries what the number actually counts, because a bare "12" on a
 * dashboard invites everyone to invent their own definition of it.
 */
export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'danger' | 'warning';
}) {
  return (
    <Card
      style={{
        flex: '1 1 190px',
        minWidth: 190,
        // Warning is carried by an edge rather than by the number's colour: the
        // token is an amber meant for backgrounds behind dark text, and at
        // 2.2:1 against a card it is below the large-text contrast floor. The
        // digit stays readable and the tile still reads as needing attention.
        ...(tone ? { borderInlineStartWidth: 4, borderInlineStartStyle: 'solid' } : {}),
        ...(tone === 'warning' ? { borderInlineStartColor: 'var(--warning)' } : {}),
        ...(tone === 'danger' ? { borderInlineStartColor: 'var(--destructive)' } : {}),
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--muted-foreground)', fontWeight: 600 }}>{label}</div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          marginTop: 6,
          // Destructive clears 3:1 against a card at this size; warning does not.
          color: tone === 'danger' ? 'var(--destructive)' : 'var(--foreground)',
        }}
      >
        {value}
      </div>
      {hint ? (
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>{hint}</div>
      ) : null}
    </Card>
  );
}

/**
 * An empty result, said plainly.
 *
 * A queue with nothing in it is usually good news in this console, so it reads
 * as a statement rather than an apology.
 */
export function Empty({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: '48px 20px',
        textAlign: 'center',
        color: 'var(--muted-foreground)',
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}

export function DataTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <Card padding={0}>
      <div className="table-scroll">
        <table>
          <thead>{head}</thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </Card>
  );
}
