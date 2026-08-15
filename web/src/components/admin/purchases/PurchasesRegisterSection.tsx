import { useCallback, useEffect, useState } from 'react';
import { Plus, ShoppingCart } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { MetricCard } from '@/components/admin/MetricCard';
import { ExpenseFormDialog, DOCUMENT_TYPE_LABELS, type ExpenseDocumentType, type EditableExpense } from '@/components/admin/ExpenseFormDialog';
import { PAYMENT_LABELS } from '@/components/admin/PaymentDialog';
import type { PaymentMethod, Supplier } from '@/types';

type Range = 'day' | 'week' | 'month' | 'year' | 'all';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Semana', month: 'Este mes', year: 'Este año', all: 'Todo' };

interface PurchaseRow {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amountBase: string;
  description: string;
  category: string | null;
  supplier: { id: string; name: string; taxId?: string | null } | null;
  paymentMethod: PaymentMethod | null;
  referenceNumber: string | null;
  documentType: ExpenseDocumentType | null;
  isCredit: boolean;
  creditPaidAt: string | null;
  invoiceDueDate: string | null;
  expenseDate: string | null;
  createdAt: string;
  receiptImageUrl: string | null;
  quoteImageUrl?: string | null;
  paymentProofImageUrl?: string | null;
  notes?: string | null;
  isRecurring?: boolean;
  spentByName?: string | null;
  inventoryItem?: { name: string } | null;
  inventoryQuantity?: string | null;
}

const card = 'rounded-2xl border border-brand-950/10 bg-white shadow-sm';

/**
 * Compras → Registro de compras: cada compra a proveedores (egresos con proveedor o de la
 * categoría "Compra de producto e insumos"), con filtro por proveedor y fecha, y el botón
 * "Registrar compra" — el único lugar donde una compra reabastece el inventario (el
 * checkbox de reabastecimiento se quitó de Gastos).
 */
export function PurchasesRegisterSection() {
  const { restaurant } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const [range, setRange] = useState<Range>('month');
  const [date, setDate] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rows, setRows] = useState<PurchaseRow[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EditableExpense | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get('/movements', { params: { range, date: date || undefined, supplierId: supplierId || undefined } })
      .then((res) => {
        const all = res.data.data.movements as PurchaseRow[];
        // Compra = egreso con proveedor o de la categoría de insumos.
        setRows(all.filter((m) => m.type === 'EXPENSE' && (m.supplier || m.category === 'SUPPLIES')));
      })
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudieron cargar las compras.'));
  }, [range, date, supplierId]);

  useEffect(load, [load]);
  useEffect(() => {
    api.get('/suppliers').then((res) => setSuppliers(res.data.data)).catch(() => setSuppliers([]));
  }, []);

  const total = (rows ?? []).reduce((acc, r) => acc + Number(r.amountBase), 0);
  const pending = (rows ?? []).filter((r) => r.isCredit && !r.creditPaidAt);
  const pendingTotal = pending.reduce((acc, r) => acc + Number(r.amountBase), 0);
  const periodLabel = date ? new Date(date + 'T12:00:00').toLocaleDateString('es-VE') : RANGE_LABELS[range];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['day', 'week', 'month', 'year', 'all'] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => {
              setRange(r);
              setDate('');
            }}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              !date && range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`text-xs font-medium px-2.5 py-1 rounded-full border-none ${
            date ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
          }`}
        />
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="text-xs font-medium border border-brand-950/15 rounded-full px-2.5 py-1.5 text-brand-950/60"
        >
          <option value="">Todos los proveedores</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <TextureButton variant="brand" size="sm" className="!w-auto" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Registrar compra
          </TextureButton>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={ShoppingCart} title={`Comprado · ${periodLabel}`} value={formatBase(total, symbol)} caption={`${rows?.length ?? 0} compra${rows?.length === 1 ? '' : 's'}`} />
        <MetricCard title="Pendiente por pagar" value={formatBase(pendingTotal, symbol)} valueTone={pendingTotal > 0 ? 'danger' : undefined} caption={`${pending.length} a crédito sin saldar`} highlighted={pendingTotal > 0} />
        <MetricCard title="Proveedores" value={String(new Set((rows ?? []).map((r) => r.supplier?.id).filter(Boolean)).size)} caption="con compras en el período" />
      </div>

      <div className={`${card} overflow-x-auto`}>
        <div className="flex min-w-[720px] items-center gap-3 border-b border-brand-950/[0.06] px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
          <span className="w-20 shrink-0">Fecha</span>
          <span className="flex-1">Compra</span>
          <span className="w-40 shrink-0">Proveedor</span>
          <span className="w-24 shrink-0">Documento</span>
          <span className="w-24 shrink-0">Método</span>
          <span className="w-24 shrink-0 text-right">Monto</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
          {rows?.length === 0 && <p className="p-5 text-sm font-light text-brand-950/40">Sin compras en este filtro.</p>}
          {rows?.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setEditing(r as EditableExpense)}
              className="flex w-full min-w-[720px] items-center gap-3 px-5 py-2.5 text-left text-sm transition-colors hover:bg-brand-950/[0.03]"
            >
              <span className="w-20 shrink-0 text-xs text-brand-950/50">
                {new Date(r.expenseDate ?? r.createdAt).toLocaleDateString('es-VE')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-brand-950">{r.description}</span>
                <span className="block truncate text-xs font-light text-brand-950/40">
                  {r.inventoryItem && `Repuso ${Number(r.inventoryQuantity ?? 0)} de ${r.inventoryItem.name} · `}
                  {r.referenceNumber && `Ref. ${r.referenceNumber} · `}
                  {r.isCredit
                    ? r.creditPaidAt
                      ? 'Crédito pagado'
                      : `A crédito${r.invoiceDueDate ? ` · vence ${new Date(r.invoiceDueDate).toLocaleDateString('es-VE')}` : ''}`
                    : 'Pagada'}
                </span>
              </span>
              <span className="w-40 shrink-0 truncate text-xs text-brand-950/60">{r.supplier?.name ?? '—'}</span>
              <span className="w-24 shrink-0 truncate text-xs text-brand-950/60">
                {r.documentType ? DOCUMENT_TYPE_LABELS[r.documentType] : '—'}
              </span>
              <span className="w-24 shrink-0 truncate text-xs text-brand-950/60">
                {r.paymentMethod ? PAYMENT_LABELS[r.paymentMethod] : r.isCredit ? 'Crédito' : '—'}
              </span>
              <span className={`w-24 shrink-0 text-right font-semibold ${r.isCredit && !r.creditPaidAt ? 'text-amber-700' : 'text-brand-950'}`}>
                {formatBase(r.amountBase, symbol)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <ExpenseFormDialog
          mode="purchase"
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
      {editing && (
        <ExpenseFormDialog
          mode="purchase"
          expense={editing}
          onClose={() => setEditing(null)}
          onCreated={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
