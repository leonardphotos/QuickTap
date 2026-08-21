import { useEffect, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';

type Status = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

interface ApprovalRequest {
  id: string;
  summary: string;
  status: Status;
  requestedByUserName: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  applyError: string | null;
}

const BADGE: Record<Status, { label: string; className: string }> = {
  PENDIENTE: { label: 'Esperando', className: 'bg-amber-50 text-amber-700' },
  APROBADA: { label: 'Aprobada', className: 'bg-emerald-50 text-emerald-700' },
  RECHAZADA: { label: 'Rechazada', className: 'bg-red-50 text-red-700' },
};

/**
 * Solicitudes de cambio del administrador (Administración → Solicitudes).
 *
 * El dueño elige acá qué cambios quiere revisar antes de que ocurran. Sin marcar nada, nada se
 * controla: activar la función no le cambia el trabajo a nadie hasta que él lo decida.
 */
export default function ShopApprovalsPage() {
  const { user } = useAuth();
  const esDueno = user?.role === 'OWNER';
  const [items, setItems] = useState<ApprovalRequest[]>([]);
  const [catalogo, setCatalogo] = useState<{ value: string; label: string }[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.get('/approvals/policy').then((r) => {
      setActions(r.data.data.actions);
      setCatalogo(r.data.data.catalogo);
    }).catch(() => undefined);
    api.get('/approvals').then((r) => setItems(r.data.data)).catch(() => setItems([]));
  }

  useEffect(load, []);

  async function toggle(value: string) {
    const next = actions.includes(value) ? actions.filter((a) => a !== value) : [...actions, value];
    setActions(next);
    setBusy(true);
    try {
      await api.put('/approvals/policy', { actions: next });
    } catch {
      setError('No se pudo guardar. Recarga e intenta de nuevo.');
      load();
    } finally {
      setBusy(false);
    }
  }

  async function resolver(id: string, aprobar: boolean) {
    // El motivo del rechazo es lo único que el administrador va a ver: sin él, un "Rechazada"
    // seco no le dice qué corregir y va a volver a pedir lo mismo.
    const note = aprobar ? undefined : prompt('¿Por qué lo rechazas? (opcional, lo verá quien lo pidió)') ?? undefined;
    setError(null);
    try {
      await api.patch(`/approvals/${id}`, { aprobar, note });
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo resolver la solicitud.');
    }
  }

  const pendientes = items.filter((i) => i.status === 'PENDIENTE');
  const resueltas = items.filter((i) => i.status !== 'PENDIENTE');

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-950">Solicitudes</h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">
          {esDueno
            ? 'Cambios que tu administrador quiere hacer y que decidiste revisar antes. Mientras esperan, el cambio no ocurre.'
            : 'Cambios que pediste y esperan el visto bueno del dueño. Mientras esperan, el cambio no ocurre.'}
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {esDueno && (
        <div className="rounded-2xl border border-brand-950/10 bg-white p-4">
          <p className="font-semibold text-brand-950">Qué quieres revisar</p>
          <p className="text-sm text-brand-950/60 font-light mt-1 mb-3">
            Marca lo que tu administrador no deba hacer sin avisarte. Lo que dejes sin marcar lo puede hacer de una.
            Esto no te limita a ti.
          </p>
          <div className="space-y-2">
            {catalogo.map((c) => (
              <label key={c.value} className="flex items-center gap-2.5 text-sm text-brand-950/80">
                <input
                  type="checkbox"
                  checked={actions.includes(c.value)}
                  disabled={busy}
                  onChange={() => toggle(c.value)}
                  className="h-4 w-4 rounded border-brand-950/25 accent-brand-500"
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-brand-950/10 bg-white p-4">
        <p className="font-semibold text-brand-950 mb-3">
          Esperando {pendientes.length > 0 && <span className="text-amber-600">({pendientes.length})</span>}
        </p>
        {pendientes.length === 0 ? (
          <p className="text-sm text-brand-950/40 font-light">Nada esperando.</p>
        ) : (
          <ul className="space-y-2">
            {pendientes.map((i) => (
              <li key={i.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                <p className="text-sm font-medium text-brand-950">{i.summary}</p>
                <p className="text-[11px] text-brand-950/45 mt-0.5">
                  {i.requestedByUserName} · {new Date(i.createdAt).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
                {esDueno && (
                  <div className="flex gap-2 mt-2.5">
                    <TextureButton variant="brand" size="sm" className="!w-auto" onClick={() => resolver(i.id, true)}>
                      <Check className="h-3.5 w-3.5" /> Aprobar
                    </TextureButton>
                    <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => resolver(i.id, false)}>
                      <X className="h-3.5 w-3.5" /> Rechazar
                    </TextureButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {resueltas.length > 0 && (
        <div className="rounded-2xl border border-brand-950/10 bg-white p-4">
          <p className="font-semibold text-brand-950 mb-3">Historial</p>
          <ul className="space-y-2">
            {resueltas.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="text-brand-950/70">{i.summary}</span>
                  <span className="block text-[11px] text-brand-950/40">
                    {i.requestedByUserName} · {i.reviewedAt && new Date(i.reviewedAt).toLocaleDateString('es-VE')}
                    {i.reviewNote && ` · "${i.reviewNote}"`}
                  </span>
                  {/* Aprobada pero no ejecutada: hay que verlo o el dueño cree que el cambio se hizo. */}
                  {i.applyError && (
                    <span className="flex items-center gap-1 text-[11px] text-red-600 mt-0.5">
                      <AlertTriangle className="h-3 w-3 shrink-0" /> No se pudo aplicar: {i.applyError}
                    </span>
                  )}
                </span>
                <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${BADGE[i.status].className}`}>
                  {BADGE[i.status].label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
