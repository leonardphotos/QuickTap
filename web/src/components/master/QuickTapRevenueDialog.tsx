import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { masterApi } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';

interface PlanRequestRow {
  id: string;
  kind: 'SIGNUP' | 'RENEWAL';
  plan: string;
  billingCycle: string;
  priceUsd: string;
  paymentReference: string;
  contactName: string;
  restaurantName: string | null;
  createdAt: string;
  restaurant: { name: string } | null;
}

const KIND_LABELS: Record<PlanRequestRow['kind'], string> = { SIGNUP: 'Inscripción', RENEWAL: 'Mensualidad' };

/**
 * Drill-down de la tarjeta "Ingresos de QuickTap" del Resumen del Dashboard
 * maestro: lista las solicitudes APPROVED (inscripción + mensualidad) que
 * arman ese total, con edición del monto/referencia y borrado puntual para
 * corregir errores de carga.
 */
export function QuickTapRevenueDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<PlanRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editReference, setEditReference] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    Promise.all([
      masterApi.get('/master/plan-requests', { params: { kind: 'SIGNUP', status: 'APPROVED' } }),
      masterApi.get('/master/plan-requests', { params: { kind: 'RENEWAL', status: 'APPROVED' } }),
    ])
      .then(([signup, renewal]) => {
        const combined: PlanRequestRow[] = [...signup.data.data, ...renewal.data.data];
        combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setRows(combined);
      })
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el detalle.'));
  }

  useEffect(load, []);

  const total = rows?.reduce((acc, r) => acc + Number(r.priceUsd), 0) ?? 0;

  function startEdit(row: PlanRequestRow) {
    setEditingId(row.id);
    setEditPrice(row.priceUsd);
    setEditReference(row.paymentReference);
  }

  async function saveEdit(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await masterApi.patch(`/master/plan-requests/${id}`, {
        priceUsd: Number(editPrice),
        paymentReference: editReference.trim(),
      });
      setEditingId(null);
      load();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el cambio.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row: PlanRequestRow) {
    if (!window.confirm(`¿Eliminar este ingreso de $${row.priceUsd}? Se descuenta del total de Ingresos de QuickTap.`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      await masterApi.delete(`/master/plan-requests/${row.id}`);
      load();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo eliminar.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ingresos de QuickTap</DialogTitle>
          <p className="text-sm text-brand-950/50 font-light">
            Inscripciones y mensualidades aprobadas · total ${total.toFixed(2)}
          </p>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {rows === null && !error && <p className="text-sm text-brand-950/40">Cargando…</p>}
          {rows?.length === 0 && <p className="text-sm text-brand-950/40 font-light">Sin ingresos aprobados todavía.</p>}

          {rows?.map((row) => (
            <div key={row.id} className="rounded-xl border border-brand-950/10 p-3">
              {editingId === row.id ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <label className="flex-1 text-xs">
                      <span className="text-brand-950/50">Monto (USD)</span>
                      <input
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                        className="mt-0.5 w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1.5"
                      />
                    </label>
                    <label className="flex-1 text-xs">
                      <span className="text-brand-950/50">N.° referencia</span>
                      <input
                        value={editReference}
                        onChange={(e) => setEditReference(e.target.value)}
                        className="mt-0.5 w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1.5"
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <TextureButton
                      variant="brand"
                      size="sm"
                      disabled={busyId === row.id}
                      className="!w-auto px-3 disabled:opacity-50"
                      onClick={() => saveEdit(row.id)}
                    >
                      {busyId === row.id ? 'Guardando…' : 'Guardar'}
                    </TextureButton>
                    <TextureButton variant="minimal" size="sm" className="!w-auto px-3" onClick={() => setEditingId(null)}>
                      Cancelar
                    </TextureButton>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-950">
                      ${row.priceUsd} · {KIND_LABELS[row.kind]} · {row.plan}
                    </p>
                    <p className="text-xs text-brand-950/60 font-light truncate">
                      {row.restaurant?.name ?? row.restaurantName ?? row.contactName}
                    </p>
                    <p className="text-xs text-brand-950/40 font-light">
                      Ref: {row.paymentReference} · {new Date(row.createdAt).toLocaleDateString('es-VE')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(row)}
                      disabled={busyId === row.id}
                      className="text-brand-950/40 hover:text-brand-500 disabled:opacity-40"
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove(row)}
                      disabled={busyId === row.id}
                      className="text-brand-950/40 hover:text-red-600 disabled:opacity-40"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
