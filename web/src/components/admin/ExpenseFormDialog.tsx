import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { SupplierPicker } from './SupplierPicker';
import type { Supplier } from '@/types';

export type ExpenseCategory =
  | 'UTILITIES'
  | 'SUPPLIES'
  | 'RENT'
  | 'PAYROLL'
  | 'ADMINISTRATIVE'
  | 'MARKETING'
  | 'TRANSPORT'
  | 'MAINTENANCE'
  | 'FURNITURE'
  | 'FUEL'
  | 'TRAVEL'
  | 'MEALS'
  | 'LODGING'
  | 'OTHER';

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  UTILITIES: 'Servicios públicos',
  SUPPLIES: 'Compra de producto e insumos',
  RENT: 'Arriendo',
  PAYROLL: 'Nómina',
  ADMINISTRATIVE: 'Gastos administrativos',
  MARKETING: 'Mercadeo y Publicidad',
  TRANSPORT: 'Transporte (fletes, taxis)',
  MAINTENANCE: 'Mantenimiento',
  FURNITURE: 'Muebles',
  FUEL: 'Combustible / gasolina',
  TRAVEL: 'Viáticos y viajes',
  MEALS: 'Comidas',
  LODGING: 'Hospedaje / hotel',
  OTHER: 'Otros',
};

/** Categorías de gasto de operación/viaje: para estas, el formulario ofrece de una vez los
 * campos de soporte (quién lo gastó, recibo) en vez de tenerlos escondidos. */
const FIELD_TRIP_CATEGORIES = new Set<ExpenseCategory>(['FUEL', 'TRAVEL', 'MEALS', 'LODGING', 'TRANSPORT']);

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo Bs',
  CASH_USD: 'Efectivo $',
  MOBILE_PAYMENT: 'Pago Móvil',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta / punto',
  ZELLE: 'Zelle',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
};

interface InventoryOption {
  id: string;
  name: string;
  unit: string;
}

/** Gasto ya cargado que se está corrigiendo (monto mal tipeado, categoría equivocada, factura
 * que llegó después). Solo los campos que el formulario sabe reponer. */
export interface EditableExpense {
  id: string;
  amountBase: string;
  description: string;
  category?: string | null;
  supplier?: { id: string; name: string } | null;
  paymentMethod?: string | null;
  expenseDate?: string | null;
  referenceNumber?: string | null;
  spentByName?: string | null;
  receiptImageUrl?: string | null;
  isCredit?: boolean;
}

/** Cuerpo de "Agregar/Editar gasto" — egreso con categoría, proveedor y reabastecimiento
 * opcional de inventario — sin cáscara de diálogo. `ExpenseFormDialog` (ventana flotante,
 * usada en el Dashboard y en el módulo de Gastos) y Administración de Canchas/Locales
 * (panel en línea) son los consumidores, para que todo egreso quede siempre vinculado a la
 * misma sección sin importar desde dónde se cargue. */
