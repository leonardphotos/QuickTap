import { useMemo, useState } from 'react';
import { Plus, Search, Timer, Users } from 'lucide-react';
import type { Reservation, WaitlistEntry, WaitlistResponse } from '@/types';
import { MEAL_SERVICES } from '@/utils/meal-services';
import { ReservationRow } from './ReservationRow';
import { WaitlistRow } from './WaitlistRow';

type Tab = 'reservas' | 'espera';

function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(q));
}

/**
 * Barra lateral de Sala: quién viene hoy (reservas) y quién está esperando en la puerta.
 * Es la vista operativa del turno — aceptar o rechazar reservas sigue estando en su pantalla.
 */
export function SalaSidebar({
  reservations,
  waitlist,
  mealServiceId,
  onSeatReservation,
  onSeatWaitlist,
  onNotifyWaitlist,
  onCancelWaitlist,
  onWhatsappReservation,
  onWhatsappWaitlist,
  onNewWaitlistEntry,
  onOpenTable,
}: {
  reservations: Reservation[];
  waitlist: WaitlistResponse | null;
  mealServiceId: string;
  onSeatReservation: (r: Reservation) => void;
  onSeatWaitlist: (e: WaitlistEntry) => void;
  onNotifyWaitlist: (e: WaitlistEntry) => void;
  onCancelWaitlist: (e: WaitlistEntry) => void;
  onWhatsappReservation: (r: Reservation) => void;
  onWhatsappWaitlist: (e: WaitlistEntry) => void;
  onNewWaitlistEntry: () => void;
  /** Abrir la mesa de alguien ya sentado, para ver su cuenta o editar el pedido. */
  onOpenTable: (tableId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('reservas');
  const [query, setQuery] = useState('');

  const service = MEAL_SERVICES.find((s) => s.id === mealServiceId);

  const { seated, upcoming } = useMemo(() => {
    const filtered = reservations
      .filter((r) => !service || (r.time >= service.from && r.time < service.to))
      .filter((r) => matches(query, r.customerName, r.customerPhone, r.tables.map((t) => t.number).join(' ')));
    return {
      seated: filtered.filter((r) => r.status === 'SEATED'),
      upcoming: filtered.filter((r) => r.status !== 'SEATED'),
    };
  }, [reservations, service, query]);

  const waiting = useMemo(
    () => (waitlist?.waiting ?? []).filter((e) => matches(query, e.customerName, e.customerPhone)),
    [waitlist, query],
  );
  const waitlistSeated = useMemo(
    () => (waitlist?.seatedToday ?? []).filter((e) => matches(query, e.customerName, e.customerPhone)),
    [waitlist, query],
  );

  const stats = waitlist?.stats;

  return (
    <aside className="flex min-h-0 flex-col gap-3 rounded-2xl border border-brand-950/10 bg-brand-950/[0.02] p-3">
      <div className="flex shrink-0 rounded-full bg-brand-950/[0.06] p-0.5">
        {(
          [
            ['reservas', 'Reservas', upcoming.length + seated.length],
            ['espera', 'Espera', waiting.length],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950/70'
            }`}
          >
            {label}
            {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
          </button>
        ))}
      </div>

      <div className="relative shrink-0">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-950/30" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o teléfono…"
          className="w-full rounded-full border border-brand-950/10 bg-white py-1.5 pl-8 pr-3 text-xs focus:border-brand-500 focus:outline-none"
        />
      </div>

      {tab === 'espera' && stats && (
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <div className="rounded-xl border border-brand-950/10 bg-white px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-brand-950/40">
              <Users className="h-3 w-3" /> Esperando
            </p>
            <p className="text-lg font-bold tabular-nums text-brand-950">{stats.waitingCount}</p>
          </div>
          <div className="rounded-xl border border-brand-950/10 bg-white px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-brand-950/40">
              <Timer className="h-3 w-3" /> Espera prom.
            </p>
            <p className="text-lg font-bold tabular-nums text-brand-950">
              {stats.avgWaitMinutes != null ? `${stats.avgWaitMinutes} min` : '—'}
            </p>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-0.5">
        {tab === 'reservas' ? (
          <>
            <Section title="Próximas" count={upcoming.length} empty="No hay reservas para este turno.">
              {upcoming.map((r) => (
                <ReservationRow key={r.id} reservation={r} onSeat={onSeatReservation} onWhatsapp={onWhatsappReservation} />
              ))}
            </Section>
            {seated.length > 0 && (
              <Section title="Sentadas" count={seated.length}>
                {seated.map((r) => (
                  <ReservationRow key={r.id} reservation={r} onOpenTable={onOpenTable} />
                ))}
              </Section>
            )}
          </>
        ) : (
          <>
            <Section title="En espera" count={waiting.length} empty="Nadie esperando ahora mismo.">
              {waiting.map((e) => (
                <WaitlistRow
                  key={e.id}
                  entry={e}
                  onSeat={onSeatWaitlist}
                  onNotify={onNotifyWaitlist}
                  onCancel={onCancelWaitlist}
                  onWhatsapp={onWhatsappWaitlist}
                />
              ))}
            </Section>
            {waitlistSeated.length > 0 && (
              <Section title="Sentados hoy" count={waitlistSeated.length}>
                {waitlistSeated.map((e) => (
                  <WaitlistRow key={e.id} entry={e} onOpenTable={onOpenTable} />
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      {tab === 'espera' && (
        <button
          type="button"
          onClick={onNewWaitlistEntry}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-400"
        >
          <Plus className="h-3.5 w-3.5" /> Anotar en la lista
        </button>
      )}
    </aside>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-950/40">
        {title} {count > 0 && <span className="opacity-70">· {count}</span>}
      </p>
      {count === 0 ? (
        empty && <p className="px-1 text-xs font-light text-brand-950/40">{empty}</p>
      ) : (
        <ul className="space-y-1.5">{children}</ul>
      )}
    </div>
  );
}
