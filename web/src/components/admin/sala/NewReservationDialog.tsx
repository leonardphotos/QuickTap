import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import type { FloorPlanTable } from '@/types';
import { Link } from 'react-router-dom';

/**
 * "+ Nueva reserva" del panel: la que toma el propio restaurante por teléfono o en persona.
 * Nace ya confirmada, y por eso pide menos datos que la del menú público (la cédula es opcional).
 */
export function NewReservationDialog({
  open,
  date,
  tables,
  busy,
  error,
  onCreate,
  onClose,
}: {
  open: boolean;
  /** Día que se está mirando en Sala: la reserva nueva arranca ahí. */
  date: string;
  tables: FloorPlanTable[];
  busy?: boolean;
  error?: string | null;
  onCreate: (input: {
    date: string;
    time: string;
    partySize: number;
    tableIds: string[];
    customerName: string;
    customerPhone: string;
    note?: string;
  }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ date, time: '20:00', partySize: '2', name: '', phone: '', note: '' });
  const [tableIds, setTableIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm({ date, time: '20:00', partySize: '2', name: '', phone: '', note: '' });
    setTableIds([]);
  }, [open, date]);

  function toggleTable(id: string) {
    setTableIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (tableIds.length === 0) return;
    onCreate({
      date: form.date,
      time: form.time,
      partySize: Number(form.partySize) || 1,
      tableIds,
      customerName: form.name.trim(),
      customerPhone: form.phone.trim(),
      note: form.note.trim() || undefined,
    });
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva reserva</DialogTitle>
        </DialogHeader>
        <p className="text-brand-950/60 text-base">La reserva quedará confirmada. Luego podrás contactar al cliente por WhatsApp.</p>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Día">
              <input type="date" value={form.date} onChange={set('date')} className={INPUT} required />
            </Field>
            <Field label="Hora">
              <input type="time" value={form.time} onChange={set('time')} className={INPUT} required />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Nombre">
              <input value={form.name} maxLength={120} onChange={set('name')} placeholder="Nombre del cliente" className={INPUT} required />
            </Field>
            <Field label="Teléfono">
              <input type="tel" minLength={7} maxLength={30} value={form.phone} onChange={set('phone')} placeholder="04141234567" className={INPUT} required />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Personas">
              <input type="number" min={1} max={100} value={form.partySize} onChange={set('partySize')} className={INPUT} required />
            </Field>
            <Field label="Nota (opcional)">
              <input value={form.note} maxLength={300} onChange={set('note')} placeholder="cumpleaños…" className={INPUT} />
            </Field>
          </div>

          <div>
            <p className="mb-1 font-bold uppercase tracking-wider text-brand-950/40 text-xs">Mesas</p>
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {tables.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tableIds.includes(t.id)}
                  onClick={() => toggleTable(t.id)}
                  className={`min-h-11 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    tableIds.includes(t.id)
                      ? 'bg-brand-500 text-white'
                      : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                  }`}
                >
                  {t.number}
                  <span className="ml-1 opacity-60">{t.seats}p</span>
                </button>
              ))}
            </div>
            {tables.length === 0 ? <p className="text-brand-950/60 text-base">No hay mesas para asignar. <Link to="/admin/tables" className="text-brand-600 underline">Crear mesas</Link></p>
              : <p className="mt-2 text-brand-950/60 text-xs">Selecciona una o varias mesas. Verifica su disponibilidad para la hora elegida antes de confirmar.</p>}
          </div>

          {error && <p className="text-red-600 text-base">{error}</p>}

          <TextureButton variant="brand" size="default" disabled={tableIds.length === 0 || busy} className="!w-auto disabled:opacity-50">
            {busy ? 'Guardando…' : 'Crear reserva'}
          </TextureButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const INPUT =
  'mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm text-brand-950 focus:border-brand-500 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-brand-950/60 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
