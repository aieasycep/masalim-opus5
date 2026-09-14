'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { updateFeatureFlag } from './actions';
import { EMPTY_FLAG_ACTION_STATE, FLAG_REASON_MAX_LENGTH } from './action-state';
import { flagChangeSentence, flagLabel, formatPercentage } from './flag-copy';
import {
  actionButtonStyle,
  fieldErrorStyle,
  fieldLabelStyle,
  hintStyle,
  inputStyle,
} from './styles';

/**
 * One flag's switch, with the step that stands between a click and a rollout.
 *
 * A flag is not a preference: flipping one changes the product for every family
 * on the service at once, and the operator doing it usually cannot see the
 * consequence from this screen. So the control is deliberately two moves rather
 * than one — the first opens a panel that names the flag by key, says which
 * direction it is going and who it will reach, and refuses to submit until that
 * sentence has been acknowledged. The delay is the point.
 *
 * The rollout percentage is only offered while the flag is on, because a
 * proportion of a switched-off feature is not a number anyone can act on, and
 * sending one would quietly overwrite the value the next person turning the flag
 * back on would expect to find.
 */

type Mode = 'closed' | 'flip' | 'rollout';

export function FlagControl({
  flagKey,
  enabled,
  rolloutPercentage,
}: {
  flagKey: string;
  enabled: boolean;
  rolloutPercentage: number;
}) {
  const [state, formAction, pending] = useActionState(updateFeatureFlag, EMPTY_FLAG_ACTION_STATE);
  const [mode, setMode] = useState<Mode>('closed');
  const [rolloutInput, setRolloutInput] = useState(String(rolloutPercentage));
  const fieldId = useId();

  // The page revalidates under this component after a change lands, so the
  // panel closes and re-reads the new state rather than sitting open on the
  // values it was opened with.
  useEffect(() => {
    if (state.outcome === 'success') setMode('closed');
  }, [state]);

  const label = flagLabel(flagKey);
  const intendedEnabled = mode === 'flip' ? !enabled : enabled;

  const parsedRollout = Number(rolloutInput.trim());
  const rolloutValid =
    rolloutInput.trim().length > 0 &&
    Number.isInteger(parsedRollout) &&
    parsedRollout >= 0 &&
    parsedRollout <= 100;
  const previewRollout = intendedEnabled && rolloutValid ? parsedRollout : rolloutPercentage;

  // A rollout edit that changes nothing would still write an audit entry, so it
  // is held closed rather than sent.
  const unchangedRollout = mode === 'rollout' && rolloutValid && parsedRollout === rolloutPercentage;
  const blocked = pending || (intendedEnabled && !rolloutValid) || unchangedRollout;

  function open(next: Exclude<Mode, 'closed'>) {
    setRolloutInput(String(rolloutPercentage));
    setMode(next);
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {mode === 'closed' ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              open('flip');
            }}
            style={actionButtonStyle(enabled ? 'danger' : 'primary', false)}
          >
            {enabled ? `${label} özelliğini kapat` : `${label} özelliğini aç`}
          </button>
          {enabled ? (
            <button
              type="button"
              onClick={() => {
                open('rollout');
              }}
              style={actionButtonStyle('quiet', false)}
            >
              Kademeyi değiştir
            </button>
          ) : null}
        </div>
      ) : (
        <form
          action={formAction}
          aria-label={`${label} bayrağı için onay`}
          style={{
            display: 'grid',
            gap: 16,
            padding: 18,
            borderRadius: 12,
            border: `1px solid ${intendedEnabled ? 'var(--primary)' : 'var(--destructive)'}`,
            background: 'var(--muted)',
          }}
        >
          <input type="hidden" name="key" value={flagKey} />
          <input type="hidden" name="enabled" value={intendedEnabled ? 'true' : 'false'} />

          <div style={{ display: 'grid', gap: 6 }}>
            <strong style={{ fontSize: 15 }}>
              {mode === 'flip'
                ? intendedEnabled
                  ? 'Bu bayrağı açmak üzeresiniz'
                  : 'Bu bayrağı kapatmak üzeresiniz'
                : 'Bu bayrağın kademesini değiştirmek üzeresiniz'}
            </strong>
            <p style={{ margin: 0, fontSize: 14 }}>
              {flagChangeSentence(flagKey, intendedEnabled, previewRollout)}
            </p>
            <p style={{ ...hintStyle, fontSize: 13 }}>
              Şu anki durum: {enabled ? 'açık' : 'kapalı'}
              {enabled ? `, kademe ${formatPercentage(rolloutPercentage)}` : ''}. Değişiklik anında
              geçerli olur ve adınızla denetim kaydına yazılır.
            </p>
          </div>

          {intendedEnabled ? (
            <label htmlFor={`${fieldId}-rollout`} style={fieldLabelStyle}>
              Kademe yüzdesi
              <input
                id={`${fieldId}-rollout`}
                name="rolloutPercentage"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                required
                value={rolloutInput}
                disabled={pending}
                onChange={(event) => {
                  setRolloutInput(event.target.value);
                }}
                aria-describedby={`${fieldId}-rollout-hint`}
                style={{ ...inputStyle, maxWidth: 160 }}
              />
              <span id={`${fieldId}-rollout-hint`} style={hintStyle}>
                0 ile 100 arasında bir tam sayı. 100, özelliğin bütün ailelere açılması demektir.
              </span>
              {!rolloutValid ? (
                <span role="alert" style={fieldErrorStyle}>
                  Kademe 0 ile 100 arasında bir tam sayı olmalı.
                </span>
              ) : null}
              {state.fieldErrors.rolloutPercentage ? (
                <span role="alert" style={fieldErrorStyle}>
                  {state.fieldErrors.rolloutPercentage}
                </span>
              ) : null}
            </label>
          ) : null}

          <label htmlFor={`${fieldId}-reason`} style={fieldLabelStyle}>
            Gerekçe (isteğe bağlı)
            <textarea
              id={`${fieldId}-reason`}
              name="reason"
              rows={2}
              maxLength={FLAG_REASON_MAX_LENGTH}
              disabled={pending}
              aria-describedby={`${fieldId}-reason-hint`}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <span id={`${fieldId}-reason-hint`} style={hintStyle}>
              Denetim kaydına düşer, ailelere gösterilmez. En fazla {FLAG_REASON_MAX_LENGTH}{' '}
              karakter. Aylar sonra bu değişikliği soran kişi burada yazanı okuyacak.
            </span>
            {state.fieldErrors.reason ? (
              <span role="alert" style={fieldErrorStyle}>
                {state.fieldErrors.reason}
              </span>
            ) : null}
          </label>

          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <input
              type="checkbox"
              name="acknowledged"
              required
              disabled={pending}
              style={{ marginTop: 3 }}
            />
            <span>
              {intendedEnabled
                ? `${flagKey} bayrağını açmayı ve bunun hizmeti kullanan tüm ailelerde geçerli olacağını onaylıyorum.`
                : `${flagKey} bayrağını kapatmayı ve bu özelliğin tüm ailelerde erişilemez olacağını onaylıyorum.`}
            </span>
          </label>
          {state.fieldErrors.acknowledged ? (
            <p role="alert" style={fieldErrorStyle}>
              {state.fieldErrors.acknowledged}
            </p>
          ) : null}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="submit"
              disabled={blocked}
              style={actionButtonStyle(intendedEnabled ? 'primary' : 'danger', blocked)}
            >
              {pending
                ? 'Gönderiliyor…'
                : mode === 'rollout'
                  ? `Evet, kademeyi ${formatPercentage(previewRollout)} yap`
                  : intendedEnabled
                    ? 'Evet, bayrağı aç'
                    : 'Evet, bayrağı kapat'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('closed');
              }}
              disabled={pending}
              style={actionButtonStyle('quiet', pending)}
            >
              Vazgeç
            </button>
            {unchangedRollout ? (
              <span style={hintStyle}>
                Kademe zaten {formatPercentage(rolloutPercentage)}. Değiştirmek için başka bir değer
                yazın.
              </span>
            ) : null}
          </div>
        </form>
      )}

      <div aria-live="polite" style={{ display: 'grid', gap: 4 }}>
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
    </div>
  );
}
