export function receiptNumber(sale: { receiptNumber?: number | null }): string {
  return sale.receiptNumber && sale.receiptNumber > 0 ? String(sale.receiptNumber).padStart(6, '0') : 'Pendiente de guardar';
}
