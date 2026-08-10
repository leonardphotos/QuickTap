import { useEffect } from 'react';
import { api } from '@/api/client';

export interface PublicCourt {
  id: string;
  name: string;
  sport: string;
  courtType: 'LIBRE' | 'TECHADA' | 'INDOOR';
}

export interface PublicClub {
  name: string;
  slug: string;
  logoUrl: string | null;
  theme: { primary?: string; accent?: string; text?: string } | null;
  currencySymbol: string;
}

export interface PublicSlot {
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  priceBase: string;
  isPeak: boolean;
  available: boolean;
  reason: string | null;
}

export interface PublicAvailability {
  court: PublicCourt;
  slots: PublicSlot[];
}

export interface LiveBlock {
  kind: 'BOOKING' | 'MAINTENANCE' | 'CLASS' | 'TOURNAMENT';
  startsAt: string;
  endsAt: string;
  playerFirstName: string | null;
  note: string | null;
}

export interface LiveCourt {
  court: PublicCourt;
  busy: boolean;
  current: (LiveBlock & { playedMinutes: number; remainingMinutes: number }) | null;
  next: LiveBlock | null;
}

/** Extra que el jugador pide tener listo al llegar. */
export interface ClubExtra {
  id: string;
  name: string;
  emoji: string;
}

/**
 * Catálogo de sugerencias. Es una lista fija a propósito: todavía NO está
 * vinculada al catálogo real del club (ShopProduct), así que no lleva precio —
 * poner uno sería inventarlo. La forma (id/nombre) ya es la que tendrá al
 * vincularla, para que ese cambio sea de origen de datos y no de pantalla.
 */
export const SUGGESTED_EXTRAS: ClubExtra[] = [
  { id: 'agua', name: 'Agua mineral', emoji: '💧' },
  { id: 'isotonica', name: 'Bebida isotónica', emoji: '🥤' },
  { id: 'pelotas', name: 'Tubo de pelotas', emoji: '🎾' },
  { id: 'pala', name: 'Alquiler de pala', emoji: '🏸' },
  { id: 'barra', name: 'Barra energética', emoji: '🍫' },
  { id: 'gorra', name: 'Gorra', emoji: '🧢' },
];

export const clubPublicApi = {
  club: (slug: string) => api.get(`/public/club/${slug}`).then((r) => r.data.data as { club: PublicClub; courts: PublicCourt[] }),
  live: (slug: string) => api.get(`/public/club/${slug}/live`).then((r) => r.data.data as { now: string; courts: LiveCourt[] }),
  availability: (slug: string, date: string) =>
    api.get(`/public/club/${slug}/availability`, { params: { date } }).then((r) => r.data.data as PublicAvailability[]),
  book: (
    slug: string,
    body: {
      courtId: string;
      date: string;
      startTime: string;
      durationMinutes: number;
      playerName: string;
      playerPhone: string;
      playerIdNumber: string;
      playerCount: number;
      requestedExtras: { id: string; name: string; quantity: number }[];
    },
  ) => api.post(`/public/club/${slug}/bookings`, body).then((r) => r.data.data as { accessToken: string }),
};

// --- Fechas (el backend interpreta todo en hora de Caracas) ---

export function todayCaracas(): string {
  const d = new Date(Date.now() - 4 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function dateParts(dateStr: string): { day: string; weekday: string; month: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return {
    day: String(d),
    weekday: date.toLocaleDateString('es-VE', { weekday: 'short', timeZone: 'UTC' }).replace('.', ''),
    month: date.toLocaleDateString('es-VE', { month: 'short', timeZone: 'UTC' }).replace('.', ''),
  };
}

export function humanDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

export function hhmmOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Caracas',
  });
}

/**
 * Aplica el color de fuente del club (Ajustes → Marca del enlace) como
 * variable CSS en el <html>, no en un div local: Extras/Detalles/Confirmación
 * son pantallas hijas de ClubPublicPage, y el ticket QR es otra página aparte
 * — todas necesitan heredarlo desde un ancestro común de verdad. Mismo patrón
 * que MenuPage.tsx usa para el menú público del restaurante.
 */
export function useClubTextColor(text: string | undefined): void {
  useEffect(() => {
    if (!text) return;
    const root = document.documentElement;
    root.style.setProperty('--color-club-text', text);
    return () => {
      root.style.removeProperty('--color-club-text');
    };
  }, [text]);
}

/**
 * Estilo de fondo con los colores del club. Se deriva de `theme.primary` con
 * color-mix en vez de fijar un azul: un club de marca verde tiene que verse
 * verde, no forzado a la paleta del mockup.
 */
export function clubGradient(theme: PublicClub['theme']): React.CSSProperties {
  const base = theme?.primary || '#0B6BCB';
  return {
    ['--club' as string]: base,
    backgroundImage: `linear-gradient(165deg,
      color-mix(in oklab, ${base} 42%, white) 0%,
      ${base} 48%,
      color-mix(in oklab, ${base} 62%, black) 100%)`,
  };
}

/** Etiqueta del tipo de cancha para el jugador. "Libre" no se muestra: es lo
 * normal y no aporta nada; techada o indoor sí cambian la decisión si llueve. */
export function courtTypeLabel(courtType: 'LIBRE' | 'TECHADA' | 'INDOOR'): string | null {
  if (courtType === 'TECHADA') return 'Techada';
  if (courtType === 'INDOOR') return 'Indoor';
  return null;
}

/** Minutos a "1h 20m" / "45m" — más legible que 80 minutos sueltos. */
export function humanMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
