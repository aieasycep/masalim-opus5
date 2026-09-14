import Link from 'next/link';
import { adminOrderListSchema, type AdminOrderListInput } from '@masalim/validation';
import type { AdminOrderSummaryDto, Paginated } from '@masalim/types';
import { AdminApiError, adminApi } from '../../../src/lib/api';
import { Badge, Card, DataTable, Empty, PageHeader } from '../../../src/components/ui';
import { OrderFilters } from './OrderFilters';
import {
  asOrderStatus,
  asPaymentStatus,
  bookFormatLabel,
  firstParam,
  formatCount,
  formatDateTime,
  formatMoney,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from './format';

/**
 * The fulfilment work list.
 *
 * It carries what it takes to route and chase a shipment — order number,
 * status, payment, total, format and destination city — and stops there. The
 * shipping address lives one click away on the order's own page, because that
 * read is audited and paging through a list of families' doorsteps is not an
 * operational need. Fetching the audited endpoint to fill in this table would
 * turn the console into exactly the thing it was built not to be.
 *
 * Paging is by cursor, so there is a "next page" and a way back to the start
 * but no page numbers: the API hands out an opaque cursor for the page after
 * this one and nothing else, and inventing numbered pages on top of that would
 * be inventing a total the server never gave.
 */

/** Validation codes the list query can raise, in the operator's language. */
const FILTER_MESSAGES: Record<string, string> = {
  ORDER_NUMBER_TOO_SHORT: 'Sipariş numarası araması en az 3 karakter olmalı.',
};

interface OrdersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;

  const rawStatus = firstParam(params.status)?.trim();
  const rawPaymentStatus = firstParam(params.paymentStatus)?.trim();
  const rawOrderNumber = firstParam(params.orderNumber)?.trim();
  const rawCursor = firstParam(params.cursor)?.trim();
  const awaitingFulfilment = firstParam(params.awaitingFulfilment) === 'true';

  const parsed = adminOrderListSchema.safeParse({
    ...(rawStatus ? { status: rawStatus } : {}),
    ...(rawPaymentStatus ? { paymentStatus: rawPaymentStatus } : {}),
    ...(rawOrderNumber ? { orderNumber: rawOrderNumber } : {}),
    ...(rawCursor ? { cursor: rawCursor } : {}),
    awaitingFulfilment: awaitingFulfilment ? 'true' : 'false',
  });

  const header = (
    <PageHeader
      title="Siparişler"
      description="Basılan kitapların hazırlanma ve kargo takibi. Teslimat adresi yalnızca siparişin kendi sayfasında görünür ve o görüntüleme kayıt altına alınır."
    />
  );

  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => FILTER_MESSAGES[issue.message] ?? `${String(issue.path[0] ?? 'filtre')}: ${issue.message}`,
    );

    return (
      <>
        {header}
        <OrderFilters
          status={asOrderStatus(rawStatus)}
          paymentStatus={asPaymentStatus(rawPaymentStatus)}
          {...(rawOrderNumber ? { orderNumber: rawOrderNumber } : { orderNumber: undefined })}
          awaitingFulfilment={awaitingFulfilment}
        />
        <Card>
          <p role="alert" style={{ margin: 0, fontWeight: 600, color: 'var(--destructive)' }}>
            Filtreler uygulanmadı.
          </p>
          <ul style={{ margin: '8px 0 0', paddingInlineStart: 20, fontSize: 13 }}>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Card>
      </>
    );
  }

  const filters = parsed.data;

  let page: Paginated<AdminOrderSummaryDto>;
  try {
    page = await adminApi<Paginated<AdminOrderSummaryDto>>(`admin/orders?${apiQuery(filters)}`);
  } catch (error) {
    if (error instanceof AdminApiError) {
      return (
        <>
          {header}
          <Card>
            <p role="alert" style={{ margin: 0, fontWeight: 600, color: 'var(--destructive)' }}>
              {error.status === 403
                ? 'Bu listeyi görme yetkiniz yok. Siparişler ADMIN ve OPERATIONS rollerine açıktır.'
                : 'Sipariş listesi alınamadı.'}
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

  const orders = page.items;

  return (
    <>
      {header}

      <OrderFilters
        {...(filters.status ? { status: filters.status } : { status: undefined })}
        {...(filters.paymentStatus
          ? { paymentStatus: filters.paymentStatus }
          : { paymentStatus: undefined })}
        {...(filters.orderNumber
          ? { orderNumber: filters.orderNumber }
          : { orderNumber: undefined })}
        awaitingFulfilment={filters.awaitingFulfilment}
      />

      <p aria-live="polite" style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted-foreground)' }}>
        {orders.length === 0
          ? 'Bu filtrelerle gösterilecek sipariş yok.'
          : `Bu sayfada ${formatCount(orders.length)} sipariş listeleniyor.`}
        {filters.cursor ? ' Listenin ilk sayfasında değilsiniz.' : ''}
      </p>

      {orders.length === 0 ? (
        <Card padding={0}>
          <Empty message={emptyMessage(filters.awaitingFulfilment, Boolean(filters.cursor))} />
        </Card>
      ) : (
        <DataTable
          head={
            <tr>
              <th scope="col">Sipariş</th>
              <th scope="col">Durum</th>
              <th scope="col">Ödeme</th>
              <th scope="col">Tutar</th>
              <th scope="col">Adet</th>
              <th scope="col">Format</th>
              <th scope="col">Gideceği il</th>
              <th scope="col">Kargo takip</th>
              <th scope="col">Oluşturma</th>
            </tr>
          }
        >
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <Link
                  href={`/orders/${order.id}`}
                  style={{ fontWeight: 600, textDecoration: 'underline' }}
                >
                  {order.orderNumber}
                </Link>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                  {order.printProviderOrderId
                    ? `Matbaa işi: ${order.printProviderOrderId}`
                    : 'Matbaaya gönderilmedi'}
                </div>
              </td>
              <td>
                <Badge label={orderStatusLabel(order.status)} tone={orderStatusTone(order.status)} />
              </td>
              <td>
                <Badge
                  label={paymentStatusLabel(order.paymentStatus)}
                  tone={paymentStatusTone(order.paymentStatus)}
                />
              </td>
              <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{formatMoney(order.total)}</td>
              <td>{formatCount(order.quantity)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {bookFormatLabel(order.bookSize, order.coverType)}
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                  {formatCount(order.pageCount)} sayfa
                </div>
              </td>
              <td>{order.shippingCity ?? '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{order.trackingNumber ?? '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(order.createdAt)}</td>
            </tr>
          ))}
        </DataTable>
      )}

      <nav
        aria-label="Sayfalama"
        style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}
      >
        {filters.cursor ? (
          <Link href={`/orders?${pageQuery(filters, undefined)}`} style={pagerStyle}>
            ← İlk sayfa
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link href={`/orders?${pageQuery(filters, page.nextCursor)}`} style={pagerStyle}>
            Sonraki sayfa →
          </Link>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
            Bu filtrelerin sonuna geldiniz.
          </span>
        )}
      </nav>
    </>
  );
}

