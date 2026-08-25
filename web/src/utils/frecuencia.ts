/**
 * Cómo se lee una frecuencia de cuotas, incluida la personalizada "CADA_n" (cada n días).
 *
 * Vivía como un mapa copiado en tres pantallas (detalle del evento, carrito, pedidos del
 * panel) que solo conocía semana/quincena/mes: al llegar la frecuencia personalizada, las
 * tres habrían caído al texto por defecto cada una por su lado.
 */
export function frecuenciaLabel(frecuencia: string | null | undefined): string {
  const custom = /^CADA_(\d{1,3})$/.exec(frecuencia ?? '');
  if (custom) return `cada ${custom[1]} días`;
  switch (frecuencia) {
    case 'SEMANAL': return 'cada semana';
    case 'QUINCENAL': return 'cada 15 días';
    case 'TRIMESTRAL': return 'cada 3 meses';
    case 'SEMESTRAL': return 'cada 6 meses';
    default: return 'cada mes';
  }
}
