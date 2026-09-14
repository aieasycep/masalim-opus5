'use client';

import { useActionState, useState } from 'react';
import type { OrderStatus } from '@masalim/types';
import type { AdminOrderAdvanceStatus } from '@masalim/validation';
import { advanceOrderStatus } from './actions';
import { EMPTY_ORDER_ACTION_STATE } from './action-state';
import { allowedTransitions, transitionCopy } from './transitions';
import {
  fieldErrorStyle,
  fieldLabelStyle,
  hintStyle,
  inputStyle,
  primaryButtonStyle,
} from './form-styles';

/**
 * Moving one order forward.
 *
 * Only the moves the server accepts from this order's current status are
 * offered, so the control is a short list of real next steps rather than a
 * dropdown of every status that mostly produces refusals. Two of the server's
 * rules are stated here before the click and enforced there after it: shipping
 * needs a tracking number, so that option is held closed until one exists, and
 * cancelling asks the printer to recall the job first, so it is described as a
 * request rather than a result and needs an explicit confirmation.
 *
 * When the server refuses anyway, its own sentence is shown — the printer's
 * answer is the whole point of the attempt, and hiding it behind "bir hata
 * oluştu" would leave the operator guessing whether the book is still coming.
 */
export function StatusForm({
  orderId,
  status,
  trackingNumber,
  printProviderOrderId,
}: {
  orderId: string;
  status: OrderStatus;
  trackingNumber: string | null;
  printProviderOrderId: string | null;
}) {
  const [state, formAction, pending] = useActionState(advanceOrderStatus, EMPTY_ORDER_ACTION_STATE);
  const [chosen, setChosen] = useState<AdminOrderAdvanceStatus | null>(null);

  const transitions = allowedTransitions(status);

  // The page revalidates under this component after a successful move, so a
  // selection made before it may no longer be on offer.
  const selected = chosen !== null && transitions.includes(chosen) ? chosen : null;
  const selectedCopy = selected ? transitionCopy(selected) : null;
  const statusFieldError = state.fieldErrors.status;
  const noteFieldError = state.fieldErrors.note;

  if (transitions.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 14, color: 'var(--muted-foreground)' }}>
        Bu durumdaki bir sipariş elle ilerletilemez. Para iadesi konsoldan değil, ödeme
        sağlayıcısı üzerinden yürür.
      </p>
    );
  }

  return (
    <form action={formAction} style={{ display: 'grid', gap: 18 }}>
      <input type="hidden" name="orderId" value={orderId} />

      <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        <legend style={{ padding: 0, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          Sipariş nereye taşınsın?
        </legend>

        {transitions.map((target) => {
          const copy = transitionCopy(target);
          const blocked = target === 'SHIPPED' && !trackingNumber;

          return (
            <label
              key={target}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: '12px 14px',
                borderRadius: 12,
                border: `1px solid ${selected === target ? 'var(--primary)' : 'var(--border)'}`,
                background: blocked ? 'var(--muted)' : 'transparent',
                cursor: blocked ? 'default' : 'pointer',
              }}
            >
              <input
                type="radio"
                name="status"
                value={target}
                checked={selected === target}
                disabled={blocked || pending}
                onChange={() => {
                  setChosen(target);
                }}
                style={{ marginTop: 3 }}
              />
              <span style={{ display: 'grid', gap: 3 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{copy.action}</span>
                <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                  {copy.effect}
                </span>
                {copy.caution ? (
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)' }}>
                    {copy.caution}
                  </span>
                ) : null}
                {blocked ? (
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--destructive)' }}>
                    Bu siparişte takip numarası yok. Önce aşağıdan numarayı ekleyin, sonra
                    kargoya verildi olarak işaretleyin.
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}

        {statusFieldError ? (
          <p role="alert" style={fieldErrorStyle}>
            {statusFieldError}
          </p>
        ) : null}
      </fieldset>

      {selected === 'CANCELLED' ? (
        <label
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <input type="checkbox" name="recallAcknowledged" required style={{ marginTop: 3 }} />
          <span>
            {printProviderOrderId
              ? 'Bu siparişin matbaa işi var. İptal isteği önce matbaaya gider; matbaa baskıya başladıysa siparişi geri çekmez ve iptal gerçekleşmez. Bunu okuduğumu onaylıyorum.'
              : 'Bu siparişin henüz matbaa işi yok, bu yüzden geri çekilecek bir baskı da yok. İptalin ödeme tarafını sağlayıcı üzerinden ayrıca takip etmem gerektiğini biliyorum.'}
          </span>
        </label>
      ) : null}

      <label style={fieldLabelStyle}>
        Not (isteğe bağlı)
        <textarea
          name="note"
          rows={3}
          maxLength={300}
          disabled={pending}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <span style={hintStyle}>
          Denetim kaydına ve sipariş geçmişine düşer; aileye gösterilmez. En fazla 300 karakter.
        </span>
        {noteFieldError ? (
          <span role="alert" style={fieldErrorStyle}>
            {noteFieldError}
          </span>
        ) : null}
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="submit"
          disabled={pending || selected === null}
          style={{
            ...primaryButtonStyle(pending, selected === 'CANCELLED' ? 'danger' : 'primary'),
            opacity: pending || selected === null ? 0.6 : 1,
            cursor: pending || selected === null ? 'default' : 'pointer',
          }}
        >
          {pending ? 'Gönderiliyor…' : (selectedCopy?.action ?? 'Durumu güncelle')}
        </button>
        {selected === null ? (
          <span style={hintStyle}>Devam etmek için yukarıdan bir adım seçin.</span>
        ) : null}
      </div>

      <div aria-live="polite" style={{ display: 'grid', gap: 6 }}>
        {state.outcome === 'success' && state.message ? (
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--success)' }}>
            {state.message}
          </p>
        ) : null}
        {state.outcome === 'error' && state.message ? (
          <p role="alert" style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--destructive)' }}>
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
