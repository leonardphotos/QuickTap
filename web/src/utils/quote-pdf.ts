import { jsPDF } from 'jspdf';
import type { Quote } from '@/types';

/** PDF descargable, paginado y basado en el snapshot guardado, nunca en el catálogo vivo. */
export function createQuotePdf(quote: Quote, businessName: string) {
  const doc = new jsPDF();
  let y = 20;
  const money = (n: number) => `${quote.currency} ${n.toFixed(2)}`;
  function page() { doc.addPage(); y = 20; }
  function text(value: string, size = 10, bold = false) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, 174) as string[];
    for (const line of lines) { if (y > 274) page(); doc.text(line, 18, y); y += size * 0.45 + 2; }
  }
  doc.setTextColor(5, 30, 65);
  text(businessName, 18, true);
  text('COTIZACIÓN', 14, true);
  text(`Referencia: ${quote.id}`);
  text(`Fecha: ${new Date(quote.createdAt).toLocaleDateString('es-VE')}`);
  y += 4;
  text(`Cliente: ${quote.customerName || 'No indicado'}`, 11, true);
  text(`RIF / cédula: ${quote.customerIdNumber || 'No indicado'}`);
  text(`Teléfono: ${quote.customerPhone || 'No indicado'}`);
  text(`Dirección: ${quote.customerAddress || 'No indicada'}`);
  text(quote.paymentTerms === 'CREDIT' ? `Pago a crédito: ${quote.creditDays} días` : 'Pago de contado', 11, true);
  y += 4;
  for (const item of quote.items) {
    if (y > 245) page();
    doc.setDrawColor(220, 227, 237); doc.line(18, y, 192, y); y += 7;
    text(item.name, 11, true);
    text(`Cantidad: ${item.qty} ${item.unit || ''}  |  Precio unitario: ${money(item.unitPrice)}`);
    text(`Descuento: ${item.discountPercent || 0}%  |  Importe: ${money(item.qty * item.unitPrice * (1 - (item.discountPercent || 0) / 100))}`);
  }
  const subtotal = quote.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  y += 6;
  text(`Subtotal: ${money(subtotal)}`);
  text(`Descuentos: ${money(Math.max(0, subtotal - Number(quote.totalBase)))}`);
  text(`TOTAL: ${money(Number(quote.totalBase))}`, 16, true);
  if (quote.note) { y += 4; text(`Condiciones: ${quote.note}`); }
  y += 4;
  text('Presupuesto informativo. No constituye factura, cobro ni reserva de inventario.', 9);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(100); doc.text(`QuickTap | Página ${i} de ${pages}`, 18, 289); }
  return doc;
}
export function downloadQuotePdf(quote: Quote, businessName: string) {
  createQuotePdf(quote, businessName).save(`Cotizacion-${quote.id}.pdf`);
}
