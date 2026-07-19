import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { StaffMember, TableItem } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  waiter: StaffMember;
  onClose: () => void;
}

/** Equipo → "Asignar mesas": qué mesas le pertenecen a este mesero. Mientras una mesa esté asignada, sus pedidos solo le aparecen a él en el Dashboard. */
export function AssignTablesDialog({ waiter, onClose }: Props) {
  const [tables, setTables] = useState<TableItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/tables').then((res) => {
      const rows: TableItem[] = res.data.data;
      setTables(rows);
      setSelected(new Set(rows.filter((t) => t.assignedWaiterId === waiter.id).map((t) => t.id)));
    });
  }, [waiter.id]);

  function toggle(tableId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) next.delete(tableId);
      else next.add(tableId);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/team/${waiter.id}/tables`, { tableIds: Array.from(selected) });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar la asignación.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar mesas a {waiter.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-brand-950/60 font-light">
            Mientras una mesa esté marcada, los pedidos que lleguen desde ella solo le aparecerán a {waiter.name} en el
            Dashboard. Las mesas sin marcar le aparecen a todos los meseros hasta que alguno acepte un pedido de ahí —
            en ese momento se le asigna automáticamente.
          </p>
          {tables === null ? (
            <p className="text-sm text-brand-950/40 font-light py-3">Cargando…</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-brand-950/10 rounded-xl border border-brand-950/10">
              {tables.map((t) => {
                const takenByOther = t.assignedWaiterId && t.assignedWaiterId !== waiter.id && !selected.has(t.id);
                return (
                  <li key={t.id}>
                    <label className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm cursor-pointer">
                      <span className="flex items-center gap-2 text-brand-950">
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                        Mesa {t.number}
                        {t.zone && <span className="text-brand-950/40"> · {t.zone.name}</span>}
                      </span>
                      {takenByOther && <span className="text-xs text-amber-600">Asignada a otro mesero</span>}
                    </label>
                  </li>
                );
              })}
              {tables.length === 0 && (
                <li className="px-3 py-4 text-center text-brand-950/40 text-sm font-light">Sin mesas creadas aún.</li>
              )}
            </ul>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton variant="brand" size="default" disabled={saving || !tables} onClick={save} className="disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar asignación'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
