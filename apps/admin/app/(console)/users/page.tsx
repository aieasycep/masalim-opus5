import Link from 'next/link';
import { ADMIN_USER_SEARCH_MIN_LENGTH } from '@masalim/validation';
import type { AdminUserSummaryDto, Paginated } from '@masalim/types';
import { AdminApiError, adminApi } from '../../../src/lib/api';
import { Badge, Card, DataTable, Empty, PageHeader } from '../../../src/components/ui';
import { SearchForm } from './search-form';
import {
  firstParam,
  formatDate,
  formatDateTime,
  localeLabel,
  subscriptionStatusLabel,
  subscriptionStatusTone,
  subscriptionTierLabel,
} from './format';
import { linkButtonStyle, monoStyle } from './styles';

/**
 * Account lookup.
 *
 * This page is one half of a support conversation, not a directory. The API
 * matches an email address or an account id and nothing else, and it refuses a
 * query shorter than a few characters — both on purpose, so the console can
 * never be used to page through the families using the service. The page holds
 * the same line: it opens empty, asks for an identifier, and makes no request
 * until someone actually has one to type.
 *
 * The rows carry counts and statuses only. A child's name is not here because
 * it is not in the DTO, and answering "how many stories do they have" never
 * required knowing whose stories they are.
 */

/** One screenful; the API caps a page at 50. */
const PAGE_SIZE = 25;

export default async function UserSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawQuery = firstParam(params.q) ?? '';
  const query = rawQuery.trim();
  const includeDeleted = firstParam(params.includeDeleted) === 'true';
  const cursor = firstParam(params.cursor);

  const tooShort = query.length > 0 && query.length < ADMIN_USER_SEARCH_MIN_LENGTH;
  const shouldSearch = query.length >= ADMIN_USER_SEARCH_MIN_LENGTH;

  return (
    <>
      <PageHeader
        title="Kullanıcılar"
        description="Telefondaki ya da e-postadaki aileyi bulmak için. Burası bir aile listesi değil: arama kutusuna bir e-posta adresi veya hesap kimliği yazılmadan hiçbir kayıt getirilmez."
      />

      <SearchForm query={rawQuery} includeDeleted={includeDeleted} />

      {tooShort ? (
        <Card>
          <p role="alert" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            Arama için en az {ADMIN_USER_SEARCH_MIN_LENGTH} karakter gerekiyor.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
            Bu sınır bilerek konuldu: daha kısa bir metin, tek bir aileyi bulmak yerine listeyi
            gezmek anlamına gelirdi.
          </p>
        </Card>
      ) : !shouldSearch ? (
        <Card>
          <Empty message="Aramaya başlamak için ailenin e-posta adresini veya hesap kimliğini yazın. Bu sayfa kendiliğinden kimseyi listelemez." />
        </Card>
      ) : (
        <SearchResults query={query} includeDeleted={includeDeleted} cursor={cursor} />
      )}
    </>
  );
}

