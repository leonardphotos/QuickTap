import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Package, Plus, Trash2, TrendingDown } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { InlinePanel } from '@/components/admin/InlinePanel';
import { MetricCard } from '@/components/admin/MetricCard';

type Range = 'day' | 'week' | 'month' | 'year' | 'all';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Esta semana', month: 'Este mes', year: 'Este año', all: 'Histórico' };

export const WASTE_REASON_LABELS: Record<string, string> = {
  EXPIRED: 'Vencido',
  DAMAGED: 'Dañado',
  PREPARATION: 'Error de preparación',
  CUSTOMER_RETURN: 'Devolución del cliente',
  SPILLAGE: 'Derrame',
  THEFT: 'Faltante / robo',
  // Se genera sola al reabastecer un insumo con "Rendimiento %" < 100 (Inventario → Insumos);
  // se deja fuera del selector del formulario manual para no duplicarla a mano.
  YIELD_LOSS: 'Rendimiento (automático)',
  OTHER: 'Otro',
};
const MANUAL_WASTE_REASONS = Object.entries(WASTE_REASON_LABELS).filter(([k]) => k !== 'YIELD_LOSS');

interface WasteRow {
  id: string;
  kind: 'PRODUCT' | 'INVENTORY';
  itemName: string;
  unit: string;
  quantity: string;
  costBase: string;
  reason: string;
  note: string | null;
  stockAdjusted: boolean;
  createdByName: string | null;
  occurredAt: string;
}

interface WasteStats {
  total: {
    costBase: string;
    records: number;
    percentOfCostOfSales: string | null;
    percentOfSales: string | null;
    costOfSalesBase: string;
    salesBase: string;
  };
  budget: { percent: string | null; realPercent: string | null; overBudget: boolean | null };
  byReason: { reason: string; costBase: string; count: number; sharePercent: string | null }[];
  rows: {
    kind: 'PRODUCT' | 'INVENTORY';
    id: string | null;
    name: string;
    unit: string;
    quantity: string;
    costBase: string;
    records: number;
    sharePercent: string | null;
    soldUnits: number | null;
    wastePercent: string | null;
  }[];
}

/**
 * Merma: qué se perdió y no se vendió. Arriba el indicador general (cuánto pesa contra el
 * costo de ventas y contra lo presupuestado en la estructura de costo) y abajo el detalle por
 * producto/insumo — que es donde se ve DÓNDE se está yendo la plata.
 */
