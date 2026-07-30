export interface ParsedZoneRow {
  name: string;
  price: number;
}

/**
 * Interpreta una lista escrita a mano (pegada o extraída por OCR de una foto) con el
 * formato libre que cualquier restaurante ya usa en un papel o nota de WhatsApp:
 * "Zona Norte: 5", "Zona Norte - $5.00", "1. Zona Norte    5,00 Bs", etc.
 *
 * Regla: cada línea debe terminar en un número (el precio) — lo que quede antes,
 * limpio de numeración y separadores, es el nombre de la zona. Líneas sin ningún
 * número (encabezados, texto suelto) se descartan en silencio.
 */
export function parseZoneList(raw: string): ParsedZoneRow[] {
  const rows: ParsedZoneRow[] = [];

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const priceMatch = line.match(/([\$]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(?:USD|Bs\.?|bolívares?)?\s*$/i);
    if (!priceMatch) continue;

    let namePart = line.slice(0, priceMatch.index).trim();
    // Numeración inicial ("1.", "1)", "-", "•") y separadores finales antes del precio.
    namePart = namePart.replace(/^\s*\d+[.)]\s*/, '').replace(/^[-•*]\s*/, '');
    namePart = namePart.replace(/[:\-–—|]\s*$/, '').trim();
    if (!namePart) continue;

    const priceDigits = priceMatch[1].replace(/\$/g, '').trim();
    const price = parsePriceNumber(priceDigits);
    if (price === null || price <= 0) continue;

    rows.push({ name: namePart, price });
  }

  return rows;
}

/** "5" -> 5, "5,00" -> 5, "1.250,50" -> 1250.5, "1,250.50" -> 1250.5 */
function parsePriceNumber(text: string): number | null {
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  let normalized = text;

  if (hasComma && hasDot) {
    // El último separador que aparece es el decimal; el otro es de miles.
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = text.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (hasComma) {
    // Sola: decimal si deja 1-2 dígitos después, si no es separador de miles.
    const [, decimals] = text.split(',');
    normalized = decimals && decimals.length <= 2 ? text.replace(',', '.') : text.replace(/,/g, '');
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Hexágono de ~radiusMeters alrededor de un punto, para tener un polígono editable
 * de partida cuando solo se conoce el centro de la zona (geocodificación por nombre). */
export function hexagonAround(lat: number, lng: number, radiusMeters = 600): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  const latDegPerMeter = 1 / 111_320;
  const lngDegPerMeter = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    points.push({
      lat: lat + radiusMeters * Math.cos(angle) * latDegPerMeter,
      lng: lng + radiusMeters * Math.sin(angle) * lngDegPerMeter,
    });
  }
  return points;
}
