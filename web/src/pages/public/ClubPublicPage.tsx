import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { cn } from '@/lib/utils';

interface Court {
  id: string;
  name: string;
  sport: string;
  indoor: boolean;
}
interface Slot {
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  priceBase: string;
  isPeak: boolean;
  available: boolean;
  reason: string | null;
}
interface Availability {
  court: Court;
  slots: Slot[];
}

function todayCaracas(): string {
  const d = new Date(Date.now() - 4 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}
function humanDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/**
 * Página del jugador: ve la disponibilidad del club y reserva sin cuenta ni
 * contraseña. Al confirmar recibe un QR de acceso — mismo criterio que el menú
 * público, donde el comensal tampoco necesita registrarse.
 */
export default function ClubPublicPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [club, setClub] = useState<{ name: string; logoUrl: string | null } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [date, setDate] = useState(todayCaracas());
  const [grid, setGrid] = useState<Availability[] | null>(null);
  const [picked, setPicked] = useState<{ court: Court; slot: Slot } | null>(null);

  useEffect(() => {
    api
      .get(`/public/club/${slug}`)
      .then((r) => setClub(r.data.data.club))
      .catch(() => setNotFound(true));
  }, [slug]);

  const load = useCallback(() => {
    setGrid(null);
    api
      .get(`/public/club/${slug}/availability`, { params: { date } })
      .then((r) => setGrid(r.data.data))
      .catch(() => setGrid([]));
  }, [slug, date]);

  useEffect(load, [load]);

  if (notFound) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#fafafa] px-6">
        <p className="text-center text-brand-950/50 font-light">Este club no existe o no está disponible.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="sticky top-0 z-20 border-b border-brand-950/[0.06] bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-5">
          {club?.logoUrl && <img src={club.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />}
          <p className="truncate font-bold text-brand-950">{club?.name ?? 'Cargando…'}</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-5 pb-16">
        <h1 className="text-[22px] font-bold tracking-tight text-brand-950">Reserva tu cancha</h1>
        <p className="mt-1 text-[13px] font-light text-brand-950/50">
          Elige el día y la hora. Te damos un código QR para entrar.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-full border border-brand-950/[0.08] bg-white p-1 shadow-sm">
            <button
              onClick={() => setDate((d) => (d > todayCaracas() ? shiftDate(d, -1) : d))}
              disabled={date <= todayCaracas()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-brand-950/50 hover:bg-brand-950/[0.05] disabled:opacity-30"
              aria-label="Día anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-[13px] font-semibold text-brand-950">
              {date === todayCaracas() ? 'Hoy' : ''}
            </span>
            <button
              onClick={() => setDate((d) => shiftDate(d, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full text-brand-950/50 hover:bg-brand-950/[0.05]"
              aria-label="Día siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[15px] font-bold capitalize text-brand-950">{humanDate(date)}</p>
        </div>

        {grid === null && <p className="mt-6 font-light text-brand-950/40">Cargando disponibilidad…</p>}

        {grid?.every((g) => g.slots.every((s) => !s.available)) && grid.length > 0 && (
          <p className="mt-6 rounded-2xl border border-dashed border-brand-950/10 p-6 text-center text-[13px] font-light text-brand-950/45">
            No quedan horarios libres este día. Prueba con el siguiente.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-6">
          {grid?.map(({ court, slots }) => {
            const free = slots.filter((s) => s.available);
            if (free.length === 0) return null;
            return (
              <section key={court.id}>
                <h2 className="mb-3 text-[15px] font-bold text-brand-950">
                  {court.name}
                  {court.indoor && <span className="ml-2 text-[11px] font-medium text-brand-950/35">Techada</span>}
                </h2>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {free.map((slot) => (
                    <button
                      key={slot.startTime}
                      onClick={() => setPicked({ court, slot })}
                      className={cn(
                        'rounded-xl border p-3 text-left transition-colors',
                        slot.isPeak
                          ? 'border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-500',
                      )}
                    >
                      <p className="text-[15px] font-bold leading-none">{slot.startTime}</p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium opacity-60">
                        <Clock className="h-3 w-3" />a {slot.endTime}
                      </p>
                      <p className="mt-1.5 text-[13px] font-bold">${slot.priceBase}</p>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>

      {picked && (
        <BookingSheet
          slug={slug}
          date={date}
          court={picked.court}
          slot={picked.slot}
          onClose={() => setPicked(null)}
          onBooked={(accessToken) => navigate(`/acceso/${accessToken}`)}
        />
      )}
    </div>
  );
}

function BookingSheet({
  slug,
  date,
  court,
  slot,
  onClose,
  onBooked,
}: {
  slug: string;
  date: string;
  court: Court;
  slot: Slot;
  onClose: () => void;
  onBooked: (accessToken: string) => void;
}) {
  const [playerName, setPlayerName] = useState('');
  const [playerPhone, setPlayerPhone] = useState('');
  const [playerCount, setPlayerCount] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const durationMinutes = Math.round((new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) / 60_000);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.post(`/public/club/${slug}/bookings`, {
        courtId: court.id,
        date,
        startTime: slot.startTime,
        durationMinutes,
        playerName: playerName.trim(),
        playerPhone: playerPhone.trim(),
        playerCount,
      });
      onBooked(res.data.data.accessToken);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear la reserva.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[18px] font-bold text-brand-950">Confirmar reserva</h2>
        <div className="mt-3 rounded-xl border border-brand-950/[0.08] bg-brand-950/[0.02] p-3">
          <p className="text-[13px] font-semibold text-brand-950">
            {court.name} · {slot.startTime} a {slot.endTime}
          </p>
          <p className="text-[13px] font-light capitalize text-brand-950/55">{humanDate(date)}</p>
          <p className="mt-1 text-[15px] font-bold text-brand-950">${slot.priceBase}</p>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Tu nombre</label>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              required
              maxLength={120}
              className="w-full rounded-xl border border-brand-950/10 px-3 py-2.5 text-[15px] outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-brand-950/60">WhatsApp</label>
            <input
              value={playerPhone}
              onChange={(e) => setPlayerPhone(e.target.value)}
              required
              inputMode="tel"
              placeholder="0414 123 4567"
              className="w-full rounded-xl border border-brand-950/10 px-3 py-2.5 text-[15px] outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-brand-950/60">¿Cuántos van a jugar?</label>
            <select
              value={playerCount}
              onChange={(e) => setPlayerCount(Number(e.target.value))}
              className="w-full rounded-xl border border-brand-950/10 px-3 py-2.5 text-[15px] outline-none focus:border-brand-400"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}

          <TextureButton type="submit" disabled={saving} className="w-full">
            {saving ? 'Reservando…' : 'Reservar'}
          </TextureButton>
          <button type="button" onClick={onClose} className="w-full py-2 text-[13px] font-medium text-brand-950/45">
            Cancelar
          </button>
        </form>
      </div>
    </div>
  );
}
