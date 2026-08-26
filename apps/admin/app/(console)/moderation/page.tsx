import Link from 'next/link';
import type { AdminModerationRecordDto, Paginated } from '@masalim/types';
import { AdminApiError, adminApi } from '../../../src/lib/api';
import { Badge, Card, DataTable, Empty, PageHeader, Stat } from '../../../src/components/ui';
import {
  QUEUE_SUBJECT_FILTERS,
  QUEUE_VERDICT_FILTERS,
  asSubjectFilter,
  asVerdictFilter,
  categoryLabel,
  firstParam,
  formatDateTime,
  formatScore,
  formatWaiting,
  isOverdue,
  stageLabel,
  subjectTypeLabel,
  verdictLabel,
  verdictTone,
} from './format';

/**
 * The appeals queue.
 *
 * Everything in this list is a refusal: the classifier only ever writes
 * APPROVED or REJECTED, so what reaches a person is the set it turned down.
 * Each row is a parent who asked for a bedtime story and was told no by a
 * machine, and the row exists because nobody has checked that decision yet.
 *
 * The list deliberately carries no story text. Reading a family's story is a
 * separate, audited request that belongs to the moment a reviewer actually
 * needs it — deciding how long something has waited never requires it.
 */

/** One screenful; the API caps a page at 50. */
const PAGE_SIZE = 25;

const CATEGORY_PREVIEW_COUNT = 2;

