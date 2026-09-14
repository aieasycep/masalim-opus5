'use server';

import { revalidatePath } from 'next/cache';
import {
  adminOrderAdvanceSchema,
  adminOrderTrackingSchema,
  type AdminOrderAdvanceInput,
  type AdminOrderTrackingInput,
} from '@masalim/validation';
import type { AdminOrderDto } from '@masalim/types';
import { AdminApiError, adminApi } from '../../../src/lib/api';
import type { OrderActionState } from './action-state';
import { orderStatusLabel } from './format';

/**
 * The two mutations the fulfilment desk performs.
 *
 * Both run on the server so the admin token stays here, both re-validate with
 * the API's own schemas before spending a request, and both revalidate the list
 * and the order's own page afterwards — a status the operator can no longer act
 * on must stop offering the buttons that moved it.
 *
 * Neither one promises an outcome. The API decides whether an order may ship
 * without a tracking number and whether the printer will recall a job, and when
 * it says no, its sentence is carried back word for word rather than replaced
 * with a shrug.
 */

/** Validation codes these two schemas raise, in the operator's language. */
/**
 * Zod's own message is never shown.
 *
 * Schemas in @masalim/validation raise stable codes for the cases worth naming,
 * but the built-in checks still carry English defaults, and this console is
 * Turkish-only. An unmapped issue falls back to a general Turkish line.
 */
const GENERIC_FIELD_MESSAGE = 'Bu alan geçerli değil.';

const FIELD_MESSAGES: Record<string, string> = {
  TRACKING_NUMBER_TOO_SHORT: 'Takip numarası en az 4 karakter olmalı.',
  TRACKING_NUMBER_TOO_LONG: 'Takip numarası en fazla 64 karakter olabilir.',
  TRACKING_NUMBER_INVALID: 'Takip numarası yalnızca harf, rakam ve tire içerebilir.',
  CARRIER_TOO_SHORT: 'Kargo firması en az 2 karakter olmalı.',
  CARRIER_TOO_LONG: 'Kargo firması en fazla 40 karakter olabilir.',
  TEXT_TOO_LONG: 'Not en fazla 300 karakter olabilir.',
};

function failed(
  message: string,
  serverMessage: string | null,
  fieldErrors: Record<string, string> = {},
): OrderActionState {
  return { outcome: 'error', message, serverMessage, fieldErrors };
}

function fieldErrorsOf(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>, fallbackField: string) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const first = issue.path[0];
    const field = typeof first === 'string' ? first : fallbackField;
    if (!(field in fieldErrors)) {
      fieldErrors[field] = FIELD_MESSAGES[issue.message] ?? GENERIC_FIELD_MESSAGE;
    }
  }
  return fieldErrors;
}

