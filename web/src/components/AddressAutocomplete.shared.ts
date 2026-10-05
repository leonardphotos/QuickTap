

/** Traduce coordenadas a una dirección legible (Nominatim/OpenStreetMap) para rellenar el
 * campo de dirección cuando el cliente usa "Mi ubicación actual" en vez de escribirla. Si el
 * servicio falla, devuelve las coordenadas como texto — el campo nunca debe quedar vacío. */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const params = new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lng) });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);
    const data = await res.json();
    if (data?.display_name) return data.display_name as string;
  } catch {
    // Sin conexión al servicio de geocodificación — se usa el fallback de abajo.
  }
  return `Ubicación actual (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
}
