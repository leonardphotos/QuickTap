import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { InlinePanel } from './InlinePanel';
import { MetricCard } from './MetricCard';
import { Wallet, Receipt, Clock } from 'lucide-react';
import { CATEGORY_LABELS, DOCUMENT_TYPE_LABELS, type ExpenseCategory, type ExpenseDocumentType } from './ExpenseFormDialog';

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  taxId: string | null;
  _count?: { movements: number };
}

interface PurchaseRow {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amountBase: string;
  description: string;
  category: ExpenseCategory | null;
  documentType: ExpenseDocumentType | null;
  referenceNumber: string | null;
  isCredit: boolean;
  creditPaidAt: string | null;
  isRecurring: boolean;
  expenseDate: string | null;
  invoiceDueDate: string | null;
  createdAt: string;
  receiptImageUrl: string | null;
  quoteImageUrl: string | null;
  paymentProofImageUrl: string | null;
  notes: string | null;
}

type Range = 'day' | 'week' | 'month' | 'year' | 'all';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Semana', month: 'Este mes', year: 'Este año', all: 'Todo' };

const card = 'rounded-2xl border border-brand-950/10 bg-white shadow-sm';

/**
 * Proveedores: lista con CRUD + relación de cuenta por proveedor — todo lo que se le ha
 * comprado a cada uno, con el detalle de cada compra y filtro por fecha. Compartido por los
 * tres verticales (los gastos con proveedor viven en /movements sin importar el vertical).
 */
