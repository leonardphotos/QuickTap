import { useState } from 'react';
import type { FormEvent } from 'react';
import { clubPublicApi, humanDate, type ClubExtra, type PublicSlot } from './clubPublic';

interface Props {
  slug: string;
  picked: { courtId: string; courtName: string; date: string; slot: PublicSlot };
  extras: (ClubExtra & { quantity: number })[];
  symbol: string;
  onBooked: () => void;
  /** El turno se lo llevó otra persona mientras llenaba el formulario. */
  onTaken: () => void;
  onToken: (accessToken: string) => void;
}

export default function ClubDetailsStep({ slug, picked, extras, symbol, onBooked, onTaken, onToken }: Props) {
  const [playerName, setPlayerName] = useState('');
  const [playerPhone, setPlayerPhone] = useState('');
  const [playerIdNumber, setPlayerIdNumber] = useState('');
  const [playerCount, setPlayerCount] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const durationMinutes = Math.round(
    (new Date(picked.slot.endsAt).getTime() - new Date(picked.slot.startsAt).getTime()) / 60_000,
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const booking = await clubPublicApi.book(slug, {
        courtId: picked.courtId,
        date: picked.date,
        startTime: picked.slot.startTime,
        durationMinutes,
        playerName: playerName.trim(),
        playerPhone: playerPhone.trim(),
        playerIdNumber: playerIdNumber.trim(),
        playerCount,
        requestedExtras: extras.map((e) => ({ id: e.id, name: e.name, quantity: e.quantity })),
      });
      onToken(booking.accessToken);
      onBooked();
    } catch (err: any) {
      const status = err.response?.status;
      const message = err.response?.data?.error ?? 'No se pudo crear la reserva.';
      // 409 = la restricción de la base de datos rechazó el solape. No sirve
      // reintentar con los mismos datos: hay que volver a elegir turno.
      if (status === 409) {
        setError(message);
        setTimeout(onTaken, 1800);
        return;
      }
      setError(message);
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-[26px] font-bold tracking-tight">Tus datos</h1>

      <div className="mt-4 rounded-2xl border border-white/25 bg-white/15 p-4 backdrop-blur-xl">
        <p className="text-[15px] font-bold">
          {picked.courtName} · {picked.slot.startTime} a {picked.slot.endTime}
        </p>
        <p className="text-[13px] font-light capitalize text-white/65">{humanDate(picked.date)}</p>
        <p className="mt-1.5 text-[17px] font-bold">
          {symbol}
          {picked.slot.priceBase}
        </p>
        {extras.length > 0 && (
          <p className="mt-2 border-t border-white/15 pt-2 text-[12px] font-light text-white/60">
            Para tener listo: {extras.map((e) => `${e.quantity}× ${e.name}`).join(', ')}
          </p>
        )}
      </div>

      <form onSubmit={submit} className="mt-5 flex flex-1 flex-col">
        <div className="space-y-3">
          <Field label="Nombre y apellido" value={playerName} onChange={setPlayerName} autoComplete="name" />
          <Field
            label="Teléfono"
            value={playerPhone}
            onChange={setPlayerPhone}
            inputMode="tel"
            placeholder="0414 123 4567"
            autoComplete="tel"
          />
          <Field label="Cédula" value={playerIdNumber} onChange={setPlayerIdNumber} placeholder="V-12345678" />

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">¿Cuántos van a jugar?</span>
            <select
              value={playerCount}
              onChange={(e) => setPlayerCount(Number(e.target.value))}
              className="w-full rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-[15px] text-white outline-none backdrop-blur-xl focus:border-white/60"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n} className="text-brand-950">
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <p className="mt-4 rounded-2xl bg-rose-500/25 p-3 text-[13px] font-medium text-white">{error}</p>
        )}

        <div className="mt-auto pt-6">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-white px-6 py-4 text-[15px] font-bold text-brand-950 shadow-xl transition-transform active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? 'Reservando…' : 'Confirmar reserva'}
          </button>
          <p className="mt-3 text-center text-[11px] font-light text-white/50">
            Pagas en el club al llegar.
          </p>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  // Omit del onChange nativo: aquí se recibe el valor ya extraído, no el evento.
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-white/70">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-[15px] text-white placeholder:text-white/40 outline-none backdrop-blur-xl focus:border-white/60"
        {...rest}
      />
    </label>
  );
}
