'use server';

import { revalidatePath } from 'next/cache';
import {
  adminFeatureFlagKeySchema,
  adminFeatureFlagUpdateSchema,
  type AdminFeatureFlagUpdateInput,
} from '@masalim/validation';
import type { AdminFeatureFlagDto } from '@masalim/types';
import { AdminApiError, adminApi } from '../../../src/lib/api';
import type { FlagActionState } from './action-state';
import { FLAG_REASON_MAX_LENGTH } from './action-state';
import { flagLabel, formatPercentage } from './flag-copy';

/**
 * The one mutation this page performs.
 *
 * It runs on the server so the admin token stays here, re-validates with the
 * API's own schemas before spending a request, and revalidates the page
 * afterwards so what is on screen is what the API stored — including the new
 * "last changed" line, which is the only record an operator has of their own
 * change having landed.
 *
 * The acknowledgement checkbox is re-checked here rather than trusted to the
 * browser. A flag moves the product for every family at once, and a request
 * that arrives without the confirmation the interface demands is one this
 * action has no business forwarding.
 */

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
  TEXT_TOO_LONG: `Gerekçe en fazla ${FLAG_REASON_MAX_LENGTH} karakter olabilir.`,
};

function failed(
  message: string,
  serverMessage: string | null,
  fieldErrors: Record<string, string> = {},
): FlagActionState {
  return { outcome: 'error', message, serverMessage, fieldErrors };
}

export async function updateFeatureFlag(
  _previous: FlagActionState,
  formData: FormData,
): Promise<FlagActionState> {
  const parsedKey = adminFeatureFlagKeySchema.safeParse(String(formData.get('key') ?? ''));
  if (!parsedKey.success) {
    return failed('Bayrak anahtarı okunamadı. Sayfayı yenileyip tekrar deneyin.', null);
  }
  const key = parsedKey.data;
  const name = `“${flagLabel(key)}” (${key})`;

  const rawEnabled = String(formData.get('enabled') ?? '');
  if (rawEnabled !== 'true' && rawEnabled !== 'false') {
    return failed('Bayrağın hangi yöne alınacağı okunamadı. Sayfayı yenileyip tekrar deneyin.', null);
  }
  const enabled = rawEnabled === 'true';

  if (formData.get('acknowledged') !== 'on') {
    return failed(
      'Değişiklik gönderilmedi. Devam etmeden önce onay kutusunu işaretlemeniz gerekiyor.',
      null,
      { acknowledged: 'Bu kutu işaretlenmeden bayrak değiştirilemez.' },
    );
  }

  // Only sent when the flag is being left on: a rollout percentage attached to
  // a flag that is going off would rewrite a number nobody was asked about.
  const rawRollout = String(formData.get('rolloutPercentage') ?? '').trim();
  let rolloutPercentage: number | undefined;
  if (enabled && rawRollout.length > 0) {
    const value = Number(rawRollout);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      return failed('Değişiklik gönderilmedi. Kademe yüzdesini düzeltin.', null, {
        rolloutPercentage: 'Kademe 0 ile 100 arasında bir tam sayı olmalı.',
      });
    }
    rolloutPercentage = value;
  }

  const reason = String(formData.get('reason') ?? '').trim();

  const parsed = adminFeatureFlagUpdateSchema.safeParse({
    enabled,
    ...(rolloutPercentage !== undefined ? { rolloutPercentage } : {}),
    ...(reason ? { reason } : {}),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const first = issue.path[0];
      const field = typeof first === 'string' ? first : 'enabled';
      if (!(field in fieldErrors)) {
        fieldErrors[field] = FIELD_MESSAGES[issue.message] ?? GENERIC_FIELD_MESSAGE;
      }
    }
    return failed('Değişiklik gönderilmedi. Aşağıdaki alanları düzeltin.', null, fieldErrors);
  }

  const body: AdminFeatureFlagUpdateInput = parsed.data;

  let flag: AdminFeatureFlagDto;
  try {
    flag = await adminApi<AdminFeatureFlagDto>(`admin/feature-flags/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body,
    });
  } catch (error) {
    if (error instanceof AdminApiError) {
      return failed(messageFor(error, name), `${error.code} — ${error.message}`);
    }
    throw error;
  }

  revalidatePath('/feature-flags');

  return {
    outcome: 'success',
    message: successMessage(flag, name),
    serverMessage: null,
    fieldErrors: {},
  };
}

function successMessage(flag: AdminFeatureFlagDto, name: string): string {
  if (!flag.enabled) {
    return `${name} bayrağı kapatıldı. Değişiklik tüm ailelerde geçerli ve denetim kaydına yazıldı.`;
  }
  if (flag.rolloutPercentage >= 100) {
    return `${name} bayrağı açıldı. Değişiklik tüm ailelerde geçerli ve denetim kaydına yazıldı.`;
  }
  return `${name} bayrağı ${formatPercentage(flag.rolloutPercentage)} kademeyle açıldı. Değişiklik denetim kaydına yazıldı.`;
}

function messageFor(error: AdminApiError, name: string): string {
  if (error.status === 403) {
    return 'Bu işlemi yapma yetkiniz yok. Özellik bayrakları yalnızca ADMIN rolüne açıktır.';
  }
  if (error.status === 404) {
    return `${name} bayrağı sunucuda tanınmıyor. Anahtar koddan kaldırılmış olabilir; listeyi yenileyin.`;
  }
  if (error.status === 400 || error.status === 422) {
    return 'Sunucu gönderilen değeri kabul etmedi. Bayrak değişmedi.';
  }
  return 'Bayrak değiştirilemedi. Bağlantı ya da sunucu tarafında bir sorun var; ekrandaki değer hâlâ eski değer.';
}