export function WasteSection() {
  const { restaurant } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const [range, setRange] = useState<Range>('month');
  const [stats, setStats] = useState<WasteStats | null>(null);
  const [rows, setRows] = useState<WasteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      api.get('/waste/stats', { params: { range } }),
      api.get('/waste', { params: { range } }),
    ])
      .then(([s, l]) => {
        setStats(s.data.data);
        setRows(l.data.data);
      })
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar la merma.'));
  }, [range]);

  useEffect(load, [load]);

  async function remove(id: string) {
    if (!confirm('¿Borrar este registro de merma? La existencia descontada no se devuelve.')) return;
    await api.delete(`/waste/${id}`);
    load();
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const m = (v: string) => formatBase(v, symbol);
  const over = stats?.budget.overBudget;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(['day', 'week', 'month', 'year', 'all'] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'}`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
        <TextureButton variant="primary" size="sm" className="!w-auto ml-auto" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Registrar merma
        </TextureButton>
      </div>

      {/* --- Indicador general --- */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={TrendingDown}
            title={`Merma · ${RANGE_LABELS[range]}`}
            value={m(stats.total.costBase)}
            valueTone={Number(stats.total.costBase) > 0 ? 'danger' : undefined}
            caption={`${stats.total.records} registro${stats.total.records === 1 ? '' : 's'}`}
          />
          <MetricCard
            icon={AlertTriangle}
            title="Sobre las ventas"
            value={stats.total.percentOfSales != null ? `${stats.total.percentOfSales}%` : '—'}
            valueTone={over === true ? 'danger' : over === false ? 'success' : undefined}
            caption={
              stats.budget.percent != null
                ? `presupuestado ${stats.budget.percent}% en tu estructura de costo`
                : 'sin % de merma en tu estructura de costo'
            }
          />
          <MetricCard
            icon={Package}
            title="Sobre el costo de ventas"
            value={stats.total.percentOfCostOfSales != null ? `${stats.total.percentOfCostOfSales}%` : '—'}
            caption={`costo de ventas ${m(stats.total.costOfSalesBase)}`}
          />
          <MetricCard
            icon={TrendingDown}
            title="Principal motivo"
            value={stats.byReason[0] ? WASTE_REASON_LABELS[stats.byReason[0].reason] ?? stats.byReason[0].reason : '—'}
            caption={stats.byReason[0] ? `${m(stats.byReason[0].costBase)} · ${stats.byReason[0].sharePercent}% del total` : 'sin merma registrada'}
          />
        </div>
      )}

      {over === true && (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Tu merma real ({stats!.budget.realPercent}%) supera el {stats!.budget.percent}% que asumiste en la estructura de costo: cada
          plato está costeado por debajo de lo que realmente cuesta.
        </p>
      )}

      {/* --- Por motivo --- */}
      {stats && stats.byReason.length > 0 && (
        <div className="rounded-2xl border border-brand-950/10 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-brand-950">Por qué se pierde</p>
          <div className="space-y-2">
            {stats.byReason.map((r) => (
              <div key={r.reason}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-brand-950/80">
                    {WASTE_REASON_LABELS[r.reason] ?? r.reason}
                    <span className="ml-1.5 text-xs text-brand-950/40">
                      {r.count} registro{r.count === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="font-semibold text-brand-950">
                    {m(r.costBase)} <span className="text-xs font-normal text-brand-950/40">{r.sharePercent}%</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-brand-950/[0.06]">
                  <div className="h-full rounded-full bg-red-400" style={{ width: `${Math.min(100, Number(r.sharePercent ?? 0))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Indicador por producto / insumo --- */}
      <div>
        <p className="mb-3 text-sm font-medium text-brand-950/70">Merma por producto e insumo</p>
        <div className="overflow-hidden rounded-2xl border border-brand-950/10 bg-white shadow-sm">
          <div className="hidden items-center gap-3 border-b border-brand-950/[0.06] px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-brand-950/40 sm:flex">
            <span className="flex-1">Producto / insumo</span>
            <span className="w-24 text-right">Cantidad</span>
            <span className="w-20 text-right">% merma</span>
            <span className="w-24 text-right">Costo</span>
          </div>
          <div className="divide-y divide-brand-950/[0.06]">
            {stats?.rows.length === 0 && <p className="p-5 text-sm font-light text-brand-950/40">Sin merma registrada en este período.</p>}
            {stats?.rows.map((r) => (
              <div key={`${r.kind}-${r.id ?? r.name}`} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-brand-950">
                    {r.name}
                    <span className="ml-2 rounded-full bg-brand-950/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-brand-950/60">
                      {r.kind === 'PRODUCT' ? 'Producto' : 'Insumo'}
                    </span>
                  </p>
                  <p className="text-xs text-brand-950/40">
                    {r.records} registro{r.records === 1 ? '' : 's'}
                    {r.soldUnits != null && ` · ${r.soldUnits} vendidos`}
                  </p>
                </div>
                <span className="w-24 text-right text-sm text-brand-950/70">
                  {Number(r.quantity).toLocaleString('es-VE', { maximumFractionDigits: 3 })} {r.unit}
                </span>
                <span className={`w-20 text-right text-sm font-semibold ${r.wastePercent && Number(r.wastePercent) >= 5 ? 'text-red-600' : 'text-brand-950/70'}`}>
                  {r.wastePercent != null ? `${r.wastePercent}%` : '—'}
                </span>
                <span className="w-24 text-right text-sm font-semibold text-brand-950">{m(r.costBase)}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[11px] font-light text-brand-950/45">
          "% merma" compara lo perdido contra lo perdido + vendido del mismo producto; para insumos no aplica (no se venden sueltos).
        </p>
      </div>

      {/* --- Historial --- */}
      {rows && rows.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-medium text-brand-950/70">Registros</p>
          <div className="overflow-hidden rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-brand-950">
                    <span className="font-medium">{r.itemName}</span>
                    <span className="text-brand-950/50">
                      {' '}
                      · {Number(r.quantity).toLocaleString('es-VE', { maximumFractionDigits: 3 })} {r.unit} ·{' '}
                      {WASTE_REASON_LABELS[r.reason] ?? r.reason}
                    </span>
                  </p>
                  <p className="text-xs text-brand-950/40">
                    {new Date(r.occurredAt).toLocaleDateString('es-VE')}
                    {r.createdByName && ` · ${r.createdByName}`}
                    {r.note && ` · ${r.note}`}
                    {!r.stockAdjusted && ' · sin descontar existencia'}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-red-600">−{m(r.costBase)}</span>
                <button onClick={() => remove(r.id)} aria-label="Borrar registro" className="shrink-0 text-brand-950/30 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {adding && (
        <WasteForm
          symbol={symbol}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </div>
  );
}

interface Option {
  id: string;
  name: string;
  unit: string;
}

/** Formulario de registro: insumo del inventario o producto terminado, cantidad y motivo. */
function WasteForm({ symbol, onClose, onSaved }: { symbol: string; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<'INVENTORY' | 'PRODUCT'>('INVENTORY');
  const [items, setItems] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [targetId, setTargetId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('EXPIRED');
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [adjustStock, setAdjustStock] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/inventory')
      .then((r) => setItems((r.data.data as { id: string; name: string; unit: string }[]).map((i) => ({ id: i.id, name: i.name, unit: i.unit }))))
      .catch(() => setItems([]));
    api
      .get('/products')
      .then((r) => setProducts((r.data.data as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name, unit: 'und' }))))
      .catch(() => setProducts([]));
  }, []);

  const options = kind === 'INVENTORY' ? items : products;
  const selected = useMemo(() => options.find((o) => o.id === targetId), [options, targetId]);

  async function submit() {
    if (!targetId) {
      setError(kind === 'INVENTORY' ? 'Elige el insumo que se perdió.' : 'Elige el producto que se perdió.');
      return;
    }
    if (!(Number(quantity) > 0)) {
      setError('La cantidad debe ser mayor a 0.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/waste', {
        ...(kind === 'INVENTORY' ? { inventoryItemId: targetId } : { productId: targetId }),
        quantity: Number(quantity),
        reason,
        note: note.trim() || undefined,
        occurredAt: occurredAt || undefined,
        adjustStock,
      });
      onSaved();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'No se pudo registrar la merma.');
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-xl border border-brand-950/15 px-3 py-2 text-sm text-brand-950';

  return (
    <InlinePanel title="Registrar merma" description="Lo que se perdió y no se vendió. El costo se calcula solo." onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {(['INVENTORY', 'PRODUCT'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setTargetId('');
              }}
              className={`flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                kind === k ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50'
              }`}
            >
              {k === 'INVENTORY' ? 'Insumo' : 'Producto terminado'}
            </button>
          ))}
        </div>

        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className={inputCls}>
          <option value="">{kind === 'INVENTORY' ? 'Elige el insumo…' : 'Elige el producto…'}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-brand-950/60">
            Cantidad {selected ? `(${selected.unit})` : ''}
            <input type="number" min={0} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-brand-950/60">
            Motivo
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={`mt-1 ${inputCls}`}>
              {MANUAL_WASTE_REASONS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-brand-950/60">
            Fecha (opcional, por defecto hoy)
            <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-brand-950/60">
            Nota (opcional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detalle" className={`mt-1 ${inputCls}`} />
          </label>
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-xs text-brand-950/70">
          <input type="checkbox" checked={adjustStock} onChange={(e) => setAdjustStock(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-500" />
          <span>Descontar la existencia (si se botó, ya no está en la nevera).</span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-2">
          <TextureButton variant="primary" size="sm" className="!w-auto" onClick={submit} disabled={saving}>
            {saving ? 'Guardando…' : 'Registrar merma'}
          </TextureButton>
          <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={onClose} disabled={saving}>
            Cancelar
          </TextureButton>
          <span className="ml-auto text-[11px] text-brand-950/45">Costo calculado con el costo vivo en {symbol}</span>
        </div>
      </div>
    </InlinePanel>
  );
}