export function ExpenseForm({ onCreated, expense }: { onCreated: () => void; expense?: EditableExpense }) {
  const { restaurant } = useAuth();
  const isEdit = !!expense;
  // El reabastecimiento descuenta contra InventoryItem (insumos de restaurante). Un local
  // comercial y un club manejan su stock en ShopProduct, así que ahí ese bloque no aplica:
  // mostraría una lista vacía y, si se llenara, tocaría un inventario que no usan.
  const supportsRestock = restaurant?.businessType !== 'SHOP' && restaurant?.businessType !== 'SPORTS_CLUB';
  // Al editar se arranca con lo que ya tenía el gasto; el monto siempre en moneda base,
  // que es como quedó guardado (la conversión desde Bs ya se aplicó al crearlo).
  const [amount, setAmount] = useState(expense ? Number(expense.amountBase).toFixed(2) : '');
  const [amountCurrency, setAmountCurrency] = useState<'BASE' | 'BS'>('BASE');
  const [description, setDescription] = useState(expense?.description ?? '');
  const [category, setCategory] = useState<ExpenseCategory | ''>((expense?.category as ExpenseCategory) ?? '');
  const [supplier, setSupplier] = useState<Supplier | null>(
    expense?.supplier ? ({ id: expense.supplier.id, name: expense.supplier.name } as Supplier) : null,
  );
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [isRestock, setIsRestock] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryOption[]>([]);
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [inventoryQuantity, setInventoryQuantity] = useState('');
  const [isCredit, setIsCredit] = useState(expense?.isCredit ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // --- Soporte del gasto ---
  const [paymentMethod, setPaymentMethod] = useState(expense?.paymentMethod ?? '');
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate ? expense.expenseDate.slice(0, 10) : '');
  const [referenceNumber, setReferenceNumber] = useState(expense?.referenceNumber ?? '');
  const [spentByName, setSpentByName] = useState(expense?.spentByName ?? '');
  const [receiptImageUrl, setReceiptImageUrl] = useState(expense?.receiptImageUrl ?? '');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const isFieldTrip = category !== '' && FIELD_TRIP_CATEGORIES.has(category);

  async function uploadReceipt(file: File) {
    setUploadingReceipt(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('photo', file);
      const res = await api.post('/movements/upload-receipt', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setReceiptImageUrl(res.data.data.url);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo subir el recibo.');
    } finally {
      setUploadingReceipt(false);
    }
  }

  useEffect(() => {
    if (isRestock && inventoryItems.length === 0) {
      api.get('/inventory').then((res) => setInventoryItems(res.data.data));
    }
  }, [isRestock, inventoryItems.length]);

  async function submit() {
    const amountBase = Number(amount);
    if (!amountBase || amountBase <= 0) {
      setError('Escribe un monto válido.');
      return;
    }
    if (!description.trim()) {
      setError('Escribe una descripción.');
      return;
    }
    if (isRestock && (!inventoryItemId || !inventoryQuantity)) {
      setError('Elige el insumo y la cantidad recibida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Al editar se manda null (no undefined) en lo que se vació, para que el backend lo
      // limpie de verdad en vez de dejar el valor viejo.
      const payload = {
        amountBase,
        amountCurrency,
        description: description.trim(),
        category: category || (isEdit ? null : undefined),
        supplierId: supplier?.id ?? (isEdit ? null : undefined),
        inventoryItemId: isRestock ? inventoryItemId : isEdit ? null : undefined,
        inventoryQuantity: isRestock ? Number(inventoryQuantity) : isEdit ? null : undefined,
        isCredit,
        paymentMethod: paymentMethod || (isEdit ? null : undefined),
        expenseDate: expenseDate || (isEdit ? null : undefined),
        referenceNumber: referenceNumber.trim() || (isEdit ? null : undefined),
        spentByName: spentByName.trim() || (isEdit ? null : undefined),
        receiptImageUrl: receiptImageUrl || (isEdit ? null : undefined),
      };
      if (isEdit) await api.patch(`/movements/${expense!.id}`, payload);
      else await api.post('/movements', { type: 'EXPENSE', ...payload });
      onCreated();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo guardar el gasto.');
    } finally {
      setSaving(false);
    }
  }

  if (showSupplierPicker) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-brand-950/70">Escoge el proveedor</p>
        <SupplierPicker
          onSelect={(s) => {
            setSupplier(s);
            setShowSupplierPicker(false);
          }}
        />
        <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => setShowSupplierPicker(false)}>
          Cancelar
        </TextureButton>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">Monto</p>
          <input
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />
        </div>
        <div>
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">Moneda</p>
          <select
            value={amountCurrency}
            onChange={(e) => setAmountCurrency(e.target.value as 'BASE' | 'BS')}
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          >
            <option value="BASE">$</option>
            <option value="BS">Bs</option>
          </select>
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-brand-950/50 mb-1.5">Descripción</p>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ej: Compra de agua embotellada"
          className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
        />
      </div>
      <div>
        <p className="text-xs font-medium text-brand-950/50 mb-1.5">Categoría</p>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ExpenseCategory | '')}
          className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
        >
          <option value="">Sin categoría</option>
          {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">¿Con qué se pagó?</p>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          >
            <option value="">Sin especificar</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">Fecha del gasto</p>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />
        </div>
      </div>
      <p className="text-[11px] text-brand-950/40 font-light -mt-1">
        Deja la fecha vacía si el gasto es de hoy.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">Nº de factura o referencia</p>
          <input
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="Opcional"
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />
        </div>
        <div>
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">
            ¿Quién lo gastó?{isFieldTrip ? '' : ' (opcional)'}
          </p>
          <input
            value={spentByName}
            onChange={(e) => setSpentByName(e.target.value)}
            placeholder={isFieldTrip ? 'Ej: chofer, vendedor…' : 'Opcional'}
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />
        </div>
      </div>

      {/* Recibo: en gastos de viaje es el soporte que se pierde y sin el cual no hay
          cómo justificar el egreso, por eso se destaca en esas categorías. */}
      <div className={`rounded-lg border px-2.5 py-2 ${isFieldTrip ? 'border-brand-500/30 bg-brand-500/[0.04]' : 'border-brand-950/10'}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-brand-950/70">
            {receiptImageUrl ? '✓ Recibo adjunto' : uploadingReceipt ? 'Subiendo…' : 'Foto del recibo'}
          </span>
          {receiptImageUrl ? (
            <button
              type="button"
              onClick={() => setReceiptImageUrl('')}
              className="text-xs font-medium text-red-600 hover:text-red-700 shrink-0"
            >
              Quitar
            </button>
          ) : (
            <label className="text-xs font-medium text-brand-500 hover:text-brand-600 shrink-0 cursor-pointer">
              Adjuntar
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadReceipt(f);
                }}
              />
            </label>
          )}
        </div>
        {receiptImageUrl && (
          <img src={receiptImageUrl} alt="Recibo" className="mt-2 max-h-32 rounded-md border border-brand-950/10" />
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-brand-950/10 px-2.5 py-2">
        <span className="text-sm text-brand-950/70">
          {supplier ? `Proveedor: ${supplier.name}` : 'Sin proveedor'}
        </span>
        <button
          type="button"
          onClick={() => setShowSupplierPicker(true)}
          className="text-xs font-medium text-brand-500 hover:text-brand-600 shrink-0"
        >
          {supplier ? 'Cambiar' : 'Escoge el proveedor'}
        </button>
      </div>

      {supportsRestock && (
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={isRestock} onChange={(e) => setIsRestock(e.target.checked)} />
          ¿Es reabastecimiento de inventario?
        </label>
      )}
      {supportsRestock && isRestock && (
        <div className="grid grid-cols-2 gap-2 pl-5">
          <select
            value={inventoryItemId}
            onChange={(e) => setInventoryItemId(e.target.value)}
            className="text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          >
            <option value="">Insumo…</option>
            {inventoryItems.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name} ({it.unit})
              </option>
            ))}
          </select>
          <input
            value={inventoryQuantity}
            onChange={(e) => setInventoryQuantity(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="Cantidad recibida"
            className="text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />
        </div>
      )}

      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" checked={isCredit} onChange={(e) => setIsCredit(e.target.checked)} />
        ¿A crédito? (queda pendiente por pagar al proveedor)
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <TextureButton variant="brand" size="default" disabled={saving} onClick={submit} className="disabled:opacity-50">
        {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar gasto'}
      </TextureButton>
    </div>
  );
}

/** Ventana flotante — usada fuera de Administración (Dashboard "Añadir egreso", módulo de
 * Gastos). Dentro de Administración (Canchas/Locales) se usa `ExpenseForm` directo dentro de
 * un InlinePanel. */
export function ExpenseFormDialog({
  onClose,
  onCreated,
  expense,
}: {
  onClose: () => void;
  onCreated: () => void;
  /** Si viene, el diálogo edita ese gasto en vez de crear uno nuevo. */
  expense?: EditableExpense;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? 'Editar gasto' : 'Agregar gasto'}</DialogTitle>
        </DialogHeader>
        <ExpenseForm onCreated={onCreated} expense={expense} />
      </DialogContent>
    </Dialog>
  );
}
