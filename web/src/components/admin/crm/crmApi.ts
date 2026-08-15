import { api } from '@/api/client';

export type CrmSegment = 'ALL' | 'FREQUENT' | 'NEW' | 'INACTIVE' | 'BIRTHDAY';

export const SEGMENT_LABELS: Record<CrmSegment, string> = {
  ALL: 'Todos',
  FREQUENT: 'Frecuentes',
  NEW: 'Nuevos',
  INACTIVE: 'Inactivos',
  BIRTHDAY: 'Cumpleañeros',
};

export interface CrmCustomer {
  id: string;
  name: string;
  phone: string;
  idNumber: string | null;
  address: string | null;
  email: string | null;
  birthday: string | null;
  notes: string | null;
  createdAt: string;
  visits: number;
  totalBase: string;
  lastVisit: string | null;
}

export interface CrmSummary {
  total: number;
  frequent: number;
  new: number;
  inactive: number;
  birthday: number;
}

export interface CrmProfile extends Omit<CrmCustomer, 'visits' | 'totalBase' | 'lastVisit'> {
  history: { date: string; detail: string; amountBase: string }[];
  promotions: { id: string; name: string; code: string; isActive: boolean; endsAt: string | null; sentAt: string | null }[];
  redemptions: { id: string; promotionName: string; code: string; amountBase: string; createdAt: string }[];
}

export interface PromotionRow {
  id: string;
  name: string;
  code: string;
  message: string | null;
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: string;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  expired: boolean;
  segment: string | null;
  maxPerCustomer: number;
  restrictToTargets: boolean;
  createdAt: string;
  targetCount: number;
  sentCount: number;
  redemptionCount: number;
  redeemedBase: string;
}

export interface PromotionDetail extends Omit<PromotionRow, 'targetCount' | 'sentCount' | 'redemptionCount' | 'redeemedBase'> {
  targets: { customerId: string; name: string; phone: string; sentAt: string | null }[];
  redemptions: { id: string; customerName: string; amountBase: string; sourceRef: string | null; createdAt: string }[];
}

export const crmApi = {
  customers: (params: { search?: string; segment?: CrmSegment }) =>
    api
      .get<{ data: { customers: CrmCustomer[]; summary: CrmSummary } }>('/customers', { params })
      .then((r) => r.data.data),
  profile: (id: string) => api.get<{ data: CrmProfile }>(`/customers/${id}`).then((r) => r.data.data),
  createCustomer: (body: Partial<CrmCustomer>) =>
    api.post<{ data: CrmCustomer }>('/customers', body).then((r) => r.data.data),
  updateCustomer: (id: string, body: Partial<CrmCustomer>) =>
    api.patch<{ data: CrmCustomer }>(`/customers/${id}`, body).then((r) => r.data.data),
  deleteCustomer: (id: string) => api.delete(`/customers/${id}`).then((r) => r.data),

  promotions: () => api.get<{ data: PromotionRow[] }>('/promotions').then((r) => r.data.data),
  promotionDetail: (id: string) => api.get<{ data: PromotionDetail }>(`/promotions/${id}`).then((r) => r.data.data),
  createPromotion: (body: Record<string, unknown>) =>
    api.post<{ data: PromotionRow }>('/promotions', body).then((r) => r.data.data),
  updatePromotion: (id: string, body: Record<string, unknown>) =>
    api.patch<{ data: PromotionRow }>(`/promotions/${id}`, body).then((r) => r.data.data),
  deletePromotion: (id: string) => api.delete(`/promotions/${id}`).then((r) => r.data),
  markSent: (id: string, customerId: string) => api.post(`/promotions/${id}/targets/${customerId}/sent`),
};

/** Teléfono → formato wa.me: solo dígitos, con 58 en vez del 0 inicial venezolano. */
export function waPhoneOf(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('0') ? `58${digits.slice(1)}` : digits;
}

/** El mensaje personalizado de la campaña para UN cliente. */
export function buildPromoMessage(
  promo: Pick<PromotionRow, 'message' | 'name' | 'code' | 'discountType' | 'discountValue' | 'endsAt'>,
  customerName: string,
  symbol: string,
): string {
  const discount =
    promo.discountType === 'PERCENT' ? `${Number(promo.discountValue)}%` : `${symbol}${Number(promo.discountValue).toFixed(2)}`;
  const vigencia = promo.endsAt ? `Válida hasta el ${new Date(promo.endsAt).toLocaleDateString('es-VE')}.` : '';
  const template =
    promo.message?.trim() ||
    `¡Hola {{nombre}}! 🎉 Tenemos una promoción para ti: {{descuento}} de descuento con el código {{codigo}}. {{vigencia}}`;
  return template
    .replaceAll('{{nombre}}', customerName.split(' ')[0])
    .replaceAll('{{codigo}}', promo.code)
    .replaceAll('{{descuento}}', discount)
    .replaceAll('{{vigencia}}', vigencia)
    .trim();
}