async function SearchResults({
  query,
  includeDeleted,
  cursor,
}: {
  query: string;
  includeDeleted: boolean;
  cursor: string | undefined;
}) {
  const search = new URLSearchParams({
    query,
    limit: String(PAGE_SIZE),
    includeDeleted: includeDeleted ? 'true' : 'false',
  });
  if (cursor) search.set('cursor', cursor);

  let page: Paginated<AdminUserSummaryDto>;
  try {
    page = await adminApi<Paginated<AdminUserSummaryDto>>(`admin/users?${search.toString()}`);
  } catch (error) {
    if (error instanceof AdminApiError) {
      return (
        <Card>
          <p role="alert" style={{ margin: 0, fontWeight: 600, color: 'var(--destructive)' }}>
            {error.status === 403
              ? 'Hesap araması yapma yetkiniz yok. Bu bölüm ADMIN ve SUPPORT rollerine açıktır.'
              : 'Arama yapılamadı.'}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
            Sunucunun yanıtı: {error.code} — {error.message}
          </p>
        </Card>
      );
    }
    throw error;
  }

  if (page.items.length === 0) {
    return (
      <Card>
        <Empty
          message={
            cursor
              ? 'Bu sayfada başka kayıt yok. Aramanın başına dönebilirsiniz.'
              : includeDeleted
                ? `“${query}” ile eşleşen bir hesap yok. Adresin yazımını ailenin size söylediği gibi kontrol edin.`
                : `“${query}” ile eşleşen etkin bir hesap yok. Aile hesabını silme talebi verdiyse “silinmiş hesapları da göster” kutusunu işaretleyip tekrar deneyin.`
          }
        />
        {cursor ? (
          <div style={{ textAlign: 'center', paddingBottom: 12 }}>
            <Link href={hrefFor({ query, includeDeleted })} style={linkButtonStyle}>
              Aramanın başına dön
            </Link>
          </div>
        ) : null}
      </Card>
    );
  }

  return (
    <>
      <p
        role="status"
        style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted-foreground)' }}
      >
        “{query}” için {page.items.length} hesap bulundu
        {page.nextCursor ? ' (devamı var)' : ''}.
      </p>

      <DataTable
        head={
          <tr>
            <th scope="col">Hesap</th>
            <th scope="col">Abonelik</th>
            <th scope="col">Çocuk</th>
            <th scope="col">Masal</th>
            <th scope="col">Sipariş</th>
            <th scope="col">Kayıt</th>
            <th scope="col">Son görülme</th>
            <th scope="col">İşlem</th>
          </tr>
        }
      >
        {page.items.map((user) => {
          const deleted = user.deletedAt !== null;
          return (
            <tr key={user.id} style={deleted ? { background: 'var(--muted)' } : undefined}>
              <th scope="row" style={{ fontWeight: 500, color: 'var(--foreground)' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={
                      deleted
                        ? { textDecoration: 'line-through', color: 'var(--muted-foreground)' }
                        : undefined
                    }
                  >
                    {user.email}
                  </span>
                  {deleted ? <Badge label="Hesap silindi" tone="danger" /> : null}
                </div>
                <div style={{ ...monoStyle, color: 'var(--muted-foreground)', marginTop: 2 }}>
                  {user.id}
                </div>
                {deleted && user.deletedAt ? (
                  <div style={{ fontSize: 12, color: 'var(--destructive)', marginTop: 2 }}>
                    Silinme: {formatDateTime(user.deletedAt)}
                  </div>
                ) : null}
              </th>
              <td>
                <Badge
                  label={subscriptionStatusLabel(user.subscriptionStatus)}
                  tone={subscriptionStatusTone(user.subscriptionStatus)}
                />
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
                  {subscriptionTierLabel(user.subscriptionTier)} · {localeLabel(user.locale)}
                </div>
              </td>
              <td style={{ fontVariantNumeric: 'tabular-nums' }}>{user.childCount}</td>
              <td style={{ fontVariantNumeric: 'tabular-nums' }}>{user.storyCount}</td>
              <td style={{ fontVariantNumeric: 'tabular-nums' }}>{user.orderCount}</td>
              <td style={{ fontSize: 13 }}>{formatDate(user.createdAt)}</td>
              <td style={{ fontSize: 13 }}>
                {user.lastSeenAt ? (
                  formatDateTime(user.lastSeenAt)
                ) : (
                  <span style={{ color: 'var(--muted-foreground)' }}>Hiç girmemiş</span>
                )}
              </td>
              <td>
                <Link
                  href={`/users/${user.id}`}
                  style={linkButtonStyle}
                  aria-label={`${user.email} hesabını aç`}
                >
                  Aç
                </Link>
              </td>
            </tr>
          );
        })}
      </DataTable>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginTop: 16,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
          Bir hesabı açmak denetim kaydına yazılır.
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          {cursor ? (
            <Link href={hrefFor({ query, includeDeleted })} style={linkButtonStyle}>
              Aramanın başı
            </Link>
          ) : null}
          {page.nextCursor ? (
            <Link
              href={hrefFor({ query, includeDeleted, cursor: page.nextCursor })}
              style={linkButtonStyle}
            >
              Sonraki sayfa
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}

function hrefFor(params: {
  query: string;
  includeDeleted: boolean;
  cursor?: string | undefined;
}): string {
  const search = new URLSearchParams({ q: params.query });
  if (params.includeDeleted) search.set('includeDeleted', 'true');
  if (params.cursor) search.set('cursor', params.cursor);
  return `/users?${search.toString()}`;
}