export function SuppliersSection() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get('/suppliers')
      .then((res) => setSuppliers(res.data.data))
      .catch(() => setError('No pudimos cargar los proveedores.'));
  }, []);

  useEffect(load, [load]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!suppliers) return <p className="text-sm text-brand-950/40 font-light">Cargando proveedores…</p>;

  if (selected) {
    return <SupplierStatement supplier={selected} onClose={() => setSelected(null)} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <TextureButton variant="brand" size="sm" className="!w-auto" onClick={() => setEditing('new')}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Agregar proveedor
        </TextureButton>
      </div>

      {editing && (
        <SupplierForm
          supplier={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <div className={`${card} overflow-hidden`}>
        <div className="hidden sm:flex items-center gap-3 px-5 py-2 border-b border-brand-950/[0.06] text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
          <span className="flex-1">Proveedor</span>
          <span className="w-28">Compras</span>
          <span className="w-32 text-right">Acciones</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
          {suppliers.length === 0 && (
            <p className="p-5 text-sm text-brand-950/40 font-light">
              Todavía no tienes proveedores. Agrégalos aquí o desde el formulario de gastos.
            </p>
          )}
          {suppliers.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-5 py-3">
              <button type="button" onClick={() => setSelected(s)} className="min-w-0 flex-1 text-left hover:opacity-80">
                <p className="text-sm font-medium text-brand-950 truncate">{s.name}</p>
                <p className="text-xs text-brand-950/40 font-light">
                  {s.taxId ? `RIF: ${s.taxId}` : 'Sin RIF'}
                  {s.phone && ` · ${s.phone}`}
                </p>
              </button>
              <span className="w-28 shrink-0 text-xs text-brand-950/50">
                {s._count?.movements ?? 0} compra{(s._count?.movements ?? 0) === 1 ? '' : 's'}
              </span>
              <div className="flex w-32 shrink-0 items-center justify-end gap-1">
                <TextureButton variant="secondary" size="sm" className="!w-auto" onClick={() => setSelected(s)}>
                  Relación
                </TextureButton>
                <button
                  type="button"
                  onClick={() => setEditing(s)}
                  className="rounded-full p-1.5 text-brand-950/40 hover:text-brand-950 hover:bg-brand-950/5"
                  aria-label="Editar proveedor"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SupplierForm({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(supplier?.name ?? '');
  const [taxId, setTaxId] = useState(supplier?.taxId ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError('Escribe el nombre del proveedor.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), taxId: taxId.trim() || null, phone: phone.trim() || null };
      if (supplier) await api.patch(`/suppliers/${supplier.id}`, payload);
      else await api.post('/suppliers', payload);
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo guardar el proveedor.');
      setSaving(false);
    }
  }

  async function remove() {
    if (!supplier) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/suppliers/${supplier.id}`);
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo borrar el proveedor.');
      setSaving(false);
      setConfirmingDelete(false);
    }
  }

  const inputCls = 'w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5';

  return (
    <InlinePanel title={supplier ? 'Editar proveedor' : 'Agregar proveedor'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">Nombre</p>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Distribuidora La Espiga" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs font-medium text-brand-950/50 mb-1.5">RIF o cédula (opcional)</p>
            <input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="J-12345678-9" className={inputCls} />
          </div>
          <div>
            <p className="text-xs font-medium text-brand-950/50 mb-1.5">Teléfono (opcional)</p>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0412-1234567" className={inputCls} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-2">
          <TextureButton variant="brand" size="default" disabled={saving} onClick={submit} className="disabled:opacity-50">
            {saving ? 'Guardando…' : supplier ? 'Guardar cambios' : 'Agregar proveedor'}
          </TextureButton>
          {supplier && (
            <button
              type="button"
              disabled={saving}
              onClick={() => (confirmingDelete ? remove() : setConfirmingDelete(true))}
              className="flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmingDelete ? '¿Seguro? Click de nuevo' : 'Borrar'}
            </button>
          )}
        </div>
      </div>
    </InlinePanel>
  );
}

/** Relación de cuenta de un proveedor: todas sus compras con detalle, filtradas por fecha. */
function SupplierStatement({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const { restaurant } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const [range, setRange] = useState<Range>('month');
  const [date, setDate] = useState('');
  const [rows, setRows] = useState<PurchaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/movements', { params: { range, date: date || undefined, supplierId: supplier.id } })
      .then((res) => setRows((res.data.data.movements as PurchaseRow[]).filter((m) => m.type === 'EXPENSE')))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar la relación de cuenta.'));
  }, [range, date, supplier.id]);

  const periodLabel = date ? new Date(date + 'T12:00:00').toLocaleDateString('es-VE') : RANGE_LABELS[range];
  const total = rows?.reduce((acc, r) => acc + Number(r.amountBase), 0) ?? 0;
  const pendingCredit = rows?.filter((r) => r.isCredit && !r.creditPaidAt).reduce((acc, r) => acc + Number(r.amountBase), 0) ?? 0;

  return (
    <InlinePanel
      title={`Relación de cuenta · ${supplier.name}`}
      description={supplier.taxId ? `RIF: ${supplier.taxId}` : undefined}
      onClose={onClose}
      closeLabel="← Volver"
      size="wide"
    >
      <div className="space-y-4">
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
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <MetricCard icon={Wallet} title={`Comprado · ${periodLabel}`} value={formatBase(total, symbol)} />
          <MetricCard icon={Receipt} title="Compras" value={String(rows?.length ?? 0)} />
          <MetricCard
            icon={Clock}
            title="Pendiente por pagar"
            value={formatBase(pendingCredit, symbol)}
            highlighted={pendingCredit > 0}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="rounded-xl border border-brand-950/10 overflow-hidden">
          <div className="hidden sm:flex items-center gap-3 px-4 py-2 border-b border-brand-950/[0.06] text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
            <span className="flex-1">Compra</span>
            <span className="w-24">Fecha</span>
            <span className="w-24 text-right">Monto</span>
          </div>
          <div className="divide-y divide-brand-950/[0.06]">
            {rows?.length === 0 && (
              <p className="p-4 text-sm text-brand-950/40 font-light">Sin compras a este proveedor en el período.</p>
            )}
            {rows?.map((r) => (
              <div key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-brand-950 truncate">{r.description}</p>
                  <p className="text-xs text-brand-950/40 font-light">
                    {r.category ? CATEGORY_LABELS[r.category] : 'Sin categoría'}
                    {r.referenceNumber && ` · Ref. ${r.referenceNumber}`}
                    {r.documentType && ` · ${DOCUMENT_TYPE_LABELS[r.documentType]}`}
                    {r.isCredit && (r.creditPaidAt ? ' · Crédito pagado' : ' · A crédito')}
                    {r.isRecurring && ' · Recurrente'}
                  </p>
                  {(r.receiptImageUrl || r.quoteImageUrl || r.paymentProofImageUrl || r.notes) && (
                    <p className="mt-0.5 text-[11px] text-brand-950/40 font-light">
                      {r.receiptImageUrl && (
                        <a href={r.receiptImageUrl} target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">
                          Factura
                        </a>
                      )}
                      {r.quoteImageUrl && (
                        <>
                          {r.receiptImageUrl && ' · '}
                          <a href={r.quoteImageUrl} target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">
                            Presupuesto
                          </a>
                        </>
                      )}
                      {r.paymentProofImageUrl && (
                        <>
                          {(r.receiptImageUrl || r.quoteImageUrl) && ' · '}
                          <a href={r.paymentProofImageUrl} target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">
                            Comprobante
                          </a>
                        </>
                      )}
                      {r.notes && (
                        <span className="text-brand-950/40">
                          {(r.receiptImageUrl || r.quoteImageUrl || r.paymentProofImageUrl) && ' · '}
                          {r.notes}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <span className="w-24 shrink-0 text-xs text-brand-950/40">
                  {new Date(r.expenseDate ?? r.createdAt).toLocaleDateString('es-VE')}
                </span>
                <span className="w-24 shrink-0 text-right text-sm font-semibold text-brand-950">
                  {formatBase(r.amountBase, symbol)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </InlinePanel>
  );
}
