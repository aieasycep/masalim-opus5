import type { ReactNode } from 'react';

/**
 * A band of related numbers under one heading.
 *
 * The grouping is the point: "bugün" figures and "şu an" figures sit in
 * separate bands with the period stated in the heading, because they are
 * counted over different windows and mixing them in one flat row is how an
 * operator ends up reading a standing queue depth as a daily total.
 */
export function StatGroup({
  title,
  period,
  children,
}: {
  title: string;
  period: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2
        style={{
          margin: '0 0 10px',
          fontSize: 14,
          fontWeight: 700,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        {title}
        <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--muted-foreground)' }}>
          {period}
        </span>
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>{children}</div>
    </section>
  );
}
