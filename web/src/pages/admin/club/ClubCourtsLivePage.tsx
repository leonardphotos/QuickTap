import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Clock, ShoppingBag, Users } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { cn } from '@/lib/utils';
import { clubApi, type PanelCourt } from './clubApi';
import { CourtIllustration, glass } from './clubStyle';

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
        <h1 className="text-[24px] font-bold tracking-tight text-white">Canchas</h1>
        {courts && courts.length > 0 && (
          <p className="mt-0.5 text-[13px] font-light text-white/65">
            {playing} de {courts.length} en juego ahora
          </p>
        )}
      </div>

      {courts === null && <p className="font-light text-white/50">Cargando…</p>}

      {courts?.length === 0 && (
        <div className={cn(glass, 'p-8 text-center')}>
          <p className="font-semibold text-white">Todavía no tienes canchas</p>
          <p className="mt-1 text-[13px] font-light text-white/60">
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
              className={cn(glass, 'overflow-hidden text-left transition-colors hover:bg-white/25')}
            >
              {/* Ilustración de la cancha, con la parte jugada rellena. */}
              <div className="relative h-24 w-full">
                <CourtIllustration progress={progress} idle={!c.busy} />
                <div className="absolute inset-0 flex items-start justify-between p-3">
                  <span className="text-[15px] font-bold text-white drop-shadow">{c.court.name}</span>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
                      !c.busy
                        ? 'bg-emerald-400 text-emerald-950'
                        : isBooking
                          ? 'bg-white text-brand-950'
                          : 'bg-white/25 text-white',
                    )}
                  >
                    {!c.busy ? 'Libre' : isBooking ? '● En juego' : 'Cerrada'}
                  </span>
                </div>
                {c.court.indoor && (
                  <span className="absolute bottom-2.5 left-3 text-[10px] font-medium text-white/60">Techada</span>
                )}
              </div>

              <div className="p-4">
                {isBooking && cur ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[15px] font-bold text-white">
                        {cur.booking?.playerName ?? 'Sin nombre'}
                      </p>
                      {cur.booking && (
                        <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-white/60">
                          <Users className="h-3.5 w-3.5" />
                          {cur.booking.playerCount}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/12 px-3.5 py-2.5">
                      <Figure value={humanMinutes(cur.playedMinutes)} label="jugados" />
                      <div className="text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-white/50">termina</p>
                        <p className="text-[13px] font-bold text-white">{hhmm(cur.endsAt)}</p>
                      </div>
                      <Figure value={humanMinutes(cur.remainingMinutes)} label="restante" align="right" />
                    </div>

                    {/* Lo que evita que alguien se vaya debiendo el agua. */}
                    {cur.openTab ? (
                      <div className="mt-2.5 flex items-center gap-2 rounded-2xl bg-amber-400/25 px-3.5 py-2.5">
                        <ShoppingBag className="h-4 w-4 shrink-0 text-amber-200" />
                        <span className="text-[12px] font-semibold text-white">
                          Cuenta abierta en tienda
                        </span>
                        <span className="ml-auto text-[14px] font-bold text-white">{money(cur.openTab.balance)}</span>
                      </div>
                    ) : (
                      <p className="mt-2.5 text-[12px] font-light text-white/45">Sin cuenta abierta en tienda</p>
                    )}
                  </>
                ) : c.busy && cur ? (
                  <p className="text-[13px] font-light text-white/70">
                    {cur.note ?? 'No disponible'} · hasta {hhmm(cur.endsAt)}
                  </p>
                ) : (
                  <p className="text-[13px] font-light text-white/55">Nadie jugando ahora</p>
                )}

                <div className="mt-3 flex items-center gap-1.5 border-t border-white/15 pt-3 text-[12px] font-light text-white/60">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {c.next
                      ? `Después: ${hhmm(c.next.startsAt)}${c.next.playerName ? ` · ${c.next.playerName}` : ` · ${c.next.note ?? 'bloqueada'}`}`
                      : c.busy
                        ? 'Libre al terminar'
                        : 'Sin reservas por delante hoy'}
                  </span>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-white/40" />
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
      <p className="text-[19px] font-bold leading-none tracking-tight text-white">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-white/50">{label}</p>
    </div>
  );
}
