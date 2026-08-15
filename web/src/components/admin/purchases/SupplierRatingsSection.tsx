import { useCallback, useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { InlinePanel } from '@/components/admin/InlinePanel';

interface RatingHistory {
  id: string;
  quality: number;
  price: number;
  punctuality: number;
  service: number;
  comment: string | null;
  createdAt: string;
}

interface SupplierRatingRow {
  id: string;
  name: string;
  phone: string | null;
  taxId: string | null;
  purchases: number;
  ratingCount: number;
  overall: number | null;
  quality: number | null;
  price: number | null;
  punctuality: number | null;
  service: number | null;
  lastRatedAt: string | null;
  history: RatingHistory[];
}

const CRITERIA = [
  { key: 'quality', label: 'Calidad', hint: 'del producto que entrega' },
  { key: 'price', label: 'Precio', hint: 'frente al mercado' },
  { key: 'punctuality', label: 'Puntualidad', hint: 'cumple fechas de entrega' },
  { key: 'service', label: 'Atención', hint: 'trato, respuesta y solución de reclamos' },
] as const;
type CriterionKey = (typeof CRITERIA)[number]['key'];

const card = 'rounded-2xl border border-brand-950/10 bg-white shadow-sm';

function Stars({ value, size = 'sm' }: { value: number | null; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${cls} ${value != null && n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-brand-950/15'}`}
        />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} estrellas`} className="p-0.5">
          <Star className={`h-6 w-6 transition-colors ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-brand-950/20 hover:text-amber-300'}`} />
        </button>
      ))}
    </div>
  );
}

/**
 * Compras → Calificación de proveedores: ranking por promedio de 4 criterios (calidad, precio,
 * puntualidad, atención) de 1 a 5, con historial de evaluaciones y formulario para calificar.
 */
