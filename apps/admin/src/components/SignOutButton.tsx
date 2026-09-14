'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Sign-out has to reach the API, not just drop the cookie — the token is denylisted there. */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void fetch('/api/session', { method: 'DELETE' }).finally(() => {
          router.replace('/login');
          router.refresh();
        });
      }}
      style={{
        width: '100%',
        padding: '8px 10px',
        borderRadius: 9,
        border: '1px solid var(--border)',
        background: 'transparent',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {pending ? 'Çıkılıyor…' : 'Çıkış yap'}
    </button>
  );
}