const pagerStyle = {
  padding: '9px 14px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  fontSize: 14,
  fontWeight: 600,
} as const;

type ListFilters = AdminOrderListInput;

/** The query the API is asked for; `limit` is left to the server's own default. */
function apiQuery(filters: ListFilters): string {
  const query = new URLSearchParams();
  if (filters.status) query.set('status', filters.status);
  if (filters.paymentStatus) query.set('paymentStatus', filters.paymentStatus);
  if (filters.orderNumber) query.set('orderNumber', filters.orderNumber);
  if (filters.awaitingFulfilment) query.set('awaitingFulfilment', 'true');
  if (filters.cursor) query.set('cursor', filters.cursor);
  return query.toString();
}

/** The same filters as a console URL, with the cursor swapped for the given page. */
function pageQuery(filters: ListFilters, cursor: string | undefined): string {
  const query = new URLSearchParams();
  if (filters.status) query.set('status', filters.status);
  if (filters.paymentStatus) query.set('paymentStatus', filters.paymentStatus);
  if (filters.orderNumber) query.set('orderNumber', filters.orderNumber);
  if (filters.awaitingFulfilment) query.set('awaitingFulfilment', 'true');
  if (cursor) query.set('cursor', cursor);
  return query.toString();
}

function emptyMessage(awaitingFulfilment: boolean, paged: boolean): string {
  if (paged) {
    return 'Bu sayfada sipariş kalmadı. İlk sayfaya dönüp listeyi baştan gözden geçirebilirsiniz.';
  }
  if (awaitingFulfilment) {
    return 'Hazırlanmayı bekleyen sipariş yok. Ödemesi alınan her kitap ya baskıda ya da yola çıkmış.';
  }
  return 'Bu filtrelerle eşleşen sipariş yok.';
}
