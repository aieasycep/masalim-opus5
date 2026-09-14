'use client';

import { useActionState } from 'react';
import type { OrderStatus } from '@masalim/types';
import { attachOrderTracking } from './actions';
import { EMPTY_ORDER_ACTION_STATE } from './action-state';
import {
  fieldErrorStyle,
  fieldLabelStyle,
  hintStyle,
  inputStyle,
  primaryButtonStyle,
} from './form-styles';

/**
 * Attaching or correcting the shipment's tracking number.
 *
 * The number is what the parent's "kargoya verildi" notification quotes, which
 * is why it exists before the status moves and why correcting it on an already
 * shipped order is announced here as something the family will hear about again
 * — a silent correction leaves them holding a code that tracks nothing.
 */
export function TrackingForm({
  orderId,
  status,
  trackingNumber,
}: {
  orderId: string;
  status: OrderStatus;
  trackingNumber: string | null;
}) {
  const [state, formAction, pending] = useActionState(attachOrderTracking, EMPTY_ORDER_ACTION_STATE);

  const trackingFieldError = state.fieldErrors.trackingNumber;
  const carrierFieldError = state.fieldErrors.carrier;

  return (
    <form action={formAction} style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
      <input type="hidden" name="orderId" value={orderId} />

      {status === 'SHIPPED' && trackingNumber ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--foreground)' }}>
          Sipariş kargoda ve aileye <strong>{trackingNumber}</strong> numarası bildirildi.
          Numarayı değiştirirsen aileye güncel numarayla yeni bir bildirim gönderilir.
        </p>
      ) : null}

      <label style={fieldLabelStyle}>
        Takip numarası
        <input
          type="text"
          name="trackingNumber"
          required
          minLength={4}
          maxLength={64}
          defaultValue={trackingNumber ?? ''}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="tracking-hint"
          style={inputStyle}
        />
        <span id="tracking-hint" style={hintStyle}>
          Kargo firmasının verdiği numara: 4-64 karakter, yalnızca harf, rakam ve tire.
        </span>
        {trackingFieldError ? (
          <span role="alert" style={fieldErrorStyle}>
            {trackingFieldError}
          </span>
        ) : null}
      </label>

      <label style={fieldLabelStyle}>
        Kargo firması (isteğe bağlı)
        <input
          type="text"
          name="carrier"
          minLength={2}
          maxLength={40}
          autoComplete="off"
          aria-describedby="carrier-hint"
          style={inputStyle}
        />
        <span id="carrier-hint" style={hintStyle}>
          Sipariş geçmişine ve denetim kaydına yazılır; takip numarasının yanında saklanmaz.
        </span>
        {carrierFieldError ? (
          <span role="alert" style={fieldErrorStyle}>
            {carrierFieldError}
          </span>
        ) : null}
      </label>

      <div>
        <button type="submit" disabled={pending} style={primaryButtonStyle(pending, 'primary')}>
          {pending ? 'Kaydediliyor…' : trackingNumber ? 'Numarayı güncelle' : 'Numarayı kaydet'}
        </button>
      </div>

      <div aria-live="polite" style={{ display: 'grid', gap: 6 }}>
        {state.outcome === 'success' && state.message ? (
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--success)' }}>
            {state.message}
          </p>
        ) : null}
        {state.outcome === 'error' && state.message ? (
          <p
            role="alert"
            style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--destructive)' }}
          >
            {state.message}
          </p>
        ) : null}
        {state.serverMessage ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-foreground)' }}>
            Sunucunun yanıtı: {state.serverMessage}
          </p>
        ) : null}
      </div>
    </form>
  );
}
