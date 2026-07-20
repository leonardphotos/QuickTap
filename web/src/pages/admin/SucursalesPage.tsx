import { useEffect, useState } from 'react';
import { ArrowRight, Building2, Plus, TriangleAlert } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Range = 'day' | 'week' | 'month' | 'year' | 'all';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Semana', month: 'Mes', year: 'Año', all: 'Todo' };

const TABS = [
  { id: 'summary', label: 'Resumen' },
  { id: 'sales', label: 'Ventas por sucursal' },
  { id: 'inventory', label: 'Inventario por sucursal' },
  { id: 'products', label: 'Productos más vendidos' },
  { id: 'employees', label: 'Empleados' },
] as const;

interface Branch {
  id: string;
  name: string;
  whatsappPhone: string | null;
  baseCurrency: 'USD' | 'EUR';
  isActive: boolean;
  createdAt: string;
}

/** Administración → Sucursales: crear sucursales y ver el reporte consolidado. Planes Sucursales/Delivery Sucursales. */
export default function SucursalesPage() {
  const { restaurant, switchToBranch } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('summary');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);

  function loadBranches() {
    api
      .get('/branches')
      .then((res) => setBranches(res.data.data))
      .catch(() => setBranches([]));
  }

  useEffect(loadBranches, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Sucursales</h1>
          <p className="text-sm text-brand-950/60 font-light mt-1">
            Cada sucursal tiene su propio catálogo, inventario y equipo. Aquí ves el reporte consolidado de todas.
          </p>
        </div>
        <TextureButton
          variant="brand"
          size="default"
          className="!w-auto px-4 flex items-center gap-2"
          onClick={() => setShowAddDialog(true)}
        >
          <Plus className="h-4 w-4" /> Agregar sucursal
        </TextureButton>
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
        {branches.length === 0 ? (
          <p className="p-5 text-sm text-brand-950/50 font-light">Todavía no tienes sucursales.</p>
        ) : (
          branches.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-brand-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-brand-950">{b.name}</p>
                  <p className="text-xs text-brand-950/50">{b.whatsappPhone ?? 'Sin WhatsApp configurado'}</p>
                </div>
              </div>
              <TextureButton
                variant="minimal"
                size="sm"
                className="!w-auto px-3 flex items-center gap-1.5"
                onClick={() => switchToBranch(b.id)}
              >
                Entrar <ArrowRight className="h-3.5 w-3.5" />
              </TextureButton>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-brand-500 text-white shadow-[0_10px_24px_-8px_rgba(5,108,242,0.5)]'
                : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && <SummaryTab />}
      {tab === 'sales' && <SalesByBranchTab symbol={restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$'} />}
      {tab === 'inventory' && <InventoryByBranchTab />}
      {tab === 'products' && <TopProductsTab />}
      {tab === 'employees' && <EmployeesTab />}

      {showAddDialog && (
        <AddBranchDialog
          onClose={() => setShowAddDialog(false)}
          onCreated={() => {
            setShowAddDialog(false);
            loadBranches();
          }}
        />
      )}
    </div>
  );
}

function RangePicker({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(['day', 'week', 'month', 'year', 'all'] as Range[]).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
          }`}
        >
          {RANGE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

function SummaryTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('month');
  const [result, setResult] = useState<{ branchCount: number; ordersCount: number; totalBase: string } | null>(null);

  useEffect(() => {
    api
      .get('/branches/reports/summary', { params: { range } })
      .then((res) => setResult(res.data.data))
      .catch(() => setResult(null));
  }, [range]);

  return (
    <div className="space-y-4">
      <RangePicker range={range} onChange={setRange} />
      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-brand-950/50">Sucursales</p>
          <p className="text-2xl font-semibold text-brand-950">{result?.branchCount ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-brand-950/50">Pedidos (todas las sedes)</p>
          <p className="text-2xl font-semibold text-brand-950">{result?.ordersCount ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-brand-950/50">Ventas totales</p>
          <p className="text-2xl font-semibold text-brand-950">{result ? formatBase(result.totalBase, symbol) : '—'}</p>
        </div>
      </div>
    </div>
  );
}

function SalesByBranchTab({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<{ branchId: string; name: string; isMain: boolean; ordersCount: number; totalBase: string }[]>([]);

  useEffect(() => {
    api
      .get('/branches/reports/sales', { params: { range } })
      .then((res) => setRows(res.data.data))
      .catch(() => setRows([]));
  }, [range]);

  return (
    <div className="space-y-4">
      <RangePicker range={range} onChange={setRange} />
      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
        {rows.map((r) => (
          <div key={r.branchId} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-brand-950">
                {r.name} {r.isMain && <span className="text-xs text-brand-950/40 font-normal">(sede principal)</span>}
              </p>
              <p className="text-xs text-brand-950/50">{r.ordersCount} pedidos</p>
            </div>
            <p className="text-sm font-semibold text-brand-950">{formatBase(r.totalBase, symbol)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function InventoryByBranchTab() {
  const [rows, setRows] = useState<
    { branchId: string; name: string; isMain: boolean; lowStockItems: { id: string; name: string; unit: string; quantity: string; minQuantity: string }[] }[]
  >([]);

  useEffect(() => {
    api
      .get('/branches/reports/inventory')
      .then((res) => setRows(res.data.data))
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.branchId} className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-4">
          <p className="text-sm font-medium text-brand-950 mb-2">
            {r.name} {r.isMain && <span className="text-xs text-brand-950/40 font-normal">(sede principal)</span>}
          </p>
          {r.lowStockItems.length === 0 ? (
            <p className="text-xs text-brand-950/50">Sin insumos bajo el mínimo.</p>
          ) : (
            <div className="space-y-1.5">
              {r.lowStockItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 text-amber-700">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {item.name}
                  </span>
                  <span className="text-brand-950/60">
                    {item.quantity} / {item.minQuantity} {item.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TopProductsTab() {
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<
    { branchId: string; name: string; isMain: boolean; topProducts: { name: string; quantity: number; revenueBase: string }[] }[]
  >([]);

  useEffect(() => {
    api
      .get('/branches/reports/top-products', { params: { range } })
      .then((res) => setRows(res.data.data))
      .catch(() => setRows([]));
  }, [range]);

  return (
    <div className="space-y-4">
      <RangePicker range={range} onChange={setRange} />
      {rows.map((r) => (
        <div key={r.branchId} className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-4">
          <p className="text-sm font-medium text-brand-950 mb-2">
            {r.name} {r.isMain && <span className="text-xs text-brand-950/40 font-normal">(sede principal)</span>}
          </p>
          {r.topProducts.length === 0 ? (
            <p className="text-xs text-brand-950/50">Sin ventas en este período.</p>
          ) : (
            <div className="space-y-1.5">
              {r.topProducts.map((p) => (
                <div key={p.name} className="flex items-center justify-between gap-2 text-sm text-brand-950/70">
                  <span>{p.name}</span>
                  <span className="text-brand-950/50">{p.quantity} und.</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EmployeesTab() {
  const [rows, setRows] = useState<
    { branchId: string; name: string; isMain: boolean; employees: { id: string; name: string; email: string; role: string; isActive: boolean }[] }[]
  >([]);

  useEffect(() => {
    api
      .get('/branches/reports/employees')
      .then((res) => setRows(res.data.data))
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.branchId} className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-4">
          <p className="text-sm font-medium text-brand-950 mb-2">
            {r.name} {r.isMain && <span className="text-xs text-brand-950/40 font-normal">(sede principal)</span>}
          </p>
          {r.employees.length === 0 ? (
            <p className="text-xs text-brand-950/50">Sin equipo agregado todavía.</p>
          ) : (
            <div className="space-y-1.5">
              {r.employees.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 text-sm text-brand-950/70">
                  <span>{e.name}</span>
                  <span className="text-brand-950/50">{e.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AddBranchDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { restaurant } = useAuth();
  const [name, setName] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [copyCatalog, setCopyCatalog] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError('Escribe el nombre de la sucursal.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/branches', {
        name,
        whatsappPhone: whatsappPhone || undefined,
        baseCurrency: restaurant?.baseCurrency ?? 'USD',
        copyCatalog,
      });
      onCreated();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo crear la sucursal.');
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar sucursal</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-950 mb-1">Nombre de la sucursal</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: QuickTap Las Mercedes"
              className="w-full rounded-xl border border-brand-950/15 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-950 mb-1">WhatsApp (opcional)</label>
            <input
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              placeholder="584141234567"
              className="w-full rounded-xl border border-brand-950/15 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
            />
          </div>

          <div className="rounded-xl bg-brand-950/[0.03] p-4">
            <p className="text-sm font-medium text-brand-950 mb-2">¿Vincular el catálogo?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setCopyCatalog(true)}
                className={`text-left rounded-lg px-3 py-2 text-sm ${copyCatalog ? 'bg-brand-500 text-white' : 'bg-white text-brand-950/70 border border-brand-950/10'}`}
              >
                Copiar los productos y precios de la sede principal
              </button>
              <button
                onClick={() => setCopyCatalog(false)}
                className={`text-left rounded-lg px-3 py-2 text-sm ${!copyCatalog ? 'bg-brand-500 text-white' : 'bg-white text-brand-950/70 border border-brand-950/10'}`}
              >
                Cargar productos nuevos desde cero
              </button>
            </div>
            <p className="text-xs text-brand-950/40 font-light mt-2">
              El inventario nunca se comparte: esta sucursal siempre arranca con su propio inventario vacío.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <TextureButton variant="brand" size="default" disabled={submitting} onClick={submit} className="disabled:opacity-50">
            {submitting ? 'Creando…' : 'Crear sucursal'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
