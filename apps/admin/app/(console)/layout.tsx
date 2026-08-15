import Link from 'next/link';
import type { AdminUserAccountDto } from '@masalim/types';
import { adminApi } from '../../src/lib/api';
import { SignOutButton } from '../../src/components/SignOutButton';

/**
 * The shell every authenticated page renders inside.
 *
 * Fetching the operator here does double duty: it draws the navigation, and
 * because `adminApi` redirects to /login on a 401, it is also what makes an
 * expired session land on the sign-in form instead of an empty console.
 *
 * Navigation is filtered by role, but that is a courtesy rather than a control
 * — the API refuses the routes regardless, and a link this shell forgot to hide
 * would still lead to a refusal rather than to data. Hiding them keeps an
 * operator from repeatedly finding doors that will not open for them.
 */
const LINKS: ReadonlyArray<{ href: string; label: string; roles: ReadonlyArray<string> }> = [
  { href: '/', label: 'Panel', roles: ['ADMIN', 'SUPPORT', 'OPERATIONS'] },
  { href: '/moderation', label: 'Moderasyon', roles: ['ADMIN', 'SUPPORT'] },
  { href: '/orders', label: 'Siparişler', roles: ['ADMIN', 'OPERATIONS'] },
  { href: '/users', label: 'Kullanıcılar', roles: ['ADMIN', 'SUPPORT'] },
  { href: '/feature-flags', label: 'Özellik Bayrakları', roles: ['ADMIN'] },
];

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await adminApi<AdminUserAccountDto>('admin/auth/me');
  const links = LINKS.filter((link) => link.roles.includes(admin.role));

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav
        aria-label="Konsol"
        style={{
          width: 232,
          flexShrink: 0,
          borderInlineEnd: '1px solid var(--border)',
          background: 'var(--card)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, padding: '0 10px 18px' }}>Masalım</div>

        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              padding: '9px 10px',
              borderRadius: 9,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {link.label}
          </Link>
        ))}

        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, padding: '0 10px' }}>{admin.name}</div>
          <div
            style={{ fontSize: 12, color: 'var(--muted-foreground)', padding: '2px 10px 12px' }}
          >
            {admin.role}
          </div>
          <SignOutButton />
        </div>
      </nav>

      <main style={{ flex: 1, padding: '32px 36px', minWidth: 0 }}>{children}</main>
    </div>
  );
}
