import type { AdminDashboardDto, AdminUserAccountDto } from '@masalim/types';
import { adminApi, AdminApiError } from '../../src/lib/api';
import { Card, PageHeader, Stat } from '../../src/components/ui';
import { ActionStat } from '../../src/components/dashboard/ActionStat';
import { StatGroup } from '../../src/components/dashboard/StatGroup';
import {
  formatCount,
  formatInstantInZone,
  formatMicros,
  formatOperatingDay,
} from '../../src/components/dashboard/format';

/**
 * The panel a shift opens on.
 *
 * It answers two questions and no others: is the service healthy, and what is
 * waiting for a person. Every figure carries a hint saying what it counts and
 * over which window, because the counts here are gathered over two different
 * windows — a local calendar day in the operating timezone, and "right now" —
 * and a bare number on a wall invites everyone to invent their own definition.
 *
 * The day is the operating timezone's day, not the reader's. That is stated on
 * the page rather than assumed, so an operator working from another zone does
 * not silently mis-read every daily figure on it.
 *
 * Nothing here reaches into a family's library: the two audited reads live
 * behind the moderation and order pages, where a person has an actual reason to
 * open one.
 */

/** Mirrors the API's role gate, so the panel does not offer doors that refuse. */
const MODERATION_ROLES: ReadonlyArray<string> = ['ADMIN', 'SUPPORT'];
const ORDER_ROLES: ReadonlyArray<string> = ['ADMIN', 'OPERATIONS'];

export default async function DashboardPage() {
  let stats: AdminDashboardDto;
  let admin: AdminUserAccountDto;

  try {
    [stats, admin] = await Promise.all([
      adminApi<AdminDashboardDto>('admin/dashboard'),
      adminApi<AdminUserAccountDto>('admin/auth/me'),
    ]);
  } catch (error) {
    if (error instanceof AdminApiError) {
      return (
        <>
          <PageHeader title="Panel" description="Vardiyanın açıldığı sayılar." />
          <Card>
            <p role="alert" style={{ margin: 0, fontWeight: 600, color: 'var(--destructive)' }}>
              {error.message}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
              Sunucunun verdiği yanıt: {error.code} ({error.status}). Sayılar bu yüzden
              gösterilemiyor; sorun sürerse bu kodu ekiple paylaş.
            </p>
          </Card>
        </>
      );
    }
    throw error;
  }

  const day = formatOperatingDay(stats.day);
  const generatedAt = formatInstantInZone(stats.generatedAt, stats.timezone);
  const dayScope = `${day} · ${stats.timezone}`;

  const canOpenModeration = MODERATION_ROLES.includes(admin.role);
  const canOpenOrders = ORDER_ROLES.includes(admin.role);

  const moderationValue = formatCount(stats.moderationQueueDepth);
  const ordersValue = formatCount(stats.ordersAwaitingFulfilment);
  const moderationHint = 'İnsan kararı bekleyen moderasyon kaydı, şu anki toplam';
  const ordersHint = 'Hazırlanmayı bekleyen sipariş, şu anki toplam';

  return (
    <>
      <PageHeader
        title="Panel"
        description={`Vardiyanın açıldığı sayılar. Günlük sayılar ${dayScope} takvim gününü kapsıyor.`}
      />

      <Card style={{ background: 'var(--muted)' }} padding={16}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
          Bu sayfadaki <strong>“bugün”</strong>, <strong>{stats.timezone}</strong> saat dilimindeki{' '}
          <strong>{day}</strong> takvim günüdür — senin bulunduğun saat dilimi farklıysa kendi
          gününle birebir örtüşmez. Kuyruk ve abonelik sayıları ise güne bağlı değildir;{' '}
          {generatedAt} itibarıyla anlık durumu gösterir.
        </p>
      </Card>

      <StatGroup title="Masal üretimi" period={dayScope}>
        <Stat
          label="Tamamlanan masal"
          value={formatCount(stats.storiesGeneratedToday)}
          hint="Bugün oluşturulup okunmaya hazır hâle gelen masal sayısı"
        />
        <Stat
          label="Başarısız masal"
          value={formatCount(stats.storiesFailedToday)}
          hint="Bugün oluşturulurken hata alan ya da moderasyonda reddedilen masal sayısı"
          {...(stats.storiesFailedToday > 0 ? { tone: 'danger' as const } : {})}
        />
        <Stat
          label="Yeni hesap"
          value={formatCount(stats.newUsersToday)}
          hint="Bugün açılan hesap sayısı; sonradan silinenler de sayılır"
        />
      </StatGroup>

      <StatGroup title="Bekleyen işler" period={`Şu an · ${generatedAt}`}>
        {canOpenModeration ? (
          <ActionStat
            href="/moderation"
            label="Moderasyon kuyruğu"
            value={moderationValue}
            hint={moderationHint}
            action="Kuyruğu aç"
            {...(stats.moderationQueueDepth > 0 ? { tone: 'warning' as const } : {})}
          />
        ) : (
          <Stat
            label="Moderasyon kuyruğu"
            value={moderationValue}
            hint={`${moderationHint}; bu kuyruğu açma yetkisi Destek ekibinde`}
          />
        )}

        {canOpenOrders ? (
          <ActionStat
            href="/orders"
            label="Bekleyen sipariş"
            value={ordersValue}
            hint={ordersHint}
            action="Siparişleri aç"
            {...(stats.ordersAwaitingFulfilment > 0 ? { tone: 'warning' as const } : {})}
          />
        ) : (
          <Stat
            label="Bekleyen sipariş"
            value={ordersValue}
            hint={`${ordersHint}; bu listeyi açma yetkisi Operasyon ekibinde`}
          />
        )}

        <Stat
          label="Geçerli abonelik"
          value={formatCount(stats.activeSubscriptions)}
          hint="Şu an hakları açık olan abonelik: aktif, deneme ve ödeme sorunu için tanınan ek süredekiler"
        />
      </StatGroup>

      <StatGroup title="Yapay zekâ kullanımı" period={dayScope}>
        <Stat
          label="Tahmini maliyet"
          value={formatMicros(stats.aiSpendTodayMicros)}
          hint="Bugünün yapay zekâ harcaması, para biriminin milyonda biri hassasiyetiyle tutulan tahmindir; sağlayıcı faturası değildir"
        />
        <Stat
          label="Çağrı"
          value={formatCount(stats.aiCallsToday)}
          hint="Bugün kaydedilen yapay zekâ çağrısı sayısı; başarılı ve başarısız çağrıların tamamı"
        />
        <Stat
          label="Başarısız çağrı"
          value={formatCount(stats.aiFailuresToday)}
          hint="Bugün hata ile dönen yapay zekâ çağrısı sayısı"
          {...(stats.aiFailuresToday > 0 ? { tone: 'danger' as const } : {})}
        />
      </StatGroup>

      <p style={{ marginTop: 24, fontSize: 12, color: 'var(--muted-foreground)' }}>
        Sayılar {generatedAt} ({stats.timezone}) itibarıyla hesaplandı. Sayfayı yenilediğinde
        yeniden hesaplanır.
      </p>
    </>
  );
}
