import Link from 'next/link';
import type { AdminModerationRecordDto, AdminModerationSubjectDto } from '@masalim/types';
import { AdminApiError, adminApi } from '../../../../src/lib/api';
import { Badge, Card, PageHeader } from '../../../../src/components/ui';
import { DecisionForm } from '../decision-form';
import {
  ageRangeLabel,
  categoryLabel,
  firstParam,
  formatDateTime,
  formatScore,
  formatWaiting,
  localeLabel,
  scoreBarWidth,
  stageLabel,
  subjectTypeLabel,
  verdictLabel,
  verdictTone,
} from '../format';

/**
 * One refused story, and the decision that ends its wait.
 *
 * The page is built in two halves on purpose. Everything the reviewer needs to
 * triage — what the classifier scored, why it refused, how long the family has
 * been waiting — is here on arrival and costs the family nothing. The story
 * itself is behind a second, deliberate request, because reading a child's
 * bedtime story is an intrusion that the API writes into the audit trail with
 * the reviewer's name on it.
 *
 * The classifier's verdict and the human outcome are shown side by side and
 * never merged: keeping them apart is the only way anyone can later count how
 * often the filter was wrong.
 */

const TEXT_PARAM = 'metin';
const TEXT_OPEN = 'acik';

export default async function ModerationRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const wantsText = firstParam(query[TEXT_PARAM]) === TEXT_OPEN;

  let record: AdminModerationRecordDto | null;
  try {
    record = await loadRecord(id);
  } catch (error) {
    if (error instanceof AdminApiError) {
      return (
        <>
          <BackLink />
          <PageHeader title="Kayıt açılamadı" />
          <Card>
            <p role="alert" style={{ margin: 0, fontWeight: 600, color: 'var(--destructive)' }}>
              {error.status === 403
                ? 'Bu kaydı görme yetkiniz yok. Moderasyon ADMIN ve SUPPORT rollerine açıktır.'
                : 'Kayıt okunamadı.'}
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

  if (!record) {
    return (
      <>
        <BackLink />
        <PageHeader
          title="Bu kayıt kuyrukta değil"
          description="Kayıt ya başka bir operatör tarafından karara bağlandı ya da böyle bir kayıt yok."
        />
        <Card>
          <p style={{ margin: 0, fontSize: 14 }}>
            Karara bağlanan kayıtlar kuyruktan çıkar ve ikinci bir karar kabul edilmez. Aranan
            kimlik: <code>{id}</code>
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
            Metni açmadınız; bu sayfa hiçbir aile içeriği okumadı.
          </p>
        </Card>
      </>
    );
  }

  const now = Date.now();

  return (
    <>
      <BackLink />
      <PageHeader
        title={`${subjectTypeLabel(record.subjectType)} incelemesi`}
        description={`${stageLabel(record.stage)} · ${record.provider} · ${formatWaiting(record.createdAt, now)} bekliyor`}
      />

      <div style={{ display: 'grid', gap: 20, maxWidth: 860 }}>
        <Card>
          <h2 style={sectionTitleStyle}>İki ayrı karar</h2>
          <p style={sectionNoteStyle}>
            Makinenin kararı hiçbir zaman silinmez; sizin kararınız onun yanına yazılır. İkisini
            ayrı tuttuğumuz için filtrenin nerede yanıldığını sonradan sayabiliyoruz.
          </p>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
            <div style={verdictBoxStyle}>
              <div style={verdictBoxLabelStyle}>Sınıflandırıcının kararı</div>
              <Badge label={verdictLabel(record.verdict)} tone={verdictTone(record.verdict)} />
              <div style={{ fontSize: 13, marginTop: 8 }}>
                Neden kodu:{' '}
                {record.reasonCode ? (
                  <code>{record.reasonCode}</code>
                ) : (
                  <span style={{ color: 'var(--muted-foreground)' }}>yok</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
                {formatDateTime(record.createdAt)}
              </div>
            </div>

            <div style={verdictBoxStyle}>
              <div style={verdictBoxLabelStyle}>İnsan kararı</div>
              {record.reviewOutcome ? (
                <Badge
                  label={verdictLabel(record.reviewOutcome)}
                  tone={verdictTone(record.reviewOutcome)}
                />
              ) : (
                <Badge label="Henüz karar verilmedi" tone="neutral" />
              )}
              <div style={{ fontSize: 13, marginTop: 8 }}>
                {record.reviewNote ? (
                  record.reviewNote
                ) : (
                  <span style={{ color: 'var(--muted-foreground)' }}>Not yazılmamış</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
                {record.reviewedAt ? formatDateTime(record.reviewedAt) : 'Bekliyor'}
              </div>
            </div>
          </div>

          <dl style={metaListStyle}>
            <MetaItem term="Kayıt kimliği" detail={record.id} mono />
            <MetaItem term="Masal kimliği" detail={record.subjectId} mono />
            <MetaItem term="Denetlenen içerik" detail={subjectTypeLabel(record.subjectType)} />
            <MetaItem term="Aşama" detail={stageLabel(record.stage)} />
            <MetaItem term="Sağlayıcı" detail={record.provider} />
          </dl>
        </Card>

        <Card>
          <h2 style={sectionTitleStyle}>Kategori skorları</h2>
          <p style={sectionNoteStyle}>
            Sağlayıcının en yüksek skorları, 0 ile 1 arasında. Çoğu karar için metni açmadan da bu
            tablo yeterlidir.
          </p>

          {record.topCategories.length === 0 ? (
            <p style={{ margin: '14px 0 0', fontSize: 14, color: 'var(--muted-foreground)' }}>
              Sağlayıcı bu kayıt için skor göndermemiş. Karar, neden koduna ve gerekirse metne
              dayanır.
            </p>
          ) : (
            <div className="table-scroll" style={{ marginTop: 14 }}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Kategori</th>
                    <th scope="col">Skor</th>
                    <th scope="col">Ağırlık</th>
                  </tr>
                </thead>
                <tbody>
                  {record.topCategories.map((entry) => (
                    <tr key={entry.category}>
                      <th scope="row" style={{ fontWeight: 500, color: 'var(--foreground)' }}>
                        {categoryLabel(entry.category)}
                      </th>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatScore(entry.score)}
                      </td>
                      <td style={{ width: '45%', minWidth: 160 }}>
                        <div
                          aria-hidden="true"
                          style={{
                            background: 'var(--muted)',
                            borderRadius: 999,
                            height: 8,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: scoreBarWidth(entry.score),
                              height: '100%',
                              background: 'var(--destructive)',
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <SubjectSection recordId={record.id} open={wantsText} />

        <Card>
          <h2 style={sectionTitleStyle}>Kararı verin</h2>
          <p style={sectionNoteStyle}>
            Aile, verdiğiniz neden kodunu hiçbir zaman görmez; onlara yalnızca fikri birlikte
            değiştirmeyi öneren yumuşak mesaj gider.
          </p>
          <div style={{ marginTop: 16 }}>
            <DecisionForm recordId={record.id} classifierReasonCode={record.reasonCode} />
          </div>
        </Card>
      </div>
    </>
  );
}

/**
 * The audited read, kept behind a link.
 *
 * The reviewer arrives at a page that has read nothing, and only the act of
 * following this link puts their name next to a family's story in the audit
 * log. The notice is written before the click, not after it.
 */
async function SubjectSection({ recordId, open }: { recordId: string; open: boolean }) {
  if (!open) {
    return (
      <Card>
        <h2 style={sectionTitleStyle}>Masalın metni</h2>
        <p style={sectionNoteStyle}>
          Metin bu sayfaya kendiliğinden gelmez. Açtığınız anda okuma; adınız, kaydın kimliği ve
          zamanıyla birlikte denetim kaydına yazılır. Skorlar kararı vermeye yetiyorsa açmayın.
        </p>
        <div style={{ marginTop: 16 }}>
          <Link
            href={`/moderation/${recordId}?${TEXT_PARAM}=${TEXT_OPEN}`}
            style={{
              display: 'inline-block',
              padding: '9px 16px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Metni aç ve okumayı kayda geçir
          </Link>
        </div>
      </Card>
    );
  }

  let subject: AdminModerationSubjectDto;
  try {
    subject = await adminApi<AdminModerationSubjectDto>(`admin/moderation/${encodeURIComponent(recordId)}/subject`);
  } catch (error) {
    if (error instanceof AdminApiError) {
      return (
        <Card>
          <h2 style={sectionTitleStyle}>Masalın metni</h2>
          <p role="alert" style={{ margin: '10px 0 0', fontWeight: 600, fontSize: 14 }}>
            {error.status === 404
              ? 'İçerik artık saklanmıyor — aile masalı silmiş olabilir. Kararı kategori skorlarına ve neden koduna dayanarak verin.'
              : error.status === 403
                ? 'Bu içeriği okuma yetkiniz yok.'
                : 'Metin okunamadı.'}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
            Sunucunun yanıtı: {error.code} — {error.message}
          </p>
        </Card>
      );
    }
    throw error;
  }

  return (
    <Card>
      <h2 style={sectionTitleStyle}>Masalın metni</h2>
      <p role="status" style={{ ...sectionNoteStyle, color: 'var(--foreground)', fontWeight: 600 }}>
        Bu okuma denetim kaydına işlendi.
      </p>
      <p style={sectionNoteStyle}>
        {subject.storyTitle ? `“${subject.storyTitle}” · ` : ''}
        {ageRangeLabel(subject.ageRange)} · {localeLabel(subject.language)} ·{' '}
        {subjectTypeLabel(subject.subjectType)}
      </p>
      <div
        style={{
          marginTop: 16,
          padding: '16px 18px',
          borderRadius: 12,
          background: 'var(--muted)',
          whiteSpace: 'pre-wrap',
          fontSize: 15,
          lineHeight: 1.7,
          maxHeight: 520,
          overflowY: 'auto',
        }}
      >
        {subject.text}
      </div>
    </Card>
  );
}

/**
 * One record by id.
 *
 * Reads the record directly rather than scanning the queue, so this page keeps
 * working after a decision is made — which is exactly when a reviewer wants to
 * see what was decided and by which reasoning.
 */
async function loadRecord(id: string): Promise<AdminModerationRecordDto> {
  return adminApi<AdminModerationRecordDto>(`admin/moderation/${encodeURIComponent(id)}`);
}

function BackLink() {
  return (
    <div style={{ marginBottom: 16 }}>
      <Link href="/moderation" style={{ fontSize: 13, fontWeight: 600 }}>
        ← Moderasyon kuyruğu
      </Link>
    </div>
  );
}

function MetaItem({ term, detail, mono }: { term: string; detail: string; mono?: boolean }) {
  return (
    <div>
      <dt style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>{term}</dt>
      <dd
        style={{
          margin: '2px 0 0',
          fontSize: 13,
          fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
          wordBreak: 'break-all',
        }}
      >
        {detail}
      </dd>
    </div>
  );
}

const sectionTitleStyle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
} as const;

const sectionNoteStyle = {
  margin: '6px 0 0',
  fontSize: 13,
  color: 'var(--muted-foreground)',
} as const;

const verdictBoxStyle = {
  flex: '1 1 240px',
  minWidth: 240,
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 14,
} as const;

const verdictBoxLabelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  marginBottom: 8,
} as const;

const metaListStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 14,
  margin: '20px 0 0',
} as const;
