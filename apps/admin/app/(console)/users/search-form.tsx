import { ADMIN_USER_SEARCH_MIN_LENGTH } from '@masalim/validation';
import { Card } from '../../../src/components/ui';

/**
 * The lookup box.
 *
 * A plain GET form on purpose: the query belongs in the URL so an operator can
 * keep the tab open through a phone call, share it with a colleague, or come
 * back to it — and so the page stays a server component with no admin token
 * anywhere near the browser.
 *
 * The minimum length is the API's own constant, not a number copied here, and
 * the hint says out loud what the box matches so nobody wastes a call typing a
 * child's name into it.
 */
export function SearchForm({ query, includeDeleted }: { query: string; includeDeleted: boolean }) {
  return (
    <Card style={{ marginBottom: 20 }}>
      <form method="get" action="/users" role="search">
        <label htmlFor="user-search" style={{ fontSize: 13, fontWeight: 600 }}>
          E-posta adresi ya da hesap kimliği
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <input
            id="user-search"
            name="q"
            type="search"
            defaultValue={query}
            autoFocus
            placeholder="ornek@eposta.com"
            aria-describedby="user-search-hint"
            style={{
              flex: '1 1 320px',
              minWidth: 220,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--background)',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              border: '1px solid var(--primary)',
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Ara
          </button>
        </div>

        <p
          id="user-search-hint"
          style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}
        >
          Arama yalnızca e-posta adresinde ve hesap kimliğinde çalışır; en az{' '}
          {ADMIN_USER_SEARCH_MIN_LENGTH} karakter yazın. Çocuk adı, sipariş numarası ya da telefon
          numarası ile arama yapılamaz — aileyi bulmak için elinizde e-postası veya kimliği olmalı.
        </p>

        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 12,
            fontSize: 13,
          }}
        >
          <input
            type="checkbox"
            name="includeDeleted"
            value="true"
            defaultChecked={includeDeleted}
          />
          Silinmiş hesapları da göster
        </label>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
          Hesabı silinmekte olan bir aile aradığında bu kutu işaretli olmalı; aksi halde kayıt hiç
          bulunamaz.
        </p>
      </form>
    </Card>
  );
}
