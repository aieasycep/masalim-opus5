import type { AdminDeletionRequestDto } from '@masalim/types';
import { AdminApiError, adminApi } from '../../../src/lib/api';
import { Badge, Card, Empty } from '../../../src/components/ui';
import {
  deletionStatusLabel,
  deletionStatusTone,
  deletionTypeLabel,
  formatDateTime,
  formatWhen,
  isOpenDeletion,
  isPast,
} from './format';
import { sectionNoteStyle, sectionTitleStyle } from './styles';

/**
 * "Sildiniz mi?" — the one question this console answers and no other page can.
 *
 * A family that asked to be forgotten is owed a straight answer, so the state
 * is stated in a sentence before any table appears: a pending request leads
 * with the date it is due, a failed one leads with the error the worker
 * recorded, and a request whose due date has passed while still open is called
 * out as such instead of being read as "any day now".
 *
 * The read is audited server-side. That is the right trade — looking is itself
 * an action against someone who asked to be erased — and it is why this section
 * carries no story titles or children: the deletion state is the whole point.
 */
export async function DeletionRequests({ userId }: { userId: string }) {
  let requests: AdminDeletionRequestDto[];
  try {
    requests = await adminApi<AdminDeletionRequestDto[]>(`admin/users/${encodeURIComponent(userId)}/deletion-requests`);
  } catch (error) {
    if (error instanceof AdminApiError) {
      return (
        <Card>
          <h2 style={sectionTitleStyle}>Silme talepleri</h2>
          <p role="alert" style={{ margin: '10px 0 0', fontSize: 14, fontWeight: 600 }}>
            {error.status === 403
              ? 'Silme taleplerini görme yetkiniz yok.'
              : error.status === 404
                ? 'Bu hesap bulunamadı; kimlik değişmiş olabilir.'
                : 'Silme talepleri okunamadı. Aileye kesin bir tarih söylemeyin.'}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
            Sunucunun yanıtı: {error.code} — {error.message}
          </p>
        </Card>
      );
    }
    throw error;
  }

  const now = Date.now();
  const open = requests.filter((request) => isOpenDeletion(request.status));
  const failed = requests.filter((request) => request.status === 'FAILED');
  const completed = requests.filter((request) => request.status === 'COMPLETED');
  const overdue = open.filter((request) => isPast(request.scheduledFor, now));
  /** Requests arrive newest first, so the first completed one is the latest. */
  const lastCompleted = completed[0];

  return (
    <Card>
      <h2 style={sectionTitleStyle}>Silme talepleri</h2>
      <p style={sectionNoteStyle}>
        Bu bölümü açmanız denetim kaydına işlendi. Aileye burada yazandan fazlasını söylemeyin.
      </p>

      {requests.length === 0 ? (
        <Empty message="Bu hesap hiç silme talebi vermemiş. Aile silme istiyorsa uygulamadaki hesap ayarlarından başlatması gerekir; buradan bir talep açılamaz." />
      ) : (
        <>
          <div style={{ display: 'grid', gap: 12, margin: '16px 0 0' }}>
            {failed.length > 0 ? (
              <Callout tone="danger" title="Silme başarısız oldu ve kendiliğinden tamamlanmaz.">
                {failed.length === 1
                  ? 'Bir talep hata ile durdu. Aileye "silindi" demeyin; kaydı teknik ekibe iletin.'
                  : `${failed.length} talep hata ile durdu. Aileye "silindi" demeyin; kayıtları teknik ekibe iletin.`}
              </Callout>
            ) : null}

            {open.map((request) => (
              <Callout
                key={request.id}
                tone={isPast(request.scheduledFor, now) ? 'danger' : 'warning'}
                title={
                  isPast(request.scheduledFor, now)
                    ? `${deletionTypeLabel(request.type)}: planlanan silme tarihi geçti, kayıt hâlâ açık.`
                    : `${deletionTypeLabel(request.type)}: silme planlandı, henüz tamamlanmadı.`
                }
              >
                Planlanan silme: {formatDateTime(request.scheduledFor)} (
                {formatWhen(request.scheduledFor, now)}). Durum:{' '}
                {deletionStatusLabel(request.status)}.
              </Callout>
            ))}

            {open.length === 0 && failed.length === 0 && lastCompleted ? (
              <Callout tone="success" title="Bu hesabın verileri silindi.">
                Son tamamlanan talep:{' '}
                {formatDateTime(lastCompleted.completedAt ?? lastCompleted.scheduledFor)}. Aileye
                silmenin tamamlandığını söyleyebilirsiniz.
              </Callout>
            ) : null}

            {open.length === 0 && failed.length === 0 && !lastCompleted ? (
              <Callout tone="neutral" title="Şu anda açık bir silme talebi yok.">
                Geçmişteki talepler aşağıda; hepsi iptal edilmiş ya da vazgeçilmiş durumda.
              </Callout>
            ) : null}
          </div>

          {overdue.length > 0 ? (
            <p role="status" style={{ margin: '12px 0 0', fontSize: 13, fontWeight: 600 }}>
              Gecikmiş talep sayısı: {overdue.length}
            </p>
          ) : null}

          <ul
            style={{ listStyle: 'none', margin: '20px 0 0', padding: 0, display: 'grid', gap: 12 }}
          >
            {requests.map((request) => (
              <li
                key={request.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Badge
                    label={deletionStatusLabel(request.status)}
                    tone={deletionStatusTone(request.status)}
                  />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {deletionTypeLabel(request.type)}
                  </span>
                </div>

                <dl
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                    gap: 12,
                    margin: '12px 0 0',
                  }}
                >
                  <Field term="Talep tarihi" detail={formatDateTime(request.createdAt)} />
                  <Field
                    term="Planlanan silme"
                    detail={`${formatDateTime(request.scheduledFor)} · ${formatWhen(request.scheduledFor, now)}`}
                    {...(isOpenDeletion(request.status) && isPast(request.scheduledFor, now)
                      ? { tone: 'danger' as const }
                      : {})}
                  />
                  <Field
                    term="Tamamlanma"
                    detail={
                      request.completedAt ? formatDateTime(request.completedAt) : 'Tamamlanmadı'
                    }
                  />
                </dl>

                {request.reason ? (
                  <p style={{ margin: '12px 0 0', fontSize: 13 }}>
                    <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>
                      Ailenin gerekçesi:
                    </span>{' '}
                    {request.reason}
                  </p>
                ) : null}

                {/*
                  The same column carries two different things. A FAILED request
                  holds a genuine error; a SCHEDULED one holds the reason the
                  worker deferred it — usually an order still in the post — and
                  the worker deliberately returns such requests to SCHEDULED
                  rather than failing them, because nothing here gives up on a
                  deletion a parent asked for. Framing a healthy deferral in red
                  would have an operator apologising for a fault that has not
                  happened.
                */}
                {request.errorMessage ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${
                        request.status === 'FAILED' ? 'var(--destructive)' : 'var(--border)'
                      }`,
                      background: 'var(--muted)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color:
                          request.status === 'FAILED'
                            ? 'var(--destructive)'
                            : 'var(--muted-foreground)',
                      }}
                    >
                      {request.status === 'FAILED'
                        ? 'Silme sırasında oluşan hata'
                        : 'Beklemede kalma nedeni'}
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                      {request.errorMessage}
                    </p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

const CALLOUT_TONES = {
  danger: { border: 'var(--destructive)', color: 'var(--destructive)' },
  warning: { border: 'var(--warning)', color: 'var(--foreground)' },
  success: { border: 'var(--success)', color: 'var(--foreground)' },
  neutral: { border: 'var(--border)', color: 'var(--foreground)' },
} as const;

function Callout({
  tone,
  title,
  children,
}: {
  tone: keyof typeof CALLOUT_TONES;
  title: string;
  children: React.ReactNode;
}) {
  const palette = CALLOUT_TONES[tone];
  return (
    <div
      role="status"
      style={{
        border: `1px solid ${palette.border}`,
        borderInlineStartWidth: 4,
        borderRadius: 12,
        padding: '12px 14px',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, color: palette.color }}>{title}</div>
      <p style={{ margin: '4px 0 0', fontSize: 13 }}>{children}</p>
    </div>
  );
}

function Field({ term, detail, tone }: { term: string; detail: string; tone?: 'danger' }) {
  return (
    <div>
      <dt style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>{term}</dt>
      <dd
        style={{
          margin: '2px 0 0',
          fontSize: 13,
          fontWeight: tone === 'danger' ? 700 : 400,
          color: tone === 'danger' ? 'var(--destructive)' : 'inherit',
        }}
      >
        {detail}
      </dd>
    </div>
  );
}
