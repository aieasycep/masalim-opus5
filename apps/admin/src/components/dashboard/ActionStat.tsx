import Link from 'next/link';
import { Stat } from '../ui';

/**
 * A number that leads somewhere.
 *
 * Queue depths are the only figures on the panel an operator can do anything
 * about, so they are the only ones that are links: the whole tile is the target
 * rather than a small "view" affordance, and the accessible name says the count
 * and the destination together so it is not announced as a bare number.
 */
export function ActionStat({
  href,
  label,
  value,
  hint,
  action,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
  /** What the operator will be able to do on the other side of the link. */
  action: string;
  tone?: 'danger' | 'warning';
}) {
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. ${action}`}
      style={{
        display: 'flex',
        flex: '1 1 190px',
        minWidth: 190,
        borderRadius: 14,
      }}
    >
      <Stat label={label} value={value} hint={`${hint} — ${action} →`} {...(tone ? { tone } : {})} />
    </Link>
  );
}
