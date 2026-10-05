import type { CartLine, Customer, PaymentMethod } from '@/types';

export interface OrderDraft {
  step: 1 | 2 | 3;
  channel: 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR' | 'EXPRESS';
  tableMode: 'OPEN' | 'ADD';
  tableId: string;
  accountChoice: string | null;
  accountLabel: string;
  lines: CartLine[];
  selectedCustomer: Customer | null;
  customerAddress: string;
  customerNote: string;
  addressCoords: { lat: number; lng: number } | null;
  deliveryCourierId: string;
  manualFeeText: string | null;
  paymentIntent: 'FULL' | 'SPLIT' | 'DEBT' | null;
  paymentMethod: Exclude<PaymentMethod, 'PAYROLL_DEDUCTION'> | '';
  isEmployeeConsumption: boolean;
  employeeConsumerId: string;
  wantsFiscalInvoice: boolean;
  fiscalIdNumber: string;
  fiscalAddress: string;
}
export function orderDraftKey(restaurantId: string, userId: string, tableId?: string, employee = false, newAccount = false) {
  return `quicktap.order-draft.v1:${encodeURIComponent(restaurantId)}:${encodeURIComponent(userId)}:${employee ? 'employee' : 'sale'}:${encodeURIComponent(tableId || 'general')}:${newAccount ? 'new' : 'default'}`;
}
export function readOrderDraft(key: string): OrderDraft | null {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || 'null');
    if (!stored || stored.version !== 1) return null;
    const d = stored.data;
    if (!d || ![1, 2, 3].includes(d.step) || !['DINE_IN', 'DELIVERY', 'PICKUP', 'BAR', 'EXPRESS'].includes(d.channel) || !['OPEN', 'ADD'].includes(d.tableMode)) return null;
    if (!Array.isArray(d.lines) || d.lines.length > 500 || d.lines.some((l: CartLine) => !l || typeof l.product?.id !== 'string' || typeof l.product?.name !== 'string' || !Number.isFinite(l.quantity) || l.quantity <= 0 || !Array.isArray(l.selectedModifiers) || l.selectedModifiers.some(m => !m || typeof m.modifierId !== 'string') || (l.comboSelections != null && !Array.isArray(l.comboSelections)))) return null;
    for (const field of ['tableId', 'accountLabel', 'customerAddress', 'customerNote', 'deliveryCourierId', 'paymentMethod', 'employeeConsumerId', 'fiscalIdNumber', 'fiscalAddress']) if (typeof d[field] !== 'string') return null;
    for (const field of ['isEmployeeConsumption', 'wantsFiscalInvoice']) if (typeof d[field] !== 'boolean') return null;
    if (d.accountChoice !== null && typeof d.accountChoice !== 'string') return null;
    if (d.manualFeeText !== null && typeof d.manualFeeText !== 'string') return null;
    if (![null, 'FULL', 'SPLIT', 'DEBT'].includes(d.paymentIntent)) return null;
    if (d.selectedCustomer !== null && (!d.selectedCustomer || typeof d.selectedCustomer.id !== 'string' || typeof d.selectedCustomer.name !== 'string')) return null;
    if (d.addressCoords !== null && (!Number.isFinite(d.addressCoords?.lat) || !Number.isFinite(d.addressCoords?.lng))) return null;
    return d as OrderDraft;
  } catch { return null; }
}
export function hasOrderDraftContent(d: OrderDraft) {
  return d.lines.length > 0 || !!(d.selectedCustomer || d.customerAddress.trim() || d.customerNote.trim() || d.accountLabel.trim() || d.fiscalIdNumber.trim() || d.fiscalAddress.trim());
}
export function saveOrderDraft(key: string, data: OrderDraft): boolean {
  try {
    if (hasOrderDraftContent(data)) localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), data }));
    else localStorage.removeItem(key);
    window.dispatchEvent(new Event('quicktap:drafts-changed'));
    return true;
  } catch { return false; }
}
export function removeOrderDraft(key: string): boolean {
  try { localStorage.removeItem(key); window.dispatchEvent(new Event('quicktap:drafts-changed')); return true; } catch { return false; }
}

export function ownsOrderDraft(key: string, restaurantId: string, userId: string) {
  return key.startsWith(`quicktap.order-draft.v1:${encodeURIComponent(restaurantId)}:${encodeURIComponent(userId)}:`);
}
export function listOrderDrafts(restaurantId: string, userId: string) {
  const drafts: Array<{ key: string; data: OrderDraft; savedAt: string; initialTableId?: string; employee: boolean; newAccount: boolean }> = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key || !ownsOrderDraft(key, restaurantId, userId)) continue;
      const data = readOrderDraft(key);
      if (!data || !hasOrderDraftContent(data)) continue;
      const parts = key.split(':');
      const stored = JSON.parse(localStorage.getItem(key)!);
      drafts.push({ key, data, savedAt: typeof stored.savedAt === 'string' ? stored.savedAt : '',
        initialTableId: parts[4] === 'general' ? undefined : decodeURIComponent(parts[4]),
        employee: parts[3] === 'employee', newAccount: parts[5] === 'new' });
    }
  } catch { /* Almacenamiento bloqueado: el diálogo muestra el aviso de guardado. */ }
  return drafts.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
