'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminModerationDecisionSchema } from '@masalim/validation';
import type { AdminModerationDecisionInput } from '@masalim/validation';
import type { AdminModerationRecordDto } from '@masalim/types';
import { AdminApiError, adminApi } from '../../../src/lib/api';
import type { DecisionState } from './decision-state';

/**
 * The one mutation this section performs: settling a queued record.
 *
 * It runs on the server so the admin token stays here, and it revalidates both
 * the queue and the record's own page before redirecting, because a decided
 * record leaves the queue and a stale list would invite a second reviewer to
 * open something already answered.
 */

/** Validation codes the decision schema raises, in the reviewer's language. */
/**
 * Zod's own message is never shown.
 *
 * Schemas in @masalim/validation raise stable codes for the cases worth naming,
 * but the built-in checks (min, max, int) still carry English defaults. Passing
 * those through would put "Number must be less than or equal to 100" into a
 * Turkish console, so an unmapped issue falls back to a general Turkish line.
 */
const GENERIC_FIELD_MESSAGE = 'Bu alan geçerli değil.';

const FIELD_MESSAGES: Record<string, string> = {
  REASON_CODE_REQUIRED: 'Ret kararı bir neden kodu gerektirir.',
  REASON_CODE_INVALID:
    'Neden kodu yalnızca büyük harf, rakam ve alt çizgi içerebilir. Örnek: YASA_UYGUN_DEGIL',
  REASON_CODE_TOO_LONG: 'Neden kodu en fazla 60 karakter olabilir.',
  TEXT_TOO_LONG: 'Not en fazla 500 karakter olabilir.',
};

function failed(
  error: string,
  serverMessage: string | null,
  fieldErrors: Record<string, string> = {},
): DecisionState {
  return { error, serverMessage, fieldErrors };
}

export async function submitDecision(
  _previous: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const recordId = String(formData.get('recordId') ?? '').trim();
  if (!recordId) {
    return failed('Kayıt kimliği okunamadı. Sayfayı yenileyip tekrar deneyin.', null);
  }

  const decision = String(formData.get('decision') ?? '').trim();
  // Uppercased here rather than refused: the schema wants a canonical code and
  // typing one in lower case is a slip, not a different decision.
  const reasonCode = String(formData.get('reasonCode') ?? '')
    .trim()
    .toUpperCase();
  const note = String(formData.get('note') ?? '').trim();

  const candidate = {
    decision,
    ...(reasonCode ? { reasonCode } : {}),
    ...(note ? { note } : {}),
  };

  const parsed = adminModerationDecisionSchema.safeParse(candidate);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = typeof issue.path[0] === 'string' ? issue.path[0] : 'decision';
      if (!(field in fieldErrors)) {
        fieldErrors[field] = FIELD_MESSAGES[issue.message] ?? GENERIC_FIELD_MESSAGE;
      }
    }
    return failed('Karar kaydedilmedi. Aşağıdaki alanları düzeltin.', null, fieldErrors);
  }

  const body: AdminModerationDecisionInput = parsed.data;

  let record: AdminModerationRecordDto;
  try {
    record = await adminApi<AdminModerationRecordDto>(`admin/moderation/${encodeURIComponent(recordId)}/decision`, {
      method: 'POST',
      body,
    });
  } catch (error) {
    if (error instanceof AdminApiError) {
      return failed(messageForStatus(error.status), `${error.code} — ${error.message}`);
    }
    throw error;
  }

  revalidatePath('/moderation');
  revalidatePath(`/moderation/${recordId}`);

  const outcome = record.reviewOutcome ?? 'REJECTED';
  redirect(`/moderation?sonuc=${outcome}&kayit=${encodeURIComponent(recordId)}`);
}

function messageForStatus(status: number): string {
  if (status === 403) {
    return 'Bu kararı verme yetkiniz yok. Moderasyon kararları ADMIN ve SUPPORT rollerine açıktır.';
  }
  if (status === 404) {
    return 'Bu kayıt bulunamadı. Silinmiş ya da adres yanlış olabilir.';
  }
  if (status === 409) {
    return 'Bu kayıt zaten karara bağlanmış. Başka bir operatör sizden önce davranmış olabilir.';
  }
  if (status === 400 || status === 422) {
    return 'Sunucu gönderilen kararı kabul etmedi.';
  }
  return 'Karar kaydedilemedi. Bağlantı ya da sunucu tarafında bir sorun var.';
}
