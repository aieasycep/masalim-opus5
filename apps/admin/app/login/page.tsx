'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '../../src/components/ui';

const FALLBACK_MESSAGE = 'Sunucuya ulaşılamıyor.';

const MESSAGES: Readonly<Record<string, string>> = {
  INVALID_CREDENTIALS: 'E-posta veya parola hatalı.',
  RATE_LIMITED: 'Çok fazla deneme yapıldı. Bir süre sonra tekrar deneyin.',
  UNAVAILABLE: FALLBACK_MESSAGE,
};

/** Any code the console does not recognise still has to say something useful. */
function messageFor(code: string | undefined): string {
  return (code ? MESSAGES[code] : undefined) ?? FALLBACK_MESSAGE;
}

/**
 * The console's front door.
 *
 * One of the two client components in the app — it needs local state for the
 * form. Everything behind it renders on the server, so the operator's token
 * never reaches the browser as anything but a cookie it cannot read.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(messageFor(payload?.error));
        return;
      }

      router.replace('/');
      router.refresh();
    } catch {
      setError(FALLBACK_MESSAGE);
    } finally {
      setPending(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <Card style={{ width: '100%', maxWidth: 380 }} padding={28}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Masalım Konsol</h1>
        <p style={{ margin: '6px 0 22px', color: 'var(--muted-foreground)', fontSize: 14 }}>
          Devam etmek için operatör hesabınla giriş yap.
        </p>

        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
            E-posta
            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              required
              autoComplete="username"
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
            Parola
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              required
              autoComplete="current-password"
              style={inputStyle}
            />
          </label>

          {error ? (
            <p
              role="alert"
              style={{ margin: 0, color: 'var(--destructive)', fontSize: 13, fontWeight: 500 }}
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            style={{
              marginTop: 4,
              padding: '11px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              fontWeight: 600,
              cursor: pending ? 'default' : 'pointer',
              opacity: pending ? 0.7 : 1,
            }}
          >
            {pending ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
        </form>
      </Card>
    </main>
  );
}

const inputStyle = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--background)',
  fontWeight: 400,
} as const;