export function SupplierRatingsSection() {
  const [rows, setRows] = useState<SupplierRatingRow[] | null>(null);
  const [selected, setSelected] = useState<SupplierRatingRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get('/suppliers/ratings')
      .then((res) => {
        const data = res.data.data as SupplierRatingRow[];
        setRows(data);
        setSelected((s) => (s ? (data.find((r) => r.id === s.id) ?? null) : null));
      })
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudieron cargar las calificaciones.'));
  }, []);

  useEffect(load, [load]);

  if (selected) {
    return <RateSupplierPanel supplier={selected} onClose={() => setSelected(null)} onSaved={load} />;
  }

  const rated = (rows ?? []).filter((r) => r.overall != null);
  const avgAll = rated.length ? Math.round((rated.reduce((a, r) => a + (r.overall ?? 0), 0) / rated.length) * 10) / 10 : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-light text-brand-950/50">
          Califica a cada proveedor por calidad, precio, puntualidad y atención. El ranking usa el promedio de todas
          sus evaluaciones.
        </p>
        {avgAll != null && (
          <p className="text-[13px] text-brand-950/60">
            Promedio general <span className="font-bold text-brand-950">{avgAll.toFixed(1)}</span> · {rated.length} calificado
            {rated.length === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className={`${card} overflow-x-auto`}>
        <div className="flex min-w-[720px] items-center gap-3 border-b border-brand-950/[0.06] px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
          <span className="w-8 shrink-0">#</span>
          <span className="flex-1">Proveedor</span>
          <span className="w-28 shrink-0">Promedio</span>
          <span className="w-16 shrink-0 text-center">Calidad</span>
          <span className="w-16 shrink-0 text-center">Precio</span>
          <span className="w-20 shrink-0 text-center">Puntualidad</span>
          <span className="w-16 shrink-0 text-center">Atención</span>
          <span className="w-24 shrink-0 text-right">Acción</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
          {rows?.length === 0 && (
            <p className="p-5 text-sm font-light text-brand-950/40">Todavía no hay proveedores. Créalos en la pestaña Proveedores.</p>
          )}
          {rows?.map((r, i) => (
            <div key={r.id} className="flex min-w-[720px] items-center gap-3 px-5 py-2.5 text-sm">
              <span className="w-8 shrink-0 text-xs font-bold text-brand-950/40">{r.overall != null ? i + 1 : '—'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-brand-950">{r.name}</span>
                <span className="block text-xs font-light text-brand-950/40">
                  {r.purchases} compra{r.purchases === 1 ? '' : 's'} · {r.ratingCount} evaluación{r.ratingCount === 1 ? '' : 'es'}
                </span>
              </span>
              <span className="flex w-28 shrink-0 items-center gap-1.5">
                <Stars value={r.overall} />
                <span className="text-xs font-semibold text-brand-950">{r.overall != null ? r.overall.toFixed(1) : '—'}</span>
              </span>
              <span className="w-16 shrink-0 text-center text-xs text-brand-950/70">{r.quality?.toFixed(1) ?? '—'}</span>
              <span className="w-16 shrink-0 text-center text-xs text-brand-950/70">{r.price?.toFixed(1) ?? '—'}</span>
              <span className="w-20 shrink-0 text-center text-xs text-brand-950/70">{r.punctuality?.toFixed(1) ?? '—'}</span>
              <span className="w-16 shrink-0 text-center text-xs text-brand-950/70">{r.service?.toFixed(1) ?? '—'}</span>
              <span className="w-24 shrink-0 text-right">
                <TextureButton variant={r.overall == null ? 'brand' : 'secondary'} size="sm" className="!w-auto" onClick={() => setSelected(r)}>
                  Calificar
                </TextureButton>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RateSupplierPanel({ supplier, onClose, onSaved }: { supplier: SupplierRatingRow; onClose: () => void; onSaved: () => void }) {
  const [scores, setScores] = useState<Record<CriterionKey, number>>({ quality: 0, price: 0, punctuality: 0, service: 0 });
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const complete = CRITERIA.every((c) => scores[c.key] > 0);
  const preview = complete ? (scores.quality + scores.price + scores.punctuality + scores.service) / 4 : null;

  async function submit() {
    if (!complete) {
      setError('Califica los cuatro criterios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/suppliers/${supplier.id}/ratings`, { ...scores, comment: comment.trim() || null });
      setMessage('Calificación guardada.');
      setScores({ quality: 0, price: 0, punctuality: 0, service: 0 });
      setComment('');
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function removeRating(id: string) {
    try {
      await api.delete(`/suppliers/ratings/${id}`);
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo eliminar.');
    }
  }

  return (
    <InlinePanel
      title={`Calificar a ${supplier.name}`}
      description={
        supplier.overall != null
          ? `Promedio actual ${supplier.overall.toFixed(1)} de 5 · ${supplier.ratingCount} evaluación${supplier.ratingCount === 1 ? '' : 'es'}`
          : 'Todavía sin evaluar'
      }
      onClose={onClose}
      closeLabel="← Volver"
      size="wide"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          {CRITERIA.map((c) => (
            <div key={c.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-950/10 px-3.5 py-2.5">
              <div>
                <p className="text-sm font-medium text-brand-950">{c.label}</p>
                <p className="text-[11px] font-light text-brand-950/45">{c.hint}</p>
              </div>
              <StarPicker value={scores[c.key]} onChange={(n) => setScores((s) => ({ ...s, [c.key]: n }))} />
            </div>
          ))}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Comentario (opcional): qué salió bien o mal en esta compra"
            className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
          />
          {preview != null && (
            <p className="flex items-center gap-2 text-sm text-brand-950/70">
              Esta evaluación: <Stars value={preview} size="md" /> <span className="font-semibold text-brand-950">{preview.toFixed(1)}</span>
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-brand-500">{message}</p>}
          <TextureButton variant="brand" size="default" disabled={saving} onClick={submit} className="!w-auto disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar calificación'}
          </TextureButton>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-950/40">Historial</p>
          <div className={`${card} divide-y divide-brand-950/[0.06] overflow-hidden`}>
            {supplier.history.length === 0 && <p className="p-4 text-sm font-light text-brand-950/40">Sin evaluaciones todavía.</p>}
            {supplier.history.map((h) => {
              const avg = (h.quality + h.price + h.punctuality + h.service) / 4;
              return (
                <div key={h.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <Stars value={avg} />
                    <span className="font-semibold text-brand-950">{avg.toFixed(1)}</span>
                    <span className="text-xs text-brand-950/40">{new Date(h.createdAt).toLocaleDateString('es-VE')}</span>
                    <button type="button" onClick={() => removeRating(h.id)} className="ml-auto text-xs text-red-600 hover:underline">
                      Eliminar
                    </button>
                  </div>
                  <p className="mt-0.5 text-[11px] text-brand-950/50">
                    Calidad {h.quality} · Precio {h.price} · Puntualidad {h.punctuality} · Atención {h.service}
                  </p>
                  {h.comment && <p className="mt-1 text-xs font-light text-brand-950/70">{h.comment}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </InlinePanel>
  );
}
