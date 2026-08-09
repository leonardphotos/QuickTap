import { useState } from 'react';
import type { FormEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { clubApi, type ClubCourt } from './clubApi';

const MOTIVOS = ['Limpieza de cristales', 'Lluvia', 'Cambio de red', 'Mantenimiento de piso', 'Evento privado'];

interface Props {
  date: string;
  courts: ClubCourt[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Bloqueo técnico. No hace falta comprobar choques acá: si el rango pisa una
 * reserva, la restricción de la base de datos lo rechaza y el servidor devuelve
 * un 409 con el motivo.
 */
export default function MaintenanceDialog({ date, courts, onClose, onSaved }: Props) {
  const [courtId, setCourtId] = useState(courts[0]?.id ?? '');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('10:00');
  const [note, setNote] = useState(MOTIVOS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await clubApi.createMaintenance({ courtId, date, startTime, endTime, note });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo bloquear la cancha.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bloquear cancha</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Cancha</label>
            <select
              value={courtId}
              onChange={(e) => setCourtId(e.target.value)}
              required
              className="w-full rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
            >
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Desde</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Hasta</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Motivo</label>
            <input
              list="club-motivos"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
              maxLength={200}
              className="w-full rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
            />
            <datalist id="club-motivos">
              {MOTIVOS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}

          <TextureButton type="submit" disabled={saving || !courtId} className="w-full">
            {saving ? 'Bloqueando…' : 'Bloquear'}
          </TextureButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
