/**
 * Estilos compartidos del panel del club — blanco/azul, la misma línea gráfica
 * de todo el panel QuickTap (ver ShopDashboardPage). Los colores propios del
 * club (Ajustes → Marca del enlace de reservas) NO se usan acá: solo pintan el
 * enlace público del jugador y su ticket QR, nunca este panel interno.
 */

/** Tarjeta blanca estándar: el bloque base de toda la vertical. */
export const card = 'rounded-3xl border border-brand-950/[0.06] bg-white shadow-sm';

/**
 * Cancha vista desde arriba, en la paleta de marca de QuickTap (no la del club):
 * el relleno de progreso es la parte jugada, para leer de un vistazo cuánto va
 * de la partida sin tener que leer los minutos.
 */
export function CourtIllustration({ progress = 0, idle = false }: { progress?: number; idle?: boolean }) {
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <svg viewBox="0 0 200 100" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <clipPath id={`court-clip-${clamped.toFixed(3)}`}>
          <rect x="0" y="0" width={200 * clamped} height="100" />
        </clipPath>
      </defs>

      <rect x="3" y="3" width="194" height="94" rx="6" fill={idle ? '#eef3fc' : '#e6f2fe'} />
      {!idle && (
        <rect
          x="3"
          y="3"
          width="194"
          height="94"
          rx="6"
          fill="var(--color-brand-500)"
          fillOpacity="0.22"
          clipPath={`url(#court-clip-${clamped.toFixed(3)})`}
        />
      )}

      {/* Líneas: perímetro, red al centro y cajas de saque. */}
      <g stroke="var(--color-brand-950)" strokeOpacity="0.22" strokeWidth="1.4" fill="none">
        <rect x="3" y="3" width="194" height="94" rx="6" />
        <line x1="62" y1="3" x2="62" y2="97" />
        <line x1="138" y1="3" x2="138" y2="97" />
        <line x1="62" y1="50" x2="138" y2="50" />
      </g>
      {/* La red, más marcada que el resto. */}
      <line
        x1="100"
        y1="3"
        x2="100"
        y2="97"
        stroke="var(--color-brand-500)"
        strokeWidth="2.4"
        strokeDasharray="4 3"
        strokeOpacity="0.7"
      />
    </svg>
  );
}
