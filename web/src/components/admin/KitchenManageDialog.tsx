import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '@/api/client';
import type { Kitchen } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const MAX_KITCHENS = 10;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kitchens: Kitchen[];
  onChanged: () => void;
}

export function KitchenManageDialog({ open, onOpenChange, kitchens, onChanged }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const atLimit = kitchens.length >= MAX_KITCHENS;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/kitchens', { name, priority: kitchens.length });
      setName('');
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear la cocina.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Borrar esta cocina?')) return;
    try {
      await api.delete(`/kitchens/${id}`);
      onChanged();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'No se pudo borrar.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cocinas</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-brand-950/50 font-light">
          Estaciones de cocina (ej: Cocina Caliente, Repostería, Bar) para dividir la comanda al asignarlas a un
          producto. Máximo {MAX_KITCHENS}.
        </p>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ej: Cocina Caliente"
            disabled={atLimit}
            className="flex-1 border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 disabled:opacity-50"
            required
          />
          <TextureButton variant="brand" size="default" disabled={saving || atLimit} className="!w-auto px-4 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Agregar'}
          </TextureButton>
        </form>
        {atLimit && <p className="text-xs text-amber-600">Llegaste al máximo de {MAX_KITCHENS} cocinas.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <ul className="divide-y divide-brand-950/10 rounded-xl border border-brand-950/10 max-h-64 overflow-y-auto">
          {kitchens.map((k) => (
            <li key={k.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {k.name} <span className="text-brand-950/40">({k._count?.products ?? 0} productos)</span>
              </span>
              <button onClick={() => remove(k.id)} className="text-red-500 hover:text-red-600 text-xs">
                Borrar
              </button>
            </li>
          ))}
          {kitchens.length === 0 && (
            <li className="px-3 py-4 text-center text-brand-950/40 text-sm font-light">Sin cocinas aún.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
