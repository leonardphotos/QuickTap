import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase, formatBs } from '@/utils/format';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import {
  BOOKING_STATUS_CLASS,
  BOOKING_STATUS_LABELS,
  clubApi,
  humanDate,
  shiftDate,
  todayCaracas,
  type ClubBooking,
} from './clubApi';

interface Props {
  restaurant: Pick<AuthRestaurant, 'currencySymbol' | 'exchangeRate'>;
}

export default function ClubBookingsPage({ restaurant }: Props) {
  const [date, setDate] = useState(todayCaracas());
  const [bookings, setBookings] = useState<ClubBooking[] | null>(null);
  const { show, toastMessage } = useToast();

  const load = useCallback(() => {
    clubApi
      .listBookings({ date })
      .then(setBookings)
      .catch(() => show('No se pudieron cargar las reservas.'));
  }, [date, show]);

  useEffect(() => {
    setBookings(null);
    load();
  }, [load]);

  const money = (v: string) => formatBase(Number(v), restaurant.currencySymbol);
  const moneyBs = (v: string) => (restaurant.exchangeRate ? formatBs(Number(v), restaurant.exchangeRate.rateBs) : null);

  const hhmm = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' });

  const totalCobrado = (bookings ?? [])
    .filter((b) => b.status !== 'CANCELLED')
    .reduce((acc, b) => acc + Number(b.totalBase), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-full border border-brand-950/[0.08] bg-white p-1 shadow-sm">
          <button
            onClick={() => setDate((d) => shiftDate(d, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-brand-950/50 hover:bg-brand-950/[0.05]"
            aria-label="Día anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setDate(todayCaracas())} className="px-3 text-[13px] font-semibold text-brand-950">
            Hoy
          </button>
          <button
            onClick={() => setDate((d) => shiftDate(d, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-brand-950/50 hover:bg-brand-950/[0.05]"
            aria-label="Día siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[20px] font-bold text-brand-950 tracking-tight capitalize">{humanDate(date)}</p>
      </div>

      {bookings && bookings.length > 0 && (
        <div className="flex gap-3">
          <div className="rounded-2xl border border-brand-950/[0.06] bg-white px-4 py-3 shadow-sm">
            <p className="text-[21px] font-bold text-brand-950 tracking-tight leading-none">{bookings.length}</p>
            <p className="mt-1 text-[12px] font-medium text-brand-950/45">reservas</p>
          </div>
          <div className="rounded-2xl border border-brand-950/[0.06] bg-white px-4 py-3 shadow-sm">
            <p className="text-[21px] font-bold text-brand-950 tracking-tight leading-none">
              {formatBase(totalCobrado, restaurant.currencySymbol)}
            </p>
            <p className="mt-1 text-[12px] font-medium text-brand-950/45">
              {moneyBs(String(totalCobrado)) ?? 'facturado'}
            </p>
          </div>
        </div>
      )}

      {bookings === null && <p className="text-brand-950/40 font-light">Cargando…</p>}
      {bookings?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-brand-950/10 p-6 text-center text-[13px] text-brand-950/40 font-light">
          Sin reservas para este día.
        </p>
      )}

      <div className="rounded-2xl border border-brand-950/10 divide-y divide-brand-950/[0.06] bg-white overflow-hidden">
        {bookings?.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-brand-950 truncate">{b.playerName}</p>
              <p className="text-[12px] text-brand-950/45 font-light">
                {b.block ? `${b.block.court.name} · ${hhmm(b.block.startsAt)}–${hhmm(b.block.endsAt)}` : '—'} ·{' '}
                {b.playerPhone}
              </p>
            </div>

            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${BOOKING_STATUS_CLASS[b.status]}`}
            >
              {BOOKING_STATUS_LABELS[b.status]}
            </span>

            <p className="shrink-0 text-[14px] font-bold text-brand-950">{money(b.totalBase)}</p>

            {b.status !== 'CANCELLED' && b.status !== 'COMPLETED' && b.status !== 'NO_SHOW' && (
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

      <Toast message={toastMessage} />
    </div>
  );
}
