import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';

/** Anotar en la puerta a quien llega sin reserva. */
export function NewWaitlistDialog({
  open,
  zones,
  busy,
  error,
  onCreate,
  onClose,
}: {
  open: boolean;
  zones: { id: string; name: string }[];
  busy?: boolean;
  error?: string | null;
  onCreate: (input: {
    customerName: string;
    customerPhone?: string;
    partySize: number;
    zoneId?: string;
    quotedMinutes?: number;
    note?: string;
  }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: '', phone: '', partySize: '2', zoneId: '', quoted: '20', note: '' });

  useEffect(() => {
    if (open) setForm({ name: '', phone: '', partySize: '2', zoneId: '', quoted: '20', note: '' });
  }, [open]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    onCreate({
      customerName: form.name.trim(),
      customerPhone: form.phone.trim() || undefined,
      partySize: Number(form.partySize) || 1,
      zoneId: form.zoneId || undefined,
      quotedMinutes: form.quoted === '' ? undefined : Number(form.quoted),
      note: form.note.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anotar en la lista de espera</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nombre">
              <input value={form.name} onChange={set('name')} placeholder="Nombre" className={INPUT} required autoFocus />
            </Field>
            <Field label="Teléfono (opcional)">
              <input value={form.phone} onChange={set('phone')} placeholder="04141234567" className={INPUT} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Personas">
              <input type="number" min={1} max={100} value={form.partySize} onChange={set('partySize')} className={INPUT} required />
            </Field>
            <Field label="Espera (min)">
              <input type="number" min={0} max={600} value={form.quoted} onChange={set('quoted')} className={INPUT} />
            </Field>
            <Field label="Zona">
              <select value={form.zoneId} onChange={set('zoneId')} className={INPUT}>
                <option value="">Cualquiera</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Nota (opcional)">
            <input value={form.note} onChange={set('note')} placeholder="silla de bebé…" className={INPUT} />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <TextureButton variant="brand" size="default" disabled={busy} className="!w-auto disabled:opacity-50">
            {busy ? 'Guardando…' : 'Anotar'}
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
    <label className="block text-xs font-medium text-brand-950/60">
      {label}
      {children}
    </label>
  );
}
