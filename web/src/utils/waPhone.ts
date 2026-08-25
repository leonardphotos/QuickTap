/**
 * Teléfono → formato wa.me (internacional, solo dígitos).
 *
 * Un venezolano escribe su número como lo marca: 0414-457-2008. Pero wa.me necesita el
 * formato internacional (584144572008) — con el 0 delante, WhatsApp responde "el número no
 * se encuentra" aunque la persona exista. Acepta el número con o sin código de país y con o
 * sin el 0 inicial, que son las cuatro formas en que la gente lo escribe.
 *
 * Vivía copiado (y a medias) en varias pantallas: el CRM tenía una versión, el POS otra, y
 * las entradas de eventos no tenían ninguna — que es el bug que motivó juntarlas acá.
 */
export function waPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('58')) return digits;
  return `58${digits.replace(/^0+/, '')}`;
}
