import Link from 'next/link';
import type { AdminUserDetailDto } from '@masalim/types';
import { AdminApiError, adminApi } from '../../../../src/lib/api';
import { Badge, Card, PageHeader, Stat } from '../../../../src/components/ui';
import { DeletionRequests } from '../deletion-requests';
import {
  formatDateTime,
  formatWhen,
  localeLabel,
  subscriptionStatusLabel,
  subscriptionStatusTone,
  subscriptionTierLabel,
} from '../format';
import { metaListStyle, monoStyle, sectionNoteStyle, sectionTitleStyle } from '../styles';

/**
 * One account, as counts.
 *
 * This page opens because an operator is talking to a family and needs to check
 * something specific. It shows how many children, stories, voice recordings and
 * books the account has — never which ones, and never their names. The API does
 * not send that detail and this page does not go looking for it; a support call
 * about a failed order has never needed to know a child is called Elif.
 *
 * Reading it is audited under the operator's name, so the page makes one detail
 * request and one deletion-request read, and nothing speculative.
 */
export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let user: AdminUserDetailDto;
  try {
    user = await adminApi<AdminUserDetailDto>(`admin/users/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof AdminApiError) {
      return (
        <>
          <BackLink />
          <PageHeader title="Hesap açılamadı" />
          <Card>
            <p role="alert" style={{ margin: 0, fontWeight: 600, color: 'var(--destructive)' }}>
              {error.status === 404
                ? 'Böyle bir hesap yok. Kimlik yanlış kopyalanmış olabilir; aramaya dönüp e-posta ile deneyin.'
                : error.status === 403
                  ? 'Bu hesabı görme yetkiniz yok. Bu bölüm ADMIN ve SUPPORT rollerine açıktır.'
                  : 'Hesap okunamadı.'}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
              Sunucunun yanıtı: {error.code} — {error.message}
            </p>
            <p style={{ margin: '10px 0 0', ...monoStyle, color: 'var(--muted-foreground)' }}>
              Aranan kimlik: {id}
            </p>
          </Card>
        </>
      );
    }
    throw error;
  }

  const now = Date.now();
  const deleted = user.deletedAt !== null;

  return (
    <>
      <BackLink />
      <PageHeader
        title={user.email}
        description={
          deleted
            ? 'Bu hesap silinmiş. Aşağıdaki sayılar silme anındaki kayda aittir.'
            : 'Hesabın sayıları ve silme talepleri. Çocuklar sayılır, adları hiçbir zaman gösterilmez.'
        }
      />

      {deleted && user.deletedAt ? (
        <Card
          style={{
            marginBottom: 20,
            borderColor: 'var(--destructive)',
            borderInlineStartWidth: 4,
            background: 'var(--muted)',
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge label="Hesap silindi" tone="danger" />
            <strong style={{ fontSize: 15, color: 'var(--destructive)' }}>
              Bu hesap artık kullanılmıyor.
            </strong>
          </div>
          <p role="status" style={{ margin: '8px 0 0', fontSize: 14 }}>
            Silinme zamanı: {formatDateTime(user.deletedAt)} ({formatWhen(user.deletedAt, now)}).
            Aile bu adresle giriş yapamaz; yeniden açma isteği geldiğinde teknik ekibe iletin, bu
            ekrandan geri alınamaz.
          </p>
        </Card>
      ) : null}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <Stat label="Çocuk" value={user.childCount} hint="Silinmemiş çocuk profili" />
        <Stat label="Masal" value={user.storyCount} hint="Silinmemiş masal" />
        <Stat
          label="Son 30 günde masal"
          value={user.storiesLast30Days}
          hint="Hesabın güncel kullanımı"
        />
        <Stat label="Ses kaydı" value={user.voiceProfileCount} hint="Aileye ait ses profili" />
        <Stat label="Kitap" value={user.bookCount} hint="Taslaklar dahil tüm kitaplar" />
        <Stat label="Sipariş" value={user.orderCount} hint="İptaller dahil tüm siparişler" />
        <Stat
          label="Açık silme talebi"
          value={user.openDeletionRequests}
          hint={
            user.openDeletionRequests > 0
              ? 'Silme sürüyor; ayrıntısı aşağıda'
              : 'Bekleyen silme yok'
          }
          {...(user.openDeletionRequests > 0 ? { tone: 'danger' as const } : {})}
        />
      </div>

      <div style={{ display: 'grid', gap: 20, maxWidth: 900 }}>
        <Card>
          <h2 style={sectionTitleStyle}>Hesap</h2>
          <p style={sectionNoteStyle}>
            Ebeveynin kendi adı burada; çocukların adları hiçbir yerde. Bir sipariş ya da masal
            sorusunu yanıtlamak için bu sayılar yeter.
          </p>

          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              marginTop: 16,
            }}
          >
            <Badge
              label={subscriptionStatusLabel(user.subscriptionStatus)}
              tone={subscriptionStatusTone(user.subscriptionStatus)}
            />
            <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
              {subscriptionTierLabel(user.subscriptionTier)}
            </span>
            {user.onboardingCompleted ? null : (
              <Badge label="Kuruluma devam etmemiş" tone="warning" />
            )}
          </div>

          <dl style={metaListStyle}>
            <MetaItem term="E-posta" detail={user.email} />
            <MetaItem term="Ebeveynin adı" detail={user.name ?? 'Belirtilmemiş'} />
            <MetaItem term="Hesap kimliği" detail={user.id} mono />
            <MetaItem term="Uygulama dili" detail={localeLabel(user.locale)} />
            <MetaItem term="Saat dilimi" detail={user.timezone} />
            <MetaItem
              term="Kurulumu tamamlamış"
              detail={user.onboardingCompleted ? 'Evet' : 'Hayır'}
            />
            <MetaItem
              term="Kayıt tarihi"
              detail={`${formatDateTime(user.createdAt)} · ${formatWhen(user.createdAt, now)}`}
            />
            <MetaItem
              term="Son görülme"
              detail={
                user.lastSeenAt
                  ? `${formatDateTime(user.lastSeenAt)} · ${formatWhen(user.lastSeenAt, now)}`
                  : 'Hiç giriş yapmamış'
              }
            />
            <MetaItem
              term="Silinme"
              detail={user.deletedAt ? formatDateTime(user.deletedAt) : 'Silinmemiş'}
            />
          </dl>
        </Card>

        {/*
          Fetched only when the account actually has deletion history. The
          endpoint is separately audited, and firing it on every account view
          would record an operator reading the erasure record of a family who
          never asked for one — a read taken for no reason is still a read.
        */}
        {user.openDeletionRequests > 0 || user.deletedAt !== null ? (
          <DeletionRequests userId={user.id} />
        ) : (
          <Card>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Silme talepleri</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
              Bu hesabın açık bir silme talebi yok.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}

function BackLink() {
  return (
    <div style={{ marginBottom: 16 }}>
      <Link href="/users" style={{ fontSize: 13, fontWeight: 600 }}>
        ← Kullanıcı arama
      </Link>
    </div>
  );
}

function MetaItem({ term, detail, mono }: { term: string; detail: string; mono?: boolean }) {
  return (
    <div>
      <dt style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>{term}</dt>
      <dd style={{ margin: '2px 0 0', fontSize: 13, ...(mono ? monoStyle : {}) }}>{detail}</dd>
    </div>
  );
}
