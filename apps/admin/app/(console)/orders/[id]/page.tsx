import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AdminOrderDto } from '@masalim/types';
import { AdminApiError, adminApi } from '../../../../src/lib/api';
import { Badge, Card, PageHeader } from '../../../../src/components/ui';
import {
  bookFormatLabel,
  eventLabel,
  formatCount,
  formatDateTime,
  formatMoney,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from '../format';
import { allowedTransitions, canAttachTracking } from '../transitions';
import { StatusForm } from '../StatusForm';
import { TrackingForm } from '../TrackingForm';

/**
 * One order, with everything needed to get the book to the door.
 *
 * This is the only page in the console that shows a family's address, and
 * opening it writes an audit entry naming the operator who did — so the page
 * says that out loud rather than letting someone discover it later. The address
 * sits in its own section instead of among the operational fields, because it is
 * needed to chase a courier and for nothing else.
 *
 * The two controls below it are honest about who decides: the console offers
 * only the moves the API accepts from this status, and the API still has the
 * final word on whether a shipment may go out without a tracking number and
 * whether the printer will let a job be recalled.
 */

interface OrderPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: OrderPageProps) {
  const { id } = await params;

  let order: AdminOrderDto;
  try {
    order = await adminApi<AdminOrderDto>(`admin/orders/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof AdminApiError) {
      return (
        <>
          <PageHeader title="Sipariş" description="Sipariş açılamadı." />
          <BackLink />
          <Card>
            <p role="alert" style={{ margin: 0, fontWeight: 600, color: 'var(--destructive)' }}>
              {messageFor(error)}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
              Sunucunun yanıtı: {error.code} ({error.status}) — {error.message}
            </p>
          </Card>
        </>
      );
    }
    throw error;
  }

  const address = order.shippingAddress;
  const transitions = allowedTransitions(order.status);
  const trackable = canAttachTracking(order.status);

  return (
    <>
      <PageHeader
        title={`Sipariş ${order.orderNumber}`}
        description={`${orderStatusLabel(order.status)} · ${formatDateTime(order.createdAt)} tarihinde oluşturuldu.`}
      />
      <BackLink />

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <Badge label={orderStatusLabel(order.status)} tone={orderStatusTone(order.status)} />
          <Badge
            label={`Ödeme: ${paymentStatusLabel(order.paymentStatus)}`}
            tone={paymentStatusTone(order.paymentStatus)}
          />
        </div>

        <dl
          style={{
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          <Field label="Tutar" value={formatMoney(order.total)} />
          <Field label="Adet" value={`${formatCount(order.quantity)} kitap`} />
          <Field label="Format" value={bookFormatLabel(order.bookSize, order.coverType)} />
          <Field label="Sayfa" value={`${formatCount(order.pageCount)} sayfa`} />
          <Field
            label="Tahmini teslim süresi"
            value={`${formatCount(order.estimatedDeliveryDays.min)}-${formatCount(order.estimatedDeliveryDays.max)} gün`}
          />
          <Field label="Kitap" value={order.bookTitle} detail={`Kitap kimliği: ${order.bookId}`} />
          <Field
            label="Müşteri"
            value={order.userEmail}
            detail={`Kullanıcı kimliği: ${order.userId}`}
          />
          <Field
            label="Matbaa işi"
            value={order.printProviderOrderId ?? 'Henüz gönderilmedi'}
          />
          <Field label="Kargo takip numarası" value={order.trackingNumber ?? 'Eklenmedi'} />
          <Field label="Son güncelleme" value={formatDateTime(order.updatedAt)} />
        </dl>
      </Card>

      <Section title="Teslimat adresi">
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted-foreground)' }}>
          Bu adresi görüntülediğiniz, hesabınız ve zamanıyla birlikte denetim kaydına yazıldı;
          sayfa her açıldığında yeni bir kayıt oluşur. Adres, siparişin verildiği andaki hâliyle
          saklanır — müşteri sonradan adres defterini değiştirse de kitap buraya gider.
        </p>

        {address ? (
          <address style={{ fontStyle: 'normal', fontSize: 14, lineHeight: 1.7 }}>
            <div style={{ fontWeight: 600 }}>{address.fullName || 'Ad belirtilmemiş'}</div>
            <div>{address.line1}</div>
            {address.line2 ? <div>{address.line2}</div> : null}
            <div>
              {[address.district, address.city].filter(Boolean).join(' / ')}
              {address.postalCode ? ` ${address.postalCode}` : ''}
            </div>
            <div>{address.countryCode}</div>
            {address.phone ? (
              <div style={{ marginTop: 6 }}>
                Telefon: <a href={`tel:${address.phone}`}>{address.phone}</a>
              </div>
            ) : null}
          </address>
        ) : (
          <p style={{ margin: 0, fontSize: 14 }}>
            Bu siparişte adres kaydı yok. Kargoya vermeden önce müşteriyle iletişime geçin.
          </p>
        )}
      </Section>

      <Section title="Durumu ilerlet">
        <StatusForm
          orderId={order.id}
          status={order.status}
          trackingNumber={order.trackingNumber}
          printProviderOrderId={order.printProviderOrderId}
        />
        {transitions.length > 0 ? (
          <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
            Burada yalnızca sunucunun bu durumdan kabul ettiği adımlar listelenir. Son sözü yine
            sunucu söyler; reddederse gerekçesi olduğu gibi gösterilir.
          </p>
        ) : null}
      </Section>

      <Section title="Kargo takip numarası">
        {trackable ? (
          <TrackingForm
            orderId={order.id}
            status={order.status}
            trackingNumber={order.trackingNumber}
          />
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--muted-foreground)' }}>
            {order.status === 'PENDING_PAYMENT'
              ? 'Ödemesi alınmamış bir siparişe takip numarası eklenmez.'
              : 'Bu siparişte takip edilecek bir gönderi kalmadı.'}
            {order.trackingNumber ? ` Kayıtlı numara: ${order.trackingNumber}.` : ''}
          </p>
        )}
      </Section>

      <Section title="Sipariş geçmişi">
        {order.events.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--muted-foreground)' }}>
            Bu sipariş için henüz kayıtlı bir olay yok.
          </p>
        ) : (
          <ol style={{ margin: 0, paddingInlineStart: 20, display: 'grid', gap: 8 }}>
            {order.events.map((event, index) => (
              <li key={`${event.type}-${event.occurredAt}-${String(index)}`} style={{ fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>{eventLabel(event.type)}</span>
                <span style={{ color: 'var(--muted-foreground)' }}>
                  {' '}
                  · {formatDateTime(event.occurredAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

function BackLink() {
  return (
    <p style={{ margin: '0 0 18px', fontSize: 14 }}>
      <Link href="/orders" style={{ textDecoration: 'underline', fontWeight: 600 }}>
        ← Sipariş listesine dön
      </Link>
    </p>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>{title}</h2>
      <Card>{children}</Card>
    </section>
  );
}

function Field({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <dt style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)' }}>{label}</dt>
      <dd style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 500, overflowWrap: 'anywhere' }}>
        {value}
        {detail ? (
          <span
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 400,
              color: 'var(--muted-foreground)',
            }}
          >
            {detail}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function messageFor(error: AdminApiError): string {
  if (error.status === 403) {
    return 'Bu siparişi görme yetkiniz yok. Siparişler ADMIN ve OPERATIONS rollerine açıktır.';
  }
  if (error.status === 404) {
    return 'Bu sipariş bulunamadı. Silinmiş olabilir ya da adresteki kimlik yanlış olabilir.';
  }
  return 'Sipariş bilgileri alınamadı. Bağlantı ya da sunucu tarafında bir sorun var.';
}
