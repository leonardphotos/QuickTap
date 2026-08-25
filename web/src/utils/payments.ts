import type { PaymentMethod } from '@/types';

/**
 * Reglas de cobro compartidas por las tres pasarelas del panel (PaymentDialog de
 * comandas, ShopPosPage de la tienda y ClubPaymentDialog de canchas). Estaban
 * copiadas en cada una y se desincronizaban al tocar solo un archivo — el
 * backend valida lo mismo en order.dto.ts y club.dto.ts.
 */

/** Métodos que dejan rastro verificable: exigen referencia o comprobante. Efectivo Bs/$ no. */
export const METHODS_REQUIRING_PROOF_OR_REFERENCE: PaymentMethod[] = [
  'MOBILE_PAYMENT',
  'ZELLE',
  'CARD',
  'BINANCE',
  'PAYPAL',
  'TRANSFER',
];

/** Métodos que pueden adjuntar foto del comprobante. Punto de Venta no: su ticket impreso ya lo es. */
export const METHODS_ALLOWING_PROOF: PaymentMethod[] = ['MOBILE_PAYMENT', 'ZELLE', 'BINANCE', 'PAYPAL', 'TRANSFER'];

/** Métodos donde el cliente escanea un QR para pagar (se sube en Ajustes → Métodos de pago). */
export const METHODS_WITH_QR: PaymentMethod[] = ['MOBILE_PAYMENT', 'ZELLE', 'BINANCE'];

/**
 * Métodos que mueven dólares: el monto grande va en $ y el equivalente en Bs queda de
 * referencia abajo. Pago Móvil, Transferencia, Punto de Venta y Efectivo Bs son al revés
 * (se pagan en bolívares), y así se siguen mostrando.
 *
 * PayPal y Efectivo $ faltaban acá aunque siempre fueron dólares — ClubTabletPage llevaba su
 * propia copia de la lista para sumarlos, que es justo lo que esta constante existe para
 * evitar. Están donde corresponde y la copia se borró.
 */
export const USD_FIRST_METHODS: PaymentMethod[] = ['ZELLE', 'BINANCE', 'PAYPAL', 'CASH_USD'];

export function referenceLabel(method: PaymentMethod): string {
  return method === 'CARD' ? 'Número de ticket' : 'Número de referencia';
}

/**
 * Valida el par referencia/comprobante de un cobro. Basta con UNO de los dos: quien
 * tiene la foto del pago no siempre transcribe el número, y quien anota el número no
 * siempre guarda la captura — exigir ambos trancaba el cobro en caja sin dar seguridad extra.
 * Devuelve el mensaje de error, o null si está bien.
 */
export function paymentDocumentError(method: PaymentMethod, reference: string, proofUrl: string | null): string | null {
  if (!METHODS_REQUIRING_PROOF_OR_REFERENCE.includes(method)) return null;
  if (reference.trim() || proofUrl) return null;
  return METHODS_ALLOWING_PROOF.includes(method)
    ? `Escribe el ${referenceLabel(method).toLowerCase()} o adjunta el comprobante.`
    : `Escribe el ${referenceLabel(method).toLowerCase()}.`;
}
