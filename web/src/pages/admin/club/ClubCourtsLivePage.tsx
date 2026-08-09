import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Clock, ShoppingBag, Users } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { cn } from '@/lib/utils';
import { clubApi, type PanelCourt } from './clubApi';
import { card, CourtIllustration } from './clubStyle';

interface Props {
  restaurant: Pick<AuthRestaurant, 'currencySymbol'>;
  onOpenCourt: (courtId: string) => void;
}

function humanMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' });
}

/**
 * Lo primero que ve recepción: el estado real de la cancha ahora mismo. El
 * relleno de la ilustración es la parte jugada, para leerlo sin contar minutos.
 */
export default function ClubCourtsLivePage({ restaurant, onOpenCourt }: Props) {
  const [courts, setCourts] = useState<PanelCourt[] | null>(null);

  const load = useCallback(() => {
    clubApi.panelCourts().then((d) => setCourts(d.courts)).catch(() => setCourts([]));
  }, []);

  // El dato envejece por minuto: se refresca solo mientras la pantalla está abierta.
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const money = (n: number) => formatBase(n, restaurant.currencySymbol);
  const playing = courts?.filter((c) => c.busy).length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-bold text-brand-950 tracking-tight">Canchas</h1>
        {courts && courts.length > 0 && (
          <p className="mt-0.5 text-[13px] font-light text-brand-950/50">
            {playing} de {courts.length} en juego ahora
          </p>
        )}
      </div>

      {courts === null && <p className="font-light text-brand-950/40">Cargando…</p>}

      {courts?.length === 0 && (
        <div className={cn(card, 'p-8 text-center')}>
          <p className="font-semibold text-brand-950">Todavía no tienes canchas</p>
          <p className="mt-1 text-[13px] font-light text-brand-950/50">
            Créalas en Ajustes para empezar a recibir reservas.
          </p>
        </div>
      )}

      {/* items-start: una cancha en juego tiene más contenido que una libre; sin
          esto la tarjeta corta se estira y su ilustración queda flotando. */}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        {courts?.map((c) => {
          const cur = c.current;
          const progress = cur && cur.totalMinutes > 0 ? cur.playedMinutes / cur.totalMinutes : 0;
          const isBooking = cur?.kind === 'BOOKING';

          return (
            <button
              key={c.court.id}
              onClick={() => onOpenCourt(c.court.id)}
              className={cn(card, 'overflow-hidden text-left transition-colors hover:border-brand-400')}
            >
              {/* Ilustración de la cancha, con la parte jugada rellena. */}
              <div className="relative h-24 w-full">
                <CourtIllustration progress={progress} idle={!c.busy} />
                <div className="absolute inset-0 flex items-start justify-between p-3">
                  <span className="text-[15px] font-bold text-brand-950">{c.court.name}</span>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
                      !c.busy
                        ? 'bg-emerald-100 text-emerald-700'
                        : isBooking
                          ? 'bg-brand-950 text-white'
                          : 'bg-brand-950/10 text-brand-950/60',
                    )}
                  >
                    {!c.busy ? 'Libre' : isBooking ? '● En juego' : 'Cerrada'}
                  </span>
                </div>
                {c.court.indoor && (
                  <span className="absolute bottom-2.5 left-3 text-[10px] font-medium text-brand-950/45">Techada</span>
                )}
              </div>

              <div className="p-4">
                {isBooking && cur ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[15px] font-bold text-brand-950">
                        {cur.booking?.playerName ?? 'Sin nombre'}
                      </p>
                      {cur.booking && (
                        <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-brand-950/50">
                          <Users className="h-3.5 w-3.5" />
                          {cur.booking.playerCount}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between rounded-2xl bg-brand-950/[0.04] px-3.5 py-2.5">
                      <Figure value={humanMinutes(cur.playedMinutes)} label="jugados" />
                      <div className="text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-brand-950/40">termina</p>
                        <p className="text-[13px] font-bold text-brand-950">{hhmm(cur.endsAt)}</p>
                      </div>
                      <Figure value={humanMinutes(cur.remainingMinutes)} label="restante" align="right" />
                    </div>

                    {/* Lo que evita que alguien se vaya debiendo el agua. */}
                    {cur.openTab ? (
                      <div className="mt-2.5 flex items-center gap-2 rounded-2xl bg-amber-100 px-3.5 py-2.5">
                        <ShoppingBag className="h-4 w-4 shrink-0 text-amber-600" />
                        <span className="text-[12px] font-semibold text-amber-900">Cuenta abierta en tienda</span>
                        <span className="ml-auto text-[14px] font-bold text-amber-900">{money(cur.openTab.balance)}</span>
                      </div>
                    ) : (
                      <p className="mt-2.5 text-[12px] font-light text-brand-950/35">Sin cuenta abierta en tienda</p>
                    )}
                  </>
                ) : c.busy && cur ? (
                  <p className="text-[13px] font-light text-brand-950/60">
                    {cur.note ?? 'No disponible'} · hasta {hhmm(cur.endsAt)}
                  </p>
                ) : (
                  <p className="text-[13px] font-light text-brand-950/45">Nadie jugando ahora</p>
                )}

                <div className="mt-3 flex items-center gap-1.5 border-t border-brand-950/[0.06] pt-3 text-[12px] font-light text-brand-950/50">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {c.next
                      ? `Después: ${hhmm(c.next.startsAt)}${c.next.playerName ? ` · ${c.next.playerName}` : ` · ${c.next.note ?? 'bloqueada'}`}`
                      : c.busy
                        ? 'Libre al terminar'
                        : 'Sin reservas por delante hoy'}
                  </span>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-brand-950/30" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Figure({ value, label, align }: { value: string; label: string; align?: 'right' }) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className="text-[19px] font-bold leading-none tracking-tight text-brand-950">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-brand-950/40">{label}</p>
    </div>
  );
}