export default async function ModerationQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const verdict = asVerdictFilter(firstParam(params.verdict));
  const subjectType = asSubjectFilter(firstParam(params.subjectType));
  const cursor = firstParam(params.cursor);
  const decidedOutcome = firstParam(params.sonuc);
  const decidedRecord = firstParam(params.kayit);

  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (verdict) query.set('verdict', verdict);
  if (subjectType) query.set('subjectType', subjectType);
  if (cursor) query.set('cursor', cursor);

  let page: Paginated<AdminModerationRecordDto>;
  try {
    page = await adminApi<Paginated<AdminModerationRecordDto>>(
      `admin/moderation/queue?${query.toString()}`,
    );
  } catch (error) {
    if (error instanceof AdminApiError) {
      return (
        <>
          <QueueHeader />
          <Card>
            <p role="alert" style={{ margin: 0, fontWeight: 600, color: 'var(--destructive)' }}>
              {error.status === 403
                ? 'Moderasyon kuyruğunu görme yetkiniz yok. Bu bölüm ADMIN ve SUPPORT rollerine açıktır.'
                : 'Kuyruk yüklenemedi.'}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
              Sunucunun yanıtı: {error.code} — {error.message}
            </p>
          </Card>
        </>
      );
    }
    throw error;
  }

  const now = Date.now();
  const oldest = page.items[0];
  const baseParams = { ...(verdict ? { verdict } : {}), ...(subjectType ? { subjectType } : {}) };

  return (
    <>
      <QueueHeader />

      {decidedOutcome === 'APPROVED' || decidedOutcome === 'REJECTED' ? (
        <Card
          style={{
            marginBottom: 20,
            borderColor: decidedOutcome === 'APPROVED' ? 'var(--success)' : 'var(--border)',
          }}
        >
          <p role="status" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            {decidedOutcome === 'APPROVED'
              ? 'Karar kaydedildi: masal serbest bırakıldı ve aileye geri döndü.'
              : 'Karar kaydedildi: ret onaylandı ve gerekçesi kayıt altına alındı.'}
          </p>
          {decidedRecord ? (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
              Kayıt: {decidedRecord}
            </p>
          ) : null}
        </Card>
      ) : null}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <Stat
          label="Bu sayfadaki kayıt"
          value={page.items.length}
          hint={page.nextCursor ? 'Devamı var' : 'Kuyruğun sonu'}
        />
        {oldest ? (
          <Stat
            label="Bu sayfadaki en uzun bekleyen"
            value={formatWaiting(oldest.createdAt, now)}
            hint={`Reddedildiği an: ${formatDateTime(oldest.createdAt)}`}
            {...(isOverdue(oldest.createdAt, now) ? { tone: 'warning' as const } : {})}
          />
        ) : null}
      </div>

      <Card style={{ marginBottom: 20 }} padding={16}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <FilterGroup
            legend="Sınıflandırıcının kararı"
            options={[
              { label: 'Hepsi', href: hrefFor({ ...baseParams, verdict: undefined }) },
              ...QUEUE_VERDICT_FILTERS.map((value) => ({
                label: verdictLabel(value),
                href: hrefFor({ ...baseParams, verdict: value }),
                active: verdict === value,
              })),
            ]}
            activeIndex={verdict ? undefined : 0}
          />
          <FilterGroup
            legend="Denetlenen içerik"
            options={[
              { label: 'Hepsi', href: hrefFor({ ...baseParams, subjectType: undefined }) },
              ...QUEUE_SUBJECT_FILTERS.map((value) => ({
                label: subjectTypeLabel(value),
                href: hrefFor({ ...baseParams, subjectType: value }),
                active: subjectType === value,
              })),
            ]}
            activeIndex={subjectType ? undefined : 0}
          />
        </div>
      </Card>

      {page.items.length === 0 ? (
        <Card>
          <Empty
            message={
              cursor
                ? 'Bu sayfada kayıt kalmadı. Kuyruğun başına dönebilirsiniz.'
                : verdict || subjectType
                  ? 'Bu filtreye uyan bekleyen kayıt yok.'
                  : 'Kuyrukta bekleyen kayıt yok. Makinenin reddettiği her masal bir insan tarafından görülmüş.'
            }
          />
          {cursor ? (
            <div style={{ textAlign: 'center', paddingBottom: 12 }}>
              <Link href={hrefFor(baseParams)} style={linkButtonStyle}>
                Kuyruğun başına dön
              </Link>
            </div>
          ) : null}
        </Card>
      ) : (
        <DataTable
          head={
            <tr>
              <th scope="col">Bekleme</th>
              <th scope="col">Denetlenen içerik</th>
              <th scope="col">Sınıflandırıcı</th>
              <th scope="col">Neden kodu</th>
              <th scope="col">En yüksek kategoriler</th>
              <th scope="col">İşlem</th>
            </tr>
          }
        >
          {page.items.map((record) => (
            <tr key={record.id}>
              <td>
                <div
                  style={{
                    fontWeight: 600,
                    color: isOverdue(record.createdAt, now)
                      ? 'var(--destructive)'
                      : 'var(--foreground)',
                  }}
                >
                  {formatWaiting(record.createdAt, now)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                  {formatDateTime(record.createdAt)}
                </div>
              </td>
              <td>
                <div style={{ fontWeight: 500 }}>{subjectTypeLabel(record.subjectType)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                  {stageLabel(record.stage)}
                </div>
              </td>
              <td>
                <Badge label={verdictLabel(record.verdict)} tone={verdictTone(record.verdict)} />
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
                  {record.provider}
                </div>
              </td>
              <td style={{ fontSize: 13 }}>
                {record.reasonCode ?? (
                  <span style={{ color: 'var(--muted-foreground)' }}>Kod yok</span>
                )}
              </td>
              <td style={{ fontSize: 13 }}>
                {record.topCategories.length === 0 ? (
                  <span style={{ color: 'var(--muted-foreground)' }}>Skor gelmemiş</span>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {record.topCategories.slice(0, CATEGORY_PREVIEW_COUNT).map((entry) => (
                      <li key={entry.category}>
                        {categoryLabel(entry.category)}{' '}
                        <span style={{ color: 'var(--muted-foreground)' }}>
                          {formatScore(entry.score)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td>
                <Link href={`/moderation/${record.id}`} style={linkButtonStyle}>
                  İncele
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {page.items.length > 0 ? (
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
            En eski kayıt en üstte.
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            {cursor ? (
              <Link href={hrefFor(baseParams)} style={linkButtonStyle}>
                Kuyruğun başı
              </Link>
            ) : null}
            {page.nextCursor ? (
              <Link
                href={hrefFor({ ...baseParams, cursor: page.nextCursor })}
                style={linkButtonStyle}
              >
                Sonraki sayfa
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function QueueHeader() {
  return (
    <>
      <PageHeader
        title="Moderasyon kuyruğu"
        description="Sınıflandırıcının reddettiği ve henüz kimsenin bakmadığı kayıtlar. Her satır, masalı yatma vaktinde bir makine tarafından engellenmiş bir ebeveyn — burası bir ceza listesi değil, itiraz sırası."
      />
      <Card style={{ marginBottom: 20 }} padding={16}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-foreground)' }}>
          Bu liste masalın metnini getirmez; kararı vermek için kategori skorları, neden kodu ve
          bekleme süresi yeter. Metni yalnızca inceleme sayfasında, açıkça isteyerek ve kayıt altına
          alınarak okursunuz.
        </p>
      </Card>
    </>
  );
}

function FilterGroup({
  legend,
  options,
  activeIndex,
}: {
  legend: string;
  options: Array<{ label: string; href: string; active?: boolean }>;
  activeIndex: number | undefined;
}) {
  return (
    <nav aria-label={legend}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)' }}>
        {legend}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {options.map((option, index) => {
          const active = option.active ?? activeIndex === index;
          return (
            <Link
              key={option.href}
              href={option.href}
              aria-current={active ? 'page' : undefined}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                border: '1px solid var(--border)',
                background: active ? 'var(--secondary)' : 'transparent',
                color: active ? 'var(--secondary-foreground)' : 'var(--muted-foreground)',
              }}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Filter links rebuild the whole query, so changing a filter drops the old cursor. */
function hrefFor(params: {
  verdict?: string | undefined;
  subjectType?: string | undefined;
  cursor?: string | undefined;
}): string {
  const query = new URLSearchParams();
  if (params.verdict) query.set('verdict', params.verdict);
  if (params.subjectType) query.set('subjectType', params.subjectType);
  if (params.cursor) query.set('cursor', params.cursor);
  const search = query.toString();
  return search ? `/moderation?${search}` : '/moderation';
}

const linkButtonStyle = {
  display: 'inline-block',
  padding: '7px 14px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  fontSize: 13,
  fontWeight: 600,
} as const;
