import type { AdminFeatureFlagDto } from '@masalim/types';
import { AdminApiError, adminApi } from '../../../src/lib/api';
import { Badge, Card, Empty, PageHeader, Stat } from '../../../src/components/ui';
import { FlagControl } from './FlagControl';
import { flagLabel, flagSummary, formatDateTime, formatPercentage, isKnownFlag } from './flag-copy';
import { metaStyle, monoStyle } from './styles';

/**
 * The switches that change the product for everybody.
 *
 * Every other page in this console acts on one order, one review, one account.
 * This one acts on the whole service at once, so it is laid out as a list of
 * consequential decisions rather than a row of toggles: each flag gets a card
 * that states what it governs, who moved it last and when, and a control that
 * makes the operator confirm the change in a sentence naming the flag.
 *
 * A flag that exists only as a compiled-in default has never been touched, and
 * the API says so by sending `updatedAt: null`. That is shown as "hiç
 * değiştirilmedi" — the row's creation date would be a date about the database,
 * not about the flag, and an operator reading it as "somebody changed this"
 * would be misled at exactly the wrong moment.
 */

export default async function FeatureFlagsPage() {
  let flags: AdminFeatureFlagDto[];
  try {
    flags = await adminApi<AdminFeatureFlagDto[]>('admin/feature-flags');
  } catch (error) {
    if (error instanceof AdminApiError) {
      return (
        <>
          <PageHeader title="Özellik Bayrakları" />
          <Card>
            <p role="alert" style={{ margin: 0, fontWeight: 600, color: 'var(--destructive)' }}>
              {error.status === 403
                ? 'Özellik bayraklarını görme yetkiniz yok. Bu bölüm yalnızca ADMIN rolüne açıktır.'
                : 'Bayrak listesi alınamadı.'}
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

  const enabledCount = flags.filter((flag) => flag.enabled).length;
  const stagedCount = flags.filter((flag) => flag.enabled && flag.rolloutPercentage < 100).length;
  const untouchedCount = flags.filter((flag) => flag.updatedAt === null).length;

  return (
    <>
      <PageHeader
        title="Özellik Bayrakları"
        description="Bir bayrağı değiştirmek, hizmeti kullanan bütün ailelerde aynı anda etkili olur. Buradaki her değişiklik adınızla denetim kaydına yazılır."
      />

      {flags.length === 0 ? (
        <Card>
          <Empty message="Sunucu hiçbir bayrak bildirmedi. Bayraklar koddaki varsayılanlardan gelir; liste boşsa API tarafında bir sorun var demektir." />
        </Card>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
            <Stat label="Bayrak" value={flags.length} hint="Sunucunun bildiği tüm anahtarlar" />
            <Stat label="Açık" value={enabledCount} hint="Ailelere ulaşan özellikler" />
            <Stat
              label="Kapalı"
              value={flags.length - enabledCount}
              hint="Hiçbir ailede görünmeyen özellikler"
            />
            <Stat
              label="Kademeli"
              value={stagedCount}
              hint="Açık ama yüzde 100'ün altında"
              {...(stagedCount > 0 ? { tone: 'warning' as const } : {})}
            />
            <Stat
              label="Hiç değiştirilmedi"
              value={untouchedCount}
              hint="Koddaki varsayılan değerinde duruyor"
            />
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            {flags.map((flag) => (
              <FlagCard key={flag.key} flag={flag} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function FlagCard({ flag }: { flag: AdminFeatureFlagDto }) {
  const label = flagLabel(flag.key);
  const summary = flag.description ?? flagSummary(flag.key);
  const staged = flag.enabled && flag.rolloutPercentage < 100;

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{label}</h2>
          <div style={{ ...monoStyle, color: 'var(--muted-foreground)', marginTop: 3 }}>
            {flag.key}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge label={flag.enabled ? 'Açık' : 'Kapalı'} tone={flag.enabled ? 'success' : 'neutral'} />
          {staged ? (
            <Badge label={`Kademe ${formatPercentage(flag.rolloutPercentage)}`} tone="warning" />
          ) : null}
        </div>
      </div>

      {summary ? <p style={{ margin: '12px 0 0', fontSize: 14 }}>{summary}</p> : null}

      {!isKnownFlag(flag.key) ? (
        <p style={{ ...metaStyle, marginTop: 8 }}>
          Bu anahtar konsolun tanıdığı bayraklar arasında değil. Sunucu bildirdiği için listeleniyor;
          ne yaptığını değiştirmeden önce koddan doğrulayın.
        </p>
      ) : null}

      <p style={{ ...metaStyle, marginTop: 10 }}>
        {flag.updatedAt === null ? (
          <>
            Bu bayrak <strong style={{ color: 'var(--foreground)' }}>hiç değiştirilmedi</strong>;
            koddan gelen varsayılan değerinde duruyor.
          </>
        ) : (
          <>
            Son değişiklik: {formatDateTime(flag.updatedAt)} ·{' '}
            {flag.updatedByAdminName ?? 'değiştiren kişi kayıtlı değil'}
          </>
        )}
      </p>

      <div style={{ marginTop: 16 }}>
        <FlagControl
          flagKey={flag.key}
          enabled={flag.enabled}
          rolloutPercentage={flag.rolloutPercentage}
        />
      </div>
    </Card>
  );
}
