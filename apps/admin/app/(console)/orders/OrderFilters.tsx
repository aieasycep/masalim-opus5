import { ORDER_STATUSES, PAYMENT_STATUSES } from '@masalim/types';
import type { OrderStatus, PaymentStatus } from '@masalim/types';
import { Card } from '../../../src/components/ui';
import { orderStatusLabel, paymentStatusLabel } from './format';
import { fieldLabelStyle, hintStyle, inputStyle } from './form-styles';

/**
 * The filters over the fulfilment list.
 *
 * A plain GET form: the whole page is server-rendered, so the filters can be
 * links-with-fields rather than client state, and the resulting URL is
 * shareable between operators working the same backlog.
 *
 * The cursor is deliberately not a field here — changing a filter starts the
 * list again from the top, because a cursor taken from a differently filtered
 * query points at nothing meaningful.
 */
export function OrderFilters({
  status,
  paymentStatus,
  orderNumber,
  awaitingFulfilment,
}: {
  status: OrderStatus | undefined;
  paymentStatus: PaymentStatus | undefined;
  orderNumber: string | undefined;
  awaitingFulfilment: boolean;
}) {
  return (
    <Card style={{ marginBottom: 20 }} padding={16}>
      <form
        method="get"
        action="/orders"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}
      >
        <label style={{ ...fieldLabelStyle, minWidth: 190 }}>
          Sipariş durumu
          <select name="status" defaultValue={status ?? ''} style={inputStyle}>
            <option value="">Tümü</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {orderStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label style={{ ...fieldLabelStyle, minWidth: 190 }}>
          Ödeme durumu
          <select name="paymentStatus" defaultValue={paymentStatus ?? ''} style={inputStyle}>
            <option value="">Tümü</option>
            {PAYMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {paymentStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label style={{ ...fieldLabelStyle, minWidth: 190 }}>
          Sipariş numarası
          <input
            type="search"
            name="orderNumber"
            defaultValue={orderNumber ?? ''}
            minLength={3}
            maxLength={40}
            placeholder="En az 3 karakter"
            autoComplete="off"
            style={inputStyle}
          />
        </label>

        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            fontSize: 13,
            fontWeight: 600,
            maxWidth: 280,
          }}
        >
          <input
            type="checkbox"
            name="awaitingFulfilment"
            value="true"
            defaultChecked={awaitingFulfilment}
            style={{ marginTop: 3 }}
          />
          <span>
            Yalnızca hazırlanmayı bekleyenler
            <span style={{ ...hintStyle, display: 'block', marginTop: 2 }}>
              Ödemesi alınmış, henüz kargoya verilmemiş siparişler. Yukarıda bir sipariş
              durumu seçiliyse bu kutu dikkate alınmaz.
            </span>
          </span>
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Filtrele
          </button>
          <a
            href="/orders"
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Sıfırla
          </a>
        </div>
      </form>
    </Card>
  );
}