export async function advanceOrderStatus(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderId = String(formData.get('orderId') ?? '').trim();
  if (!orderId) {
    return failed('Sipariş kimliği okunamadı. Sayfayı yenileyip tekrar deneyin.', null);
  }

  const status = String(formData.get('status') ?? '').trim();
  if (!status) {
    return failed('Önce siparişin taşınacağı durumu seçin.', null, {
      status: 'Bir durum seçilmedi.',
    });
  }

  const note = String(formData.get('note') ?? '').trim();

  const parsed = adminOrderAdvanceSchema.safeParse({
    status,
    ...(note ? { note } : {}),
  });
  if (!parsed.success) {
    return failed(
      'Durum değişikliği gönderilmedi. Aşağıdaki alanları düzeltin.',
      null,
      fieldErrorsOf(parsed.error.issues, 'status'),
    );
  }

  const body: AdminOrderAdvanceInput = parsed.data;

  let order: AdminOrderDto;
  try {
    order = await adminApi<AdminOrderDto>(`admin/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'POST',
      body,
    });
  } catch (error) {
    if (error instanceof AdminApiError) {
      return failed(advanceMessageFor(error, body.status), `${error.code} — ${error.message}`);
    }
    throw error;
  }

  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);

  return {
    outcome: 'success',
    message: `Sipariş ${order.orderNumber} artık "${orderStatusLabel(order.status)}" durumunda.`,
    serverMessage: null,
    fieldErrors: {},
  };
}

export async function attachOrderTracking(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderId = String(formData.get('orderId') ?? '').trim();
  if (!orderId) {
    return failed('Sipariş kimliği okunamadı. Sayfayı yenileyip tekrar deneyin.', null);
  }

  // Upper-cased here rather than refused: carriers print their codes in capitals
  // and a lower-case paste is a slip, not a different shipment.
  const trackingNumber = String(formData.get('trackingNumber') ?? '')
    .trim()
    .toUpperCase();
  const carrier = String(formData.get('carrier') ?? '').trim();

  const parsed = adminOrderTrackingSchema.safeParse({
    trackingNumber,
    ...(carrier ? { carrier } : {}),
  });
  if (!parsed.success) {
    return failed(
      'Takip numarası kaydedilmedi. Aşağıdaki alanları düzeltin.',
      null,
      fieldErrorsOf(parsed.error.issues, 'trackingNumber'),
    );
  }

  const body: AdminOrderTrackingInput = parsed.data;

  let order: AdminOrderDto;
  try {
    order = await adminApi<AdminOrderDto>(`admin/orders/${encodeURIComponent(orderId)}/tracking`, {
      method: 'POST',
      body,
    });
  } catch (error) {
    if (error instanceof AdminApiError) {
      return failed(trackingMessageFor(error), `${error.code} — ${error.message}`);
    }
    throw error;
  }

  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);

  const shipped = order.status === 'SHIPPED';
  return {
    outcome: 'success',
    message: shipped
      ? `Takip numarası ${order.trackingNumber ?? body.trackingNumber} olarak kaydedildi. Sipariş kargoda olduğu için, numara değiştiyse aileye güncel numarayla yeniden bildirim gönderildi.`
      : `Takip numarası ${order.trackingNumber ?? body.trackingNumber} olarak kaydedildi.`,
    serverMessage: null,
    fieldErrors: {},
  };
}

function advanceMessageFor(error: AdminApiError, target: AdminOrderAdvanceInput['status']): string {
  if (error.status === 403) {
    return 'Bu işlemi yapma yetkiniz yok. Sipariş işlemleri ADMIN ve OPERATIONS rollerine açıktır.';
  }
  if (error.status === 404) {
    return 'Bu sipariş bulunamadı. Silinmiş ya da adres yanlış olabilir.';
  }
  // The API separates these two, and so must the copy: ORDER_NOT_CANCELLABLE is
  // purely a transition-table refusal — the printer was never asked — while a
  // printer that will not recall the job comes back as a plain 409. Telling an
  // operator the press is still running when it was never contacted sends them
  // to phone a supplier about nothing.
  if (error.code === 'ORDER_NOT_CANCELLABLE') {
    return 'Sipariş bu durumdan iptal edilemiyor. Sunucu bu geçişe izin vermiyor.';
  }
  if (error.status === 409) {
    if (target === 'SHIPPED') {
      return 'Sipariş kargoda olarak işaretlenmedi. Takip numarası eksikse ya da başka bir operatör durumu sizden önce değiştirdiyse sunucu işlemi reddeder.';
    }
    if (target === 'CANCELLED') {
      return 'Sipariş iptal edilmedi. Matbaa baskıyı geri çekmeyi kabul etmemiş olabilir; bu durumda kitap basılmaya devam eder.';
    }
    return 'Durum değişikliği kabul edilmedi. Başka bir operatör siparişi sizden önce ilerletmiş olabilir.';
  }
  if (error.status === 400 || error.status === 422) {
    return 'Sunucu gönderilen durum değişikliğini kabul etmedi.';
  }
  return 'Durum değiştirilemedi. Bağlantı ya da sunucu tarafında bir sorun var.';
}

function trackingMessageFor(error: AdminApiError): string {
  if (error.status === 403) {
    return 'Bu işlemi yapma yetkiniz yok. Sipariş işlemleri ADMIN ve OPERATIONS rollerine açıktır.';
  }
  if (error.status === 404) {
    return 'Bu sipariş bulunamadı. Silinmiş ya da adres yanlış olabilir.';
  }
  if (error.status === 409) {
    return 'Takip numarası kaydedilmedi. Sipariş artık takip edilecek bir aşamada değil ya da durumu bu sırada değişmiş olabilir.';
  }
  if (error.status === 400 || error.status === 422) {
    return 'Sunucu gönderilen takip numarasını kabul etmedi.';
  }
  return 'Takip numarası kaydedilemedi. Bağlantı ya da sunucu tarafında bir sorun var.';
}
