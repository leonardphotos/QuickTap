import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Wrench } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase, formatBs } from '@/utils/format';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import {
  clubApi,
  humanDate,
  shiftDate,
  todayCaracas,
  type ClubAvailability,
  type ClubSlot,
} from './clubApi';
import BookSlotDialog from './BookSlotDialog';
import MaintenanceDialog from './MaintenanceDialog';

/** Color del turno según por qué está o no disponible. */
function slotClass(slot: ClubSlot): string {
  if (slot.available) {
    return slot.isPeak
      ? 'border-amber-300 bg-amber-50 hover:border-amber-500 text-amber-900'
      : 'border-emerald-200 bg-emerald-50 hover:border-emerald-500 text-emerald-900';
  }
  if (slot.reason === 'MAINTENANCE') return 'border-brand-950/10 bg-brand-950/[0.04] text-brand-950/40 cursor-not-allowed';
  if (slot.reason === 'PAST') return 'border-brand-950/[0.06] bg-transparent text-brand-950/25 cursor-not-allowed';
  return 'border-rose-200 bg-rose-50 text-rose-800 cursor-not-allowed';
}

function slotBadge(slot: ClubSlot): string | null {
  if (slot.available) return slot.isPeak ? 'Pico' : null;
  if (slot.reason === 'BOOKING') return 'Reservada';
  if (slot.reason === 'MAINTENANCE') return 'Mantenimiento';
  if (slot.reason === 'CLASS') return 'Clase';
  if (slot.reason === 'TOURNAMENT') return 'Torneo';
  return 'Pasó';
}

interface Props {
  restaurant: Pick<AuthRestaurant, 'currencySymbol' | 'exchangeRate'>;
}

export default function ClubCalendarPage({ restaurant }: Props) {
  const [date, setDate] = useState(todayCaracas());
  const [grid, setGrid] = useState<ClubAvailability[] | null>(null);
  const [booking, setBooking] = useState<{ courtId: string; courtName: string; slot: ClubSlot } | null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const { show, toastMessage } = useToast();

  const load = useCallback(() => {
    clubApi
      .availability(date)
      .then(setGrid)
      .catch(() => show('No se pudo cargar el calendario.'));
  }, [date, show]);

  useEffect(() => {
    setGrid(null);
    load();
  }, [load]);

  const money = (v: string) => formatBase(Number(v), restaurant.currencySymbol);
  const moneyBs = (v: string) => (restaurant.exchangeRate ? formatBs(Number(v), restaurant.exchangeRate.rateBs) : null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-full border border-brand-950/[0.08] bg-white p-1 shadow-sm">
          <button
            onClick={() => setDate((d) => shiftDate(d, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-brand-950/50 hover:bg-brand-950/[0.05]"
            aria-label="Día anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setDate(todayCaracas())}
            className="px-3 text-[13px] font-semibold text-brand-950"
          >
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

        <button
          onClick={() => setMaintenance(true)}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-brand-950/[0.08] bg-white px-3.5 py-2 text-[13px] font-semibold text-brand-950 shadow-sm hover:border-brand-400"
        >
          <Wrench className="h-4 w-4" />
          Bloquear cancha
        </button>
      </div>

      {grid === null && <p className="text-brand-950/40 font-light">Cargando…</p>}

      {grid?.length === 0 && (
        <div className="rounded-2xl border border-brand-950/[0.06] bg-white p-8 text-center shadow-sm">
          <p className="font-semibold text-brand-950">Todavía no tienes canchas</p>
          <p className="mt-1 text-[13px] text-brand-950/50 font-light">
            Crea tus canchas y sus horarios en la pestaña Canchas para empezar a recibir reservas.
          </p>
        </div>
      )}

      {grid?.map(({ court, slots }) => (
        <section key={court.id}>
          <div className="mb-3 flex items-baseline gap-2">
            <h2 className="text-[15px] font-bold text-brand-950">{court.name}</h2>
            {court.indoor && <span className="text-[11px] font-medium text-brand-950/35">Techada</span>}
            <span className="ml-auto text-[11px] font-medium text-brand-950/35">
              {slots.filter((s) => s.available).length} de {slots.length} libres
            </span>
          </div>

          {slots.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-brand-950/10 p-5 text-[13px] text-brand-950/40 font-light">
              Sin horario configurado para este día.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {slots.map((slot) => {
                const badge = slotBadge(slot);
                return (
                  <button
                    key={slot.startTime}
                    disabled={!slot.available}
                    onClick={() => setBooking({ courtId: court.id, courtName: court.name, slot })}
                    className={cn('rounded-xl border p-3 text-left transition-colors', slotClass(slot))}
                  >
                    <p className="text-[14px] font-bold leading-none">{slot.startTime}</p>
                    <p className="mt-1 text-[11px] font-medium opacity-60">a {slot.endTime}</p>
                    {slot.available ? (
                      <p className="mt-1.5 text-[12px] font-bold">{money(slot.priceBase)}</p>
                    ) : (
                      <p className="mt-1.5 text-[11px] font-semibold">{badge}</p>
                    )}
                    {slot.available && badge && (
                      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{badge}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ))}

      {booking && (
        <BookSlotDialog
          date={date}
          courtId={booking.courtId}
          courtName={booking.courtName}
          slot={booking.slot}
          priceLabel={`${money(booking.slot.priceBase)}${moneyBs(booking.slot.priceBase) ? ` · ${moneyBs(booking.slot.priceBase)}` : ''}`}
          onClose={() => setBooking(null)}
          onSaved={() => {
            setBooking(null);
            load();
            show('Reserva creada.');
          }}
        />
      )}

      {maintenance && (
        <MaintenanceDialog
          date={date}
          courts={grid?.map((g) => g.court) ?? []}
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
