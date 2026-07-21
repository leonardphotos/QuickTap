import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '@/api/client';
import type { Zone } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zones: Zone[];
  onChanged: () => void;
}

export function ZoneDialog({ open, onOpenChange, zones, onChanged }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/zones', { name, priority: zones.length });
      setName('');
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear la zona.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Borrar esta zona?')) return;
    try {
      await api.delete(`/zones/${id}`);
      onChanged();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'No se pudo borrar.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zonas del salón</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ej: Terraza, Salón Principal"
            className="flex-1 border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            required
          />
          <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto disabled:opacity-50">
            {saving ? 'Guardando…' : 'Agregar'}
          </TextureButton>
        </form>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <ul className="divide-y divide-brand-950/10 rounded-xl border border-brand-950/10 max-h-64 overflow-y-auto">
          {zones.map((z) => (
            <li key={z.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {z.name} <span className="text-brand-950/40">({z._count?.tables ?? 0} mesas)</span>
              </span>
              <button onClick={() => remove(z.id)} className="text-red-500 hover:text-red-600 text-xs">
                Borrar
              </button>
            </li>
          ))}
          {zones.length === 0 && (
            <li className="px-3 py-4 text-center text-brand-950/40 text-sm font-light">Sin zonas aún.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
