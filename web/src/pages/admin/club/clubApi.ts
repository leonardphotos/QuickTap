import { api } from '@/api/client';

export type ClubSport = 'PADEL' | 'TENIS' | 'FUTBOL' | 'BASQUET' | 'OTRO';
export type ClubBlockKind = 'BOOKING' | 'MAINTENANCE' | 'CLASS' | 'TOURNAMENT';
export type ClubBookingStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface ClubCourt {
  id: string;
  name: string;
  sport: ClubSport;
  indoor: boolean;
  active: boolean;
  sortOrder: number;
}

export interface ClubSchedule {
  id: string;
  courtId: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  priceBase: string;
  isPeak: boolean;
  active: boolean;
}

/** Un turno de la parrilla. `reason` dice por qué no está libre. */
export interface ClubSlot {
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  priceBase: string;
  isPeak: boolean;
  available: boolean;
  reason: ClubBlockKind | 'PAST' | null;
}

export interface ClubAvailability {
  court: ClubCourt;
  slots: ClubSlot[];
}

export interface ClubBooking {
  id: string;
  playerName: string;
  playerPhone: string;
  playerCount: number;
  totalBase: string;
  totalBs: string;
  status: ClubBookingStatus;
  accessToken: string;
  checkedInAt: string | null;
  createdAt: string;
  block?: { startsAt: string; endsAt: string; court: ClubCourt };
}

export interface ClubBlock {
  id: string;
  courtId: string;
  kind: ClubBlockKind;
  startsAt: string;
  endsAt: string;
  note: string | null;
  booking: ClubBooking | null;
}

export interface ClubCalendar {
  date: string;
  courts: ClubCourt[];
  blocks: ClubBlock[];
}

export const clubApi = {
  listCourts: () => api.get<{ data: ClubCourt[] }>('/club/courts').then((r) => r.data.data),
  createCourt: (body: { name: string; sport?: ClubSport; indoor?: boolean; sortOrder?: number }) =>
    api.post<{ data: ClubCourt }>('/club/courts', body).then((r) => r.data.data),
  updateCourt: (id: string, body: Partial<ClubCourt>) =>
    api.patch<{ data: ClubCourt }>(`/club/courts/${id}`, body).then((r) => r.data.data),
  deleteCourt: (id: string) => api.delete(`/club/courts/${id}`).then((r) => r.data),

  listSchedules: () => api.get<{ data: ClubSchedule[] }>('/club/schedules').then((r) => r.data.data),
  createSchedule: (body: {
    courtId?: string | null;
    weekday: number;
    startTime: string;
    endTime: string;
    slotMinutes: number;
    priceBase: number;
    isPeak?: boolean;
  }) => api.post<{ data: ClubSchedule }>('/club/schedules', body).then((r) => r.data.data),
  deleteSchedule: (id: string) => api.delete(`/club/schedules/${id}`).then((r) => r.data),

  calendar: (date: string) => api.get<{ data: ClubCalendar }>('/club/calendar', { params: { date } }).then((r) => r.data.data),
  availability: (date: string, courtId?: string) =>
    api.get<{ data: ClubAvailability[] }>('/club/availability', { params: { date, courtId } }).then((r) => r.data.data),

  listBookings: (params: { date?: string; status?: ClubBookingStatus } = {}) =>
    api.get<{ data: ClubBooking[] }>('/club/bookings', { params }).then((r) => r.data.data),
  createBooking: (body: {
    courtId: string;
    date: string;
    startTime: string;
    durationMinutes: number;
    playerName: string;
    playerPhone: string;
    playerIdNumber?: string;
    playerCount?: number;
  }) => api.post<{ data: ClubBooking }>('/club/bookings', body).then((r) => r.data.data),
  cancelBooking: (id: string) => api.patch<{ data: ClubBooking }>(`/club/bookings/${id}/cancel`).then((r) => r.data.data),
  checkIn: (accessToken: string) =>
    api
      .post<{ data: { booking: ClubBooking; alreadyCheckedIn: boolean } }>(`/club/bookings/check-in/${accessToken}`)
      .then((r) => r.data.data),

  createMaintenance: (body: { courtId: string; date: string; startTime: string; endTime: string; note: string }) =>
    api.post<{ data: ClubBlock }>('/club/maintenance', body).then((r) => r.data.data),
  removeBlock: (id: string) => api.delete(`/club/blocks/${id}`).then((r) => r.data),
};

export const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const SPORT_LABELS: Record<ClubSport, string> = {
  PADEL: 'Pádel',
  TENIS: 'Tenis',
  FUTBOL: 'Fútbol',
  BASQUET: 'Básquet',
  OTRO: 'Otro',
};
export const BOOKING_STATUS_LABELS: Record<ClubBookingStatus, string> = {
  PENDING_PAYMENT: 'Por cobrar',
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Jugada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No se presentó',
};
export const BOOKING_STATUS_CLASS: Record<ClubBookingStatus, string> = {
  PENDING_PAYMENT: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-brand-950/[0.06] text-brand-950/60',
  CANCELLED: 'bg-brand-950/[0.06] text-brand-950/40',
  NO_SHOW: 'bg-rose-100 text-rose-700',
};

/** Fecha de hoy en Caracas como "YYYY-MM-DD" (el backend interpreta todo en esa zona). */
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

export function humanDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}
