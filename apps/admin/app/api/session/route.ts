import { NextResponse } from 'next/server';
import { adminLoginSchema } from '@masalim/validation';
import type { AdminSessionDto } from '@masalim/types';
import { AdminApiError, adminApiPublic } from '../../../src/lib/api';
import { clearSessionToken, writeSessionToken } from '../../../src/lib/session';

/**
 * Sign-in, terminated on this origin.
 *
 * The browser posts credentials here and gets back a cookie; the bearer token
 * itself is never sent to the client. That is the whole reason this handler
 * exists rather than the login form calling the API directly — a token in
 * JavaScript's reach is a token an injected script can take, and this one opens
 * a console that can read a family's address.
 *
 * The failure message is deliberately the same whether the address is unknown
 * or the password is wrong: the API already refuses to distinguish them, and
 * repeating that here keeps the console from becoming an account oracle.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = adminLoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 400 });
  }

  try {
    const session = await adminApiPublic<AdminSessionDto>('admin/auth/login', parsed.data);
    await writeSessionToken(session.accessToken, session.expiresIn);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminApiError) {
      // Rate limiting is worth distinguishing: it is the one failure where
      // trying again immediately is guaranteed not to work.
      const code = error.status === 429 ? 'RATE_LIMITED' : 'INVALID_CREDENTIALS';
      return NextResponse.json({ error: code }, { status: error.status === 429 ? 429 : 401 });
    }
    return NextResponse.json({ error: 'UNAVAILABLE' }, { status: 503 });
  }
}

/** Sign-out. The API denylists the session id; the cookie goes either way. */
export async function DELETE(): Promise<NextResponse> {
  const { adminApi } = await import('../../../src/lib/api');
  await adminApi('admin/auth/logout', { method: 'POST' }).catch(() => undefined);
  await clearSessionToken();
  return NextResponse.json({ ok: true });
}
