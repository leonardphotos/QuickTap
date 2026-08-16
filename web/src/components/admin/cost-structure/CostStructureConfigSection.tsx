import { useEffect, useState } from 'react';
import { Lightbulb, Plus, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { sumPercent, type CostItemKind, type CostStructureItem } from '@/utils/cost-structure';

export interface CostStructureConfig {
  items: CostStructureItem[];
  targetNetMarginPercent: number;
  updatedAt?: string;
}

interface SuggestedFixed {
  range: string;
  fixedCostsBase: string;
  salesBase: string;
  suggestedFixedPercent: string | null;
}

/**
 * Elementos fundamentales del restaurante: los % fijos (arriendo, nómina, servicios…) y
 * variables (comisiones, empaque, merma…) que se le cargan a cada producto vendido. Se editan
 * acá una vez y la calculadora los aplica a todos los productos. El bloque de "sugerencia"
 * cruza los gastos recurrentes reales con las ventas del período para decir cuánto pesan de
 * verdad los fijos — el dueño elige si adopta ese número.
 */
export function CostStructureConfigSection({
  config,
  symbol,
  onSaved,
}: {
  config: CostStructureConfig;
  symbol: string;
  onSaved: (next: CostStructureConfig) => void;
}) {
  const [items, setItems] = useState<CostStructureItem[]>(config.items);
  const [target, setTarget] = useState(String(config.targetNetMarginPercent));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [suggested, setSuggested] = useState<SuggestedFixed | null>(null);
  const [suggestRange, setSuggestRange] = useState<'month' | 'year'>('month');

  useEffect(() => {
    setItems(config.items);
    setTarget(String(config.targetNetMarginPercent));
  }, [config]);

  useEffect(() => {
    api
      .get('/cost-structure/suggested-fixed-percent', { params: { range: suggestRange } })
      .then((res) => setSuggested(res.data.data))
      .catch(() => setSuggested(null));
  }, [suggestRange]);

  const fixedTotal = sumPercent(items, 'FIXED');
  const variableTotal = sumPercent(items, 'VARIABLE');
  const overhead = fixedTotal + variableTotal;
  const dirty = JSON.stringify(items) !== JSON.stringify(config.items) || Number(target) !== config.targetNetMarginPercent;

  function patch(id: string, changes: Partial<CostStructureItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  }
  function add(kind: CostItemKind) {
    setItems((prev) => [...prev, { id: `${kind.toLowerCase()}-${Date.now().toString(36)}`, label: '', kind, percent: 0, enabled: true }]);
  }
  function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  /** Reparte el % fijo real sugerido entre los elementos fijos habilitados, proporcional a
   * lo que ya tienen (o en partes iguales si todos están en 0). */
  function adoptSuggested() {
    if (!suggested?.suggestedFixedPercent) return;
    const total = Math.min(95, Number(suggested.suggestedFixedPercent));
    const fixed = items.filter((i) => i.kind === 'FIXED' && i.enabled);
    if (fixed.length === 0) return;
    const current = fixed.reduce((acc, i) => acc + (Number(i.percent) || 0), 0);
    setItems((prev) =>
      prev.map((i) => {
        if (i.kind !== 'FIXED' || !i.enabled) return i;
        const share = current > 0 ? (Number(i.percent) || 0) / current : 1 / fixed.length;
        return { ...i, percent: Math.round(total * share * 100) / 100 };
      }),
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const cleaned = items.filter((i) => i.label.trim().length > 0);
      const res = await api.put('/cost-structure/config', { items: cleaned, targetNetMarginPercent: Number(target) || 0 });
      onSaved(res.data.data);
      setSavedAt(Date.now());
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-brand-950/10 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-brand-950">Elementos del restaurante</p>
            <p className="text-xs font-light text-brand-950/50">
              Cada % se aplica sobre el precio de venta (base imponible, sin servicio ni IVA) de cada producto.
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="text-brand-950/50">
              Fijos <span className="font-semibold text-brand-950">{fixedTotal.toFixed(2)}%</span> · Variables{' '}
              <span className="font-semibold text-brand-950">{variableTotal.toFixed(2)}%</span>
            </p>
            <p className={overhead >= 100 ? 'font-semibold text-red-600' : 'text-brand-950/50'}>
              Carga total {overhead.toFixed(2)}% del precio
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <ItemGroup
            title="Costos fijos"
            hint="Prorrateados: lo que pagas aunque no vendas (arriendo, nómina, servicios…)."
            kind="FIXED"
            items={items}
            onPatch={patch}
            onAdd={() => add('FIXED')}
            onRemove={remove}
          />
          <ItemGroup
            title="Costos variables"
            hint="Nacen con cada venta (comisiones, empaque, merma, mercadeo…)."
            kind="VARIABLE"
            items={items}
            onPatch={patch}
            onAdd={() => add('VARIABLE')}
            onRemove={remove}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-brand-950/[0.06] pt-4">
          <label className="text-xs text-brand-950/60">
            Utilidad neta objetivo por producto
            <div className="mt-1 flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={95}
                step="0.5"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-24 rounded-xl border border-brand-950/15 px-3 py-2 text-sm font-semibold text-brand-950"
              />
              <span className="text-sm text-brand-950/50">%</span>
            </div>
          </label>
          <div className="flex items-center gap-3">
            {error && <p className="text-xs text-red-600">{error}</p>}
            {savedAt && !dirty && !error && <p className="text-xs text-emerald-600">Guardado</p>}
            <TextureButton variant="primary" size="sm" className="!w-auto" onClick={save} disabled={saving || !dirty || overhead >= 100}>
              {saving ? 'Guardando…' : 'Guardar elementos'}
            </TextureButton>
          </div>
        </div>
      </div>

      {/* Sugerencia automática del % fijo real */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Lightbulb className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-brand-950">¿Cuánto pesan de verdad tus fijos?</p>
              <p className="text-xs font-light text-brand-950/60">
                Gastos marcados como recurrentes ÷ ventas del período. Es la referencia real para tu % fijo total.
              </p>
              {suggested && (
                <p className="mt-2 text-sm text-brand-950">
                  {suggested.suggestedFixedPercent ? (
                    <>
                      Fijos {symbol}
                      {suggested.fixedCostsBase} ÷ ventas {symbol}
                      {suggested.salesBase} ={' '}
                      <span className="text-lg font-bold text-amber-700">{suggested.suggestedFixedPercent}%</span>{' '}
                      <span className="text-xs text-brand-950/50">(configurado: {fixedTotal.toFixed(2)}%)</span>
                    </>
                  ) : (
                    <span className="text-brand-950/60">Sin ventas en el período todavía — no hay % que sugerir.</span>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-1 rounded-full bg-white/70 p-1">
              {(['month', 'year'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSuggestRange(r)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${suggestRange === r ? 'bg-brand-500 text-white' : 'text-brand-950/60'}`}
                >
                  {r === 'month' ? 'Este mes' : 'Este año'}
                </button>
              ))}
            </div>
            <TextureButton
              variant="secondary"
              size="sm"
              className="!w-auto"
              onClick={adoptSuggested}
              disabled={!suggested?.suggestedFixedPercent || Number(suggested.suggestedFixedPercent) + variableTotal >= 100}
            >
              Adoptar {suggested?.suggestedFixedPercent ? `${Math.min(95, Number(suggested.suggestedFixedPercent))}%` : ''} en mis fijos
            </TextureButton>
          </div>
        </div>
        {suggested?.suggestedFixedPercent && Number(suggested.suggestedFixedPercent) + variableTotal >= 100 && (
          <p className="mt-3 text-xs text-red-600">
            Con ese % fijo más tus variables se pasa del 100 % del precio: revisa que las ventas del período estén completas
            o que los gastos recurrentes no incluyan compras de insumos.
          </p>
        )}
      </div>
    </div>
  );
}

function ItemGroup({
  title,
  hint,
  kind,
  items,
  onPatch,
  onAdd,
  onRemove,
}: {
  title: string;
  hint: string;
  kind: CostItemKind;
  items: CostStructureItem[];
  onPatch: (id: string, changes: Partial<CostStructureItem>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const rows = items.filter((i) => i.kind === kind);
  const total = sumPercent(items, kind);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-brand-950">{title}</p>
          <p className="text-[11px] font-light text-brand-950/45">{hint}</p>
        </div>
        <p className="text-xs font-semibold text-brand-950">{total.toFixed(2)}%</p>
      </div>
      <div className="divide-y divide-brand-950/[0.06] rounded-xl border border-brand-950/10">
        {rows.length === 0 && <p className="px-3 py-3 text-xs font-light text-brand-950/40">Sin elementos.</p>}
        {rows.map((i) => (
          <div key={i.id} className={`flex items-center gap-2 px-3 py-2 ${i.enabled ? '' : 'opacity-50'}`}>
            <button
              type="button"
              role="switch"
              aria-checked={i.enabled}
              aria-label={`Activar ${i.label || 'elemento'}`}
              onClick={() => onPatch(i.id, { enabled: !i.enabled })}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${i.enabled ? 'bg-brand-500' : 'bg-brand-950/20'}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${i.enabled ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
            <input
              value={i.label}
              onChange={(e) => onPatch(i.id, { label: e.target.value })}
              placeholder="Nombre del elemento"
              className="min-w-0 flex-1 bg-transparent text-sm text-brand-950 outline-none placeholder:text-brand-950/30"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={i.percent}
                onChange={(e) => onPatch(i.id, { percent: Number(e.target.value) })}
                className="w-16 rounded-lg border border-brand-950/15 px-2 py-1 text-right text-sm font-semibold text-brand-950"
              />
              <span className="text-xs text-brand-950/50">%</span>
            </div>
            <button type="button" onClick={() => onRemove(i.id)} aria-label="Quitar" className="text-brand-950/30 hover:text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={onAdd} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-500 hover:underline">
        <Plus className="h-3.5 w-3.5" /> Añadir {kind === 'FIXED' ? 'costo fijo' : 'costo variable'}
      </button>
    </div>
  );
}
