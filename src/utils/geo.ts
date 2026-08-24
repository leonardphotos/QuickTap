/**
 * Utilidades geográficas para el precio de delivery: distancia entre dos
 * puntos (fórmula de Haversine) y si un punto cae dentro de un polígono
 * (ray casting). Sin dependencias externas ni API de mapas de pago.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

/** Distancia en línea recta entre dos coordenadas, en kilómetros. */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

/** ¿El punto cae dentro del polígono? Algoritmo de ray casting estándar. */
export function isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;

    const intersects = yi > point.lng !== yj > point.lng && point.lat < ((xj - xi) * (point.lng - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Distancia mínima de un punto a un segmento, en km — proyección sobre un plano
 * local aproximado centrado en `a` (suficientemente preciso a escala de zonas
 * urbanas de delivery, unos pocos km). */
function distanceToSegmentKm(point: LatLng, a: LatLng, b: LatLng): number {
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos((a.lat * Math.PI) / 180);
  const toXY = (p: LatLng) => ({ x: (p.lng - a.lng) * kmPerDegLng, y: (p.lat - a.lat) * kmPerDegLat });

  const P = toXY(point);
  const B = toXY(b);
  const lengthSq = B.x * B.x + B.y * B.y;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (P.x * B.x + P.y * B.y) / lengthSq));
  const closest = { x: t * B.x, y: t * B.y };
  return Math.sqrt((P.x - closest.x) ** 2 + (P.y - closest.y) ** 2);
}

/** Distancia mínima de un punto al borde de un polígono, en km. */
export function distanceToPolygonKm(point: LatLng, polygon: LatLng[]): number {
  let min = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const d = distanceToSegmentKm(point, polygon[j], polygon[i]);
    if (d < min) min = d;
  }
  return min;
}

/** Centroide (promedio simple de vértices) de un polígono — suficiente para zonas de
 * delivery, que son pequeñas y no necesitan el centroide "real" ponderado por área. */
export function polygonCentroid(polygon: LatLng[]): LatLng {
  const lat = polygon.reduce((acc, p) => acc + p.lat, 0) / polygon.length;
  const lng = polygon.reduce((acc, p) => acc + p.lng, 0) / polygon.length;
  return { lat, lng };
}

/** Cuadrado de `halfSideKm` de medio lado alrededor de un punto, en el mismo formato que
 * las zonas dibujadas a mano — usado para registrar automáticamente una zona nueva a partir
 * de un punto sin cobertura. */
export function squarePolygonAround(center: LatLng, halfSideKm: number): LatLng[] {
  const dLat = halfSideKm / 111.32;
  const dLng = halfSideKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  return [
    { lat: center.lat - dLat, lng: center.lng - dLng },
    { lat: center.lat - dLat, lng: center.lng + dLng },
    { lat: center.lat + dLat, lng: center.lng + dLng },
    { lat: center.lat + dLat, lng: center.lng - dLng },
  ];
}
