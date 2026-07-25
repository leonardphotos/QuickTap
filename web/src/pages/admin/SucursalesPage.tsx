import { useEffect, useState } from 'react';
import { ArrowRight, Building2, ChevronDown, Plus, TriangleAlert } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PAYMENT_LABELS } from '@/components/admin/PaymentDialog';
import type { OrderChannel, PaymentMethod } from '@/types';

type Range = 'day' | 'week' | 'month' | 'year' | 'all';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Semana', month: 'Mes', year: 'Año', all: 'Todo' };
const CHANNEL_ROW_LABELS: Record<OrderChannel, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Pickup', BAR: 'Barra' };

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
          className="!w-auto flex items-center gap-2"
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
                className="!w-auto flex items-center gap-1.5"
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
      {tab === 'products' && <TopProductsTab symbol={restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$'} />}
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

interface BranchSaleItem {
  productName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

interface BranchSalePayment {
  method: string;
  referenceNumber: string | null;
  amountBase: string;
  discountBase: string | null;
  createdAt: string;
}

interface BranchSale {
  id: string;
  orderNumber: number;
  channel: OrderChannel;
  status: string;
  paymentMethod: string | null;
  totalBase: string;
  totalBs: string;
  currency: string;
  customerName: string | null;
  table: string | null;
  createdAt: string;
  items: BranchSaleItem[];
  payments: BranchSalePayment[];
}

interface BranchSalesDetail {
  branchId: string;
  name: string;
  orders: BranchSale[];
  paymentTotals: { method: string; amountBase: string }[];
}

function SalesByBranchTab({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<{ branchId: string; name: string; isMain: boolean; ordersCount: number; totalBase: string }[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<{ id: string; isMain: boolean } | null>(null);

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
          <button
            key={r.branchId}
            onClick={() => setSelectedBranch({ id: r.branchId, isMain: r.isMain })}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-brand-950/[0.02]"
          >
            <div>
              <p className="text-sm font-medium text-brand-950">
                {r.name} {r.isMain && <span className="text-xs text-brand-950/40 font-normal">(sede principal)</span>}
              </p>
              <p className="text-xs text-brand-950/50">{r.ordersCount} pedidos</p>
            </div>
            <p className="text-sm font-semibold text-brand-950">{formatBase(r.totalBase, symbol)}</p>
          </button>
        ))}
      </div>

      {selectedBranch && (
        <BranchSalesDialog
          branchId={selectedBranch.id}
          range={range}
          symbol={symbol}
          onClose={() => setSelectedBranch(null)}
        />
      )}
    </div>
  );
}

/** Drill-down al presionar una sucursal en "Ventas por sucursal": historial completo + montos por método de pago. */
function BranchSalesDialog({
  branchId,
  range,
  symbol,
  onClose,
}: {
  branchId: string;
  range: Range;
  symbol: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<BranchSalesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<BranchSale | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/branches/reports/sales/${branchId}`, { params: { range } })
      .then((res) => setDetail(res.data.data))
      .finally(() => setLoading(false));
  }, [branchId, range]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{detail ? detail.name : 'Ventas de la sucursal'}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto space-y-1">
          {loading && <p className="text-sm text-brand-950/40 font-light py-2">Cargando ventas…</p>}
          {!loading && detail?.orders.length === 0 && (
            <p className="text-sm text-brand-950/40 font-light py-2">Sin ventas en este período.</p>
          )}
          {!loading &&
            detail?.orders.map((sale) => (
              <button
                key={sale.id}
                onClick={() => setSelectedSale(sale)}
                className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-950/[0.04]"
              >
                <div className="min-w-0">
                  <p className="font-medium text-brand-950">
                    #{sale.orderNumber} · {sale.table ? `Mesa ${sale.table}` : CHANNEL_ROW_LABELS[sale.channel]}
                  </p>
                  <p className="text-xs text-brand-950/40">
                    {new Date(sale.createdAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
                <p className="font-semibold text-brand-950 shrink-0">{formatBase(sale.totalBase, symbol)}</p>
              </button>
            ))}
        </div>

        {!loading && detail && detail.paymentTotals.length > 0 && (
          <div className="pt-3 border-t border-brand-950/10">
            <p className="text-xs font-medium text-brand-950/60 mb-1.5">Montos por método de pago</p>
            <div className="rounded-xl border border-brand-950/10 divide-y divide-brand-950/[0.06]">
              {detail.paymentTotals.map((p) => (
                <div key={p.method} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <p className="text-brand-950/80">{PAYMENT_LABELS[p.method as PaymentMethod] ?? p.method}</p>
                  <p className="font-medium text-brand-950">{formatBase(p.amountBase, symbol)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>

      {selectedSale && <BranchSaleDetailDialog sale={selectedSale} symbol={symbol} onClose={() => setSelectedSale(null)} />}
    </Dialog>
  );
}

/** Detalle completo de una venta dentro del drill-down de una sucursal. */
function BranchSaleDetailDialog({ sale, symbol, onClose }: { sale: BranchSale; symbol: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Pedido #{sale.orderNumber} · {sale.table ? `Mesa ${sale.table}` : CHANNEL_ROW_LABELS[sale.channel]}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-brand-950/50 font-light">
            {new Date(sale.createdAt).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' })}
            {sale.customerName && ` · ${sale.customerName}`}
          </p>

          <div>
            <p className="text-xs font-medium text-brand-950/60 mb-1.5">Comanda</p>
            <div className="rounded-xl border border-brand-950/10 divide-y divide-brand-950/[0.06]">
              {sale.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <p className="text-brand-950/80">
                    {item.quantity}× {item.productName}
                  </p>
                  <p className="font-medium text-brand-950 shrink-0">{formatBase(item.lineTotal, symbol)}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 px-1 pt-2 text-sm font-semibold text-brand-950">
              <p>Total</p>
              <p>
                {formatBase(sale.totalBase, symbol)} · {formatBsAbsolute(sale.totalBs)}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-brand-950/60 mb-1.5">Pago{sale.payments.length === 1 ? '' : 's'}</p>
            {sale.payments.length === 0 ? (
              <p className="text-xs text-brand-950/40 font-light">
                Sin pago registrado{sale.paymentMethod ? ` (método: ${PAYMENT_LABELS[sale.paymentMethod as PaymentMethod] ?? sale.paymentMethod})` : ''}.
              </p>
            ) : (
              <div className="rounded-xl border border-brand-950/10 divide-y divide-brand-950/[0.06]">
                {sale.payments.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <p className="font-medium text-brand-950">{PAYMENT_LABELS[p.method as PaymentMethod] ?? p.method}</p>
                    <p className="text-brand-950/60">{formatBase(p.amountBase, symbol)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface BranchInventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: string;
  minQuantity: string;
  pricePerUnitBase: string | null;
  low: boolean;
}

/** Cantidad exacta en la unidad base del insumo (kg/lt/ml/unidad), sin convertir a sub-unidades. */
function formatExactQuantity(quantity: string, unit: string): string {
  const n = Number(quantity);
  return `${n.toFixed(n % 1 === 0 ? 0 : 2)} ${unit}`;
}

function InventoryByBranchTab() {
  const [rows, setRows] = useState<{ branchId: string; name: string; isMain: boolean; items: BranchInventoryItem[] }[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/branches/reports/inventory')
      .then((res) => setRows(res.data.data))
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="space-y-4">
      {rows.map((r) => {
        const lowCount = r.items.filter((i) => i.low).length;
        const isOpen = expanded === r.branchId;
        return (
          <div key={r.branchId} className="rounded-2xl border border-brand-950/10 bg-white shadow-sm overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : r.branchId)}
              className="w-full flex items-center justify-between gap-2 p-4 text-left hover:bg-brand-950/[0.02]"
            >
              <p className="text-sm font-medium text-brand-950">
                {r.name} {r.isMain && <span className="text-xs text-brand-950/40 font-normal">(sede principal)</span>}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {lowCount > 0 && (
                  <span className="flex items-center gap-1 text-xs font-medium text-amber-700">
                    <TriangleAlert className="h-3.5 w-3.5" /> {lowCount} bajo mínimo
                  </span>
                )}
                <ChevronDown className={`h-4 w-4 text-brand-950/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {isOpen && (() => {
              const visibleItems = lowCount > 0 ? r.items.filter((i) => i.low) : r.items;
              if (visibleItems.length === 0) {
                return <p className="px-4 pb-4 text-xs text-brand-950/50">Sin insumos cargados.</p>;
              }
              return (
              <div className="px-4 pb-4 space-y-3">
                {visibleItems.map((item) => {
                  const qty = Number(item.quantity);
                  const minQty = Number(item.minQuantity);
                  const ratio = minQty > 0 ? Math.min(1, qty / (minQty * 2)) : 1;
                  const barColor = item.low ? 'bg-red-500' : ratio < 0.75 ? 'bg-amber-500' : 'bg-emerald-500';
                  return (
                    <div key={item.id}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className={`flex items-center gap-1.5 ${item.low ? 'text-amber-700' : 'text-brand-950'}`}>
                          {item.low && <TriangleAlert className="h-3.5 w-3.5 shrink-0" />}
                          {item.name}
                        </span>
                        <span className="text-brand-950/60 text-xs">
                          {formatExactQuantity(item.quantity, item.unit)} · mín. {formatExactQuantity(item.minQuantity, item.unit)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-brand-950/[0.08] overflow-hidden mt-1">
                        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${ratio * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

function TopProductsTab({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<
    {
      branchId: string;
      name: string;
      isMain: boolean;
      topProducts: { name: string; quantity: number; revenueBase: string; profitBase: string }[];
    }[]
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
                  <span className="truncate">{p.name}</span>
                  <span className="text-right shrink-0">
                    <span className="text-brand-950/50">{p.quantity} und.</span>
                    <span className="text-emerald-600 font-medium ml-2">+{formatBase(p.profitBase, symbol)}</span>
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
