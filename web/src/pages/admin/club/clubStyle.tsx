import type { CSSProperties } from 'react';
import type { AuthRestaurant } from '@/context/AuthContext';

/**
 * Fondo del panel con los colores del club, misma línea gráfica que el enlace
 * del jugador (ver pages/public/clubPublic.ts). Se deriva de `theme.primary` con
 * color-mix en vez de fijar un azul: un club de marca verde tiene que verse verde.
 */
export function clubPanelBg(restaurant: Pick<AuthRestaurant, 'theme'>): CSSProperties {
  const base = restaurant.theme?.primary || '#0B6BCB';
  return {
    backgroundImage: `linear-gradient(170deg,
      color-mix(in oklab, ${base} 38%, white) 0%,
      ${base} 46%,
      color-mix(in oklab, ${base} 64%, black) 100%)`,
    backgroundAttachment: 'fixed',
  };
}

/** Tarjeta de vidrio: el bloque base de toda la vertical. */
export const glass = 'rounded-3xl border border-white/25 bg-white/15 backdrop-blur-xl';

/**
 * Cancha vista desde arriba. El relleno de progreso es la parte jugada: hace
 * legible de un vistazo cuánto va de la partida sin tener que leer los minutos.
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

      <rect x="3" y="3" width="194" height="94" rx="6" fill={idle ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.10)'} />
      {!idle && (
        <rect
          x="3"
          y="3"
          width="194"
          height="94"
          rx="6"
          fill="rgba(255,255,255,0.26)"
          clipPath={`url(#court-clip-${clamped.toFixed(3)})`}
        />
      )}

      {/* Líneas: perímetro, red al centro y cajas de saque. */}
      <g stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" fill="none">
        <rect x="3" y="3" width="194" height="94" rx="6" />
        <line x1="62" y1="3" x2="62" y2="97" />
        <line x1="138" y1="3" x2="138" y2="97" />
        <line x1="62" y1="50" x2="138" y2="50" />
      </g>
      {/* La red, más marcada que el resto. */}
      <line x1="100" y1="3" x2="100" y2="97" stroke="rgba(255,255,255,0.9)" strokeWidth="2.4" strokeDasharray="4 3" />
    </svg>
  );
}
