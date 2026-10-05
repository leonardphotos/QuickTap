import { useState } from 'react';
import type { FormEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { clubApi, type ClubSlot } from './clubApi';

interface Props {
  date: string;
  courtId: string;
  courtName: string;
  slot: ClubSlot;
  priceLabel: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Reserva desde recepción: el precio ya viene del horario, aquí solo van los datos del jugador. */
export default function BookSlotDialog({ date, courtId, courtName, slot, priceLabel, onClose, onSaved }: Props) {
  const [playerName, setPlayerName] = useState('');
  const [playerPhone, setPlayerPhone] = useState('');
  const [playerIdNumber, setPlayerIdNumber] = useState('');
  const [playerCount, setPlayerCount] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const durationMinutes = Math.round(
    (new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) / 60_000,
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await clubApi.createBooking({
        courtId,
        date,
        startTime: slot.startTime,
        durationMinutes,
        playerName: playerName.trim(),
        playerPhone: playerPhone.trim(),
        playerIdNumber: playerIdNumber.trim() || undefined,
        playerCount,
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear la reserva.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reservar {courtName}</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-brand-950/[0.08] bg-brand-950/[0.02] p-3">
          <p className="font-semibold text-brand-950 text-base">
            {slot.startTime} a {slot.endTime} · {durationMinutes} min
          </p>
          <p className="mt-0.5 font-bold text-brand-950 text-base">{priceLabel}</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-brand-950/60 text-sm font-medium">Nombre del jugador</label>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              required
              maxLength={120}
              className="w-full rounded-xl border border-brand-950/10 px-3 py-2 outline-none focus:border-brand-400 text-base"
            />
          </div>
          <div>
            <label className="mb-1 block text-brand-950/60 text-sm font-medium">WhatsApp</label>
            <input
              value={playerPhone}
              onChange={(e) => setPlayerPhone(e.target.value)}
              required
              placeholder="584141234567"
              className="w-full rounded-xl border border-brand-950/10 px-3 py-2 outline-none focus:border-brand-400 text-base"
            />
            <p className="mt-1 text-brand-950/40 font-light text-xs">
              Con el teléfono se arma el historial del jugador y, más adelante, el pago dividido.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-brand-950/60 text-sm font-medium">
              Cédula <span className="font-light text-brand-950/35">(opcional)</span>
            </label>
            <input
              value={playerIdNumber}
              onChange={(e) => setPlayerIdNumber(e.target.value)}
              maxLength={20}
              placeholder="V-12345678"
              className="w-full rounded-xl border border-brand-950/10 px-3 py-2 outline-none focus:border-brand-400 text-base"
            />
            <p className="mt-1 text-brand-950/40 font-light text-xs">
              El jugador sí la da al reservar por la web; por teléfono no siempre, y no debe trabar el mostrador.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-brand-950/60 text-sm font-medium">Jugadores</label>
            <select
              value={playerCount}
              onChange={(e) => setPlayerCount(Number(e.target.value))}
              className="w-full rounded-xl border border-brand-950/10 px-3 py-2 outline-none focus:border-brand-400 text-base"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="font-medium text-rose-600 text-base">{error}</p>}

          <TextureButton type="submit" disabled={saving} className="w-full">
            {saving ? 'Reservando…' : 'Confirmar reserva'}
          </TextureButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
