'use client';

import { useActionState, useState } from 'react';
import { submitDecision } from './actions';
import { EMPTY_DECISION_STATE } from './decision-state';

/**
 * The form that ends a record's wait.
 *
 * Client-side only because the reason-code field appears with the reject
 * option; the decision itself travels through a Server Action, so nothing about
 * this form puts the admin token in the browser.
 *
 * The two outcomes are worded as what they do to the family, not as buttons:
 * approving hands the story back to the parent, rejecting confirms that a
 * bedtime was refused for a reason we are writing down.
 */
export function DecisionForm({
  recordId,
  classifierReasonCode,
}: {
  recordId: string;
  classifierReasonCode: string | null;
}) {
  const [state, formAction, pending] = useActionState(submitDecision, EMPTY_DECISION_STATE);
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');

  const reasonError = state.fieldErrors.reasonCode;
  const noteError = state.fieldErrors.note;
  const decisionError = state.fieldErrors.decision;
  const suggestedReasonCode = classifierReasonCode
    ? classifierReasonCode.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
    : null;

  return (
    <form action={formAction} style={{ display: 'grid', gap: 18 }}>
      <input type="hidden" name="recordId" value={recordId} />

      <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        <legend style={{ fontWeight: 600, fontSize: 14, padding: 0, marginBottom: 4 }}>
          Kararınız
        </legend>

        <Choice
          checked={decision === 'APPROVE'}
          onSelect={() => {
            setDecision('APPROVE');
          }}
          value="APPROVE"
          title="Masalı serbest bırak"
          description="Filtre yanılmış. Masal onaylı duruma döner ve aile ona yeniden ulaşır."
        />

        <Choice
          checked={decision === 'REJECT'}
          onSelect={() => {
            setDecision('REJECT');
          }}
          value="REJECT"
          title="Reddi onayla"
          description="Filtre haklıymış. Masal reddedilmiş kalır ve verdiğiniz neden kodu kayda geçer."
        />

        {decisionError ? (
          <p role="alert" style={errorTextStyle}>
            {decisionError}
          </p>
        ) : null}
      </fieldset>

      {decision === 'REJECT' ? (
        <label style={labelStyle}>
          Neden kodu
          <input
            name="reasonCode"
            required
            maxLength={60}
            pattern="[A-Za-z0-9_]+"
            autoComplete="off"
            {...(suggestedReasonCode ? { list: 'moderation-reason-codes' } : {})}
            aria-describedby="reason-code-hint"
            {...(reasonError ? { 'aria-invalid': true } : {})}
            style={{ ...inputStyle, textTransform: 'uppercase' }}
          />
          {suggestedReasonCode ? (
            <datalist id="moderation-reason-codes">
              <option value={suggestedReasonCode} />
            </datalist>
          ) : null}
          <span id="reason-code-hint" style={hintStyle}>
            Büyük harf, rakam ve alt çizgi. Aile bu kodu görmez; kodu, filtreyi daha sonra
            ayarlayabilmek için yazıyoruz.
          </span>
          {reasonError ? (
            <span role="alert" style={errorTextStyle}>
              {reasonError}
            </span>
          ) : null}
        </label>
      ) : null}

      <label style={labelStyle}>
        Not{' '}
        <span style={{ fontWeight: 400, color: 'var(--muted-foreground)' }}>(isteğe bağlı)</span>
        <textarea
          name="note"
          rows={3}
          maxLength={500}
          aria-describedby="note-hint"
          {...(noteError ? { 'aria-invalid': true } : {})}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <span id="note-hint" style={hintStyle}>
          En fazla 500 karakter. Kararı aylar sonra okuyacak kişi için yazın.
        </span>
        {noteError ? (
          <span role="alert" style={errorTextStyle}>
            {noteError}
          </span>
        ) : null}
      </label>

      {state.error ? (
        <div
          role="alert"
          style={{
            border: '1px solid var(--destructive)',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 13,
          }}
        >
          <strong style={{ color: 'var(--destructive)' }}>{state.error}</strong>
          {state.serverMessage ? (
            <div style={{ marginTop: 4, color: 'var(--muted-foreground)' }}>
              Sunucunun yanıtı: {state.serverMessage}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button
          type="submit"
          disabled={pending}
          style={{
            padding: '11px 18px',
            borderRadius: 10,
            border: 'none',
            background: decision === 'APPROVE' ? 'var(--primary)' : 'var(--destructive)',
            color:
              decision === 'APPROVE'
                ? 'var(--primary-foreground)'
                : 'var(--destructive-foreground)',
            fontWeight: 600,
            cursor: pending ? 'default' : 'pointer',
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending
            ? 'Kaydediliyor…'
            : decision === 'APPROVE'
              ? 'Masalı serbest bırak'
              : 'Reddi onayla'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
          Karar bir kez verilir; kayıt kuyruktan çıkar ve ikinci bir karar kabul edilmez.
        </span>
      </div>

      <p aria-live="polite" style={{ margin: 0, fontSize: 12, color: 'var(--muted-foreground)' }}>
        {pending ? 'Karar sunucuya gönderiliyor.' : ''}
      </p>
    </form>
  );
}

function Choice({
  checked,
  onSelect,
  value,
  title,
  description,
}: {
  checked: boolean;
  onSelect: () => void;
  value: 'APPROVE' | 'REJECT';
  title: string;
  description: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 10,
        padding: '12px 14px',
        cursor: 'pointer',
      }}
    >
      <input
        type="radio"
        name="decision"
        value={value}
        checked={checked}
        onChange={onSelect}
        style={{ marginTop: 3 }}
      />
      <span>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{title}</span>
        <span
          style={{
            display: 'block',
            fontSize: 13,
            color: 'var(--muted-foreground)',
            marginTop: 2,
          }}
        >
          {description}
        </span>
      </span>
    </label>
  );
}

const labelStyle = {
  display: 'grid',
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
} as const;

const inputStyle = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--background)',
  fontWeight: 400,
} as const;

const hintStyle = {
  fontSize: 12,
  fontWeight: 400,
  color: 'var(--muted-foreground)',
} as const;

const errorTextStyle = {
  margin: 0,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--destructive)',
} as const;
