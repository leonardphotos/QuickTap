import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Wrench } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import {
  BOOKING_STATUS_LABELS,
  clubApi,
  humanDate,
  shiftDate,
  todayCaracas,
  type ClubAvailability,
  type ClubBooking,
  type ClubCourt,
  type ClubSlot,
} from './clubApi';
import { card } from './clubStyle';
import BookSlotDialog from './BookSlotDialog';
import MaintenanceDialog from './MaintenanceDialog';

interface Props {
  courtId: string;
  restaurant: Pick<AuthRestaurant, 'currencySymbol'>;
  canBook: boolean;
  onBack: () => void;
}

const STATUS_TONE: Record<string, string> = {
  PENDING_PAYMENT: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-brand-950/[0.06] text-brand-950/60',
  CANCELLED: 'bg-brand-950/[0.06] text-brand-950/40',
  NO_SHOW: 'bg-rose-100 text-rose-700',
};

/** Todo lo de UNA cancha: sus reservas del día, sus horas libres y sus bloqueos. */
export default function ClubCourtDetailPage({ courtId, restaurant, canBook, onBack }: Props) {
  const [date, setDate] = useState(todayCaracas());
  const [court, setCourt] = useState<ClubCourt | null>(null);
  const [avail, setAvail] = useState<ClubAvailability | null>(null);
  const [bookings, setBookings] = useState<ClubBooking[] | null>(null);
  const [booking, setBooking] = useState<ClubSlot | null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const { show, toastMessage } = useToast();

  const load = useCallback(() => {
    setAvail(null);
    Promise.all([clubApi.availability(date, courtId), clubApi.listBookings({ date })])
      .then(([a, b]) => {
        setAvail(a[0] ?? null);
        setCourt(a[0]?.court ?? null);
        setBookings(b.filter((x) => x.block?.court.id === courtId));
      })
      .catch(() => show('No se pudo cargar la cancha.'));
  }, [courtId, date, show]);

  useEffect(load, [load]);

  const money = (v: string) => formatBase(Number(v), restaurant.currencySymbol);
  const hhmm = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' });

  const free = avail?.slots.filter((s) => s.available) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-950/[0.05] transition-colors hover:bg-brand-950/[0.08]"
          aria-label="Volver a canchas"
        >
          <ChevronLeft className="h-5 w-5 text-brand-950" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-bold tracking-tight text-brand-950">{court?.name ?? 'Cancha'}</h1>
          {court?.indoor && <p className="text-[12px] font-light text-brand-950/45">Techada</p>}
        </div>
        {canBook && (
          <button
            onClick={() => setMaintenance(true)}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-brand-950/[0.05] px-3.5 py-2 text-[13px] font-semibold text-brand-950 transition-colors hover:bg-brand-950/[0.08]"
          >
            <Wrench className="h-4 w-4" />
            Bloquear
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setDate((d) => shiftDate(d, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-950/[0.05] text-brand-950 transition-colors hover:bg-brand-950/[0.08]"
          aria-label="Día anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => setDate(todayCaracas())}
          className="rounded-full bg-brand-950/[0.05] px-3.5 py-2 text-[13px] font-semibold text-brand-950"
        >
          Hoy
        </button>
        <button
          onClick={() => setDate((d) => shiftDate(d, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-950/[0.05] text-brand-950 transition-colors hover:bg-brand-950/[0.08]"
          aria-label="Día siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <p className="ml-1 text-[14px] font-semibold capitalize text-brand-950/70">{humanDate(date)}</p>
      </div>

      <section>
        <h2 className="mb-2.5 text-[14px] font-bold text-brand-950">Reservas de este día</h2>
        {bookings === null && <p className="font-light text-brand-950/40">Cargando…</p>}
        {bookings?.length === 0 && (
          <p className={cn(card, 'p-5 text-center text-[13px] font-light text-brand-950/45')}>
            Sin reservas en esta cancha.
          </p>
        )}
        <div className="space-y-2">
          {bookings?.map((b) => (
            <div key={b.id} className={cn(card, 'flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3.5')}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-brand-950">{b.playerName}</p>
                <p className="text-[12px] font-light text-brand-950/45">
                  {b.block ? `${hhmm(b.block.startsAt)}–${hhmm(b.block.endsAt)}` : '—'} · {b.playerPhone}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold',
                  STATUS_TONE[b.status] ?? 'bg-brand-950/[0.06] text-brand-950',
                )}
              >
                {BOOKING_STATUS_LABELS[b.status]}
              </span>
              <p className="shrink-0 text-[14px] font-bold text-brand-950">{money(b.totalBase)}</p>
              {canBook && b.status !== 'CANCELLED' && b.status !== 'COMPLETED' && b.status !== 'NO_SHOW' && (
                <button
                  onClick={async () => {
                    await clubApi.cancelBooking(b.id);
                    load();
                    show('Reserva cancelada.');
                  }}
                  className="shrink-0 text-[12px] font-medium text-brand-950/40 hover:text-rose-600"
                >
                  Cancelar
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {canBook && (
        <section>
          <h2 className="mb-2.5 text-[14px] font-bold text-brand-950">Horas libres</h2>
          {avail === null && <p className="font-light text-brand-950/40">Cargando…</p>}
          {avail && free.length === 0 && (
            <p className={cn(card, 'p-5 text-center text-[13px] font-light text-brand-950/45')}>
              No quedan horas libres este día.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {free.map((s) => (
              <button
                key={s.startTime}
                onClick={() => setBooking(s)}
                className={cn(
                  'rounded-2xl border p-3 text-left transition-colors',
                  s.isPeak
                    ? 'border-amber-200 bg-amber-50 hover:border-amber-400'
                    : 'border-brand-950/[0.07] bg-white hover:border-brand-400',
                )}
              >
                <p className="text-[15px] font-bold leading-none text-brand-950">{s.startTime}</p>
                <p className="mt-1 text-[10px] font-medium text-brand-950/40">a {s.endTime}</p>
                <p className="mt-1.5 text-[13px] font-bold text-brand-950">{money(s.priceBase)}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {booking && court && (
        <BookSlotDialog
          date={date}
          courtId={court.id}
          courtName={court.name}
          slot={booking}
          priceLabel={money(booking.priceBase)}
          onClose={() => setBooking(null)}
          onSaved={() => {
            setBooking(null);
            load();
            show('Reserva creada.');
          }}
        />
      )}

      {maintenance && court && (
        <MaintenanceDialog
          date={date}
          courts={[court]}
          onClose={() => setMaintenance(false)}
          onSaved={() => {
            setMaintenance(false);
            load();
            show('Cancha bloqueada.');
          }}
        />
      )}

      <Toast message={toastMessage} />
    </div>
  );
}
