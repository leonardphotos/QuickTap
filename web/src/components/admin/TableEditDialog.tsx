import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '@/api/client';
import type { TableItem, Zone } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  table: TableItem | null;
  zones: Zone[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function TableEditDialog({ table, zones, onOpenChange, onSaved }: Props) {
  const [number, setNumber] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (table) {
      setNumber(table.number);
      setZoneId(table.zoneId ?? '');
      setError(null);
    }
  }, [table]);

  async function onSubmit(e: FormEvent) {
    if (!table) return;
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/tables/${table.id}`, { number, zoneId: zoneId || null });
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar la mesa.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!table} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar mesa</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            autoFocus
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="ej: 5, Terraza-1"
            className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            required
          />
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          >
            <option value="">Sin zona</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto px-4 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </TextureButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
