import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { methodAccountsOf } from '@/utils/payment-accounts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { SupplierPicker } from './SupplierPicker';
import { MethodAccountPicker } from './MethodAccountPicker';
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

export type ExpenseDocumentType = 'FISCAL_INVOICE' | 'DELIVERY_NOTE';

export const DOCUMENT_TYPE_LABELS: Record<ExpenseDocumentType, string> = {
  FISCAL_INVOICE: 'Factura fiscal',
  DELIVERY_NOTE: 'Nota de entrega',
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
  /** Evento al que está imputado el gasto (Local Comercial). */
  shopEventProductId?: string | null;
  paymentMethod?: string | null;
  expenseDate?: string | null;
  referenceNumber?: string | null;
  spentByName?: string | null;
  receiptImageUrl?: string | null;
  quoteImageUrl?: string | null;
  paymentProofImageUrl?: string | null;
  notes?: string | null;
  documentType?: ExpenseDocumentType | null;
  /** Detalle fiscal (Libro de compras): base imponible e IVA incluidos en amountBase. */
  taxableBase?: string | null;
  ivaBase?: string | null;
  isCredit?: boolean;
  isRecurring?: boolean;
  invoiceDueDate?: string | null;
  /** Reabastecimiento ya registrado: sin esto la edición lo daba por vacío y el backend
   * deshacía el ingreso de stock al guardar. */
  inventoryItem?: { id: string; name: string } | null;
  inventoryQuantity?: string | null;
}

/** Casilla de "adjuntar foto" reusada 3 veces (factura, presupuesto, comprobante de pago) —
 * mismo look que el recibo de siempre, solo parametrizado por etiqueta/url/estado. */
function AttachmentField({
  label,
  url,
  uploading,
  onUpload,
  onRemove,
}: {
  label: string;
  url: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-brand-950/10 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-brand-950/70">{url ? `✓ ${label} adjunto` : uploading ? 'Subiendo…' : label}</span>
        {url ? (
          <button type="button" onClick={onRemove} className="text-xs font-medium text-red-600 hover:text-red-700 shrink-0">
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
                if (f) onUpload(f);
              }}
            />
          </label>
        )}
      </div>
      {url && <img src={url} alt={label} className="mt-2 max-h-32 rounded-md border border-brand-950/10" />}
    </div>
  );
}

/** Cuerpo de "Agregar/Editar gasto" — egreso con categoría, proveedor y reabastecimiento
 * opcional de inventario — sin cáscara de diálogo. `ExpenseFormDialog` (ventana flotante,
 * usada en el Dashboard y en el módulo de Gastos) y Administración de Canchas/Locales
 * (panel en línea) son los consumidores, para que todo egreso quede siempre vinculado a la
 * misma sección sin importar desde dónde se cargue. */
export function ExpenseForm({
  onCreated,
  expense,
  mode = 'expense',
}: {
  onCreated: () => void;
  expense?: EditableExpense;
  /** 'purchase' = módulo Compras: categoría "Compra de producto e insumos" por defecto y el
   * bloque de reabastecimiento de inventario. En 'expense' (Gastos) el restock no se ofrece —
   * las compras de insumos se registran desde Compras. */
  mode?: 'expense' | 'purchase';
}) {
  const { restaurant } = useAuth();
  // Eventos del local (categoría Tickets): un gasto se le puede imputar a uno, y el costo del
  // evento es la suma de los que se le asignen. Solo aplica en Local Comercial.
  const esLocal = restaurant?.businessType === 'SHOP';
  const [eventos, setEventos] = useState<{ id: string; name: string; eventDate: string | null }[]>([]);
  const [eventoId, setEventoId] = useState<string>(expense?.shopEventProductId ?? '');
  const isEdit = !!expense;
  // El reabastecimiento descuenta contra InventoryItem (insumos de restaurante). Un local
  // comercial y un club manejan su stock en ShopProduct, así que ahí ese bloque no aplica:
  // mostraría una lista vacía y, si se llenara, tocaría un inventario que no usan. Y solo se
  // ofrece desde el módulo de Compras, no desde Gastos.
  const supportsRestock =
    mode === 'purchase' && restaurant?.businessType !== 'SHOP' && restaurant?.businessType !== 'SPORTS_CLUB';
  // Al editar se arranca con lo que ya tenía el gasto; el monto siempre en moneda base,
  // que es como quedó guardado (la conversión desde Bs ya se aplicó al crearlo).
  const [amount, setAmount] = useState(expense ? Number(expense.amountBase).toFixed(2) : '');
  const [amountCurrency, setAmountCurrency] = useState<'BASE' | 'BS'>('BASE');
  const [description, setDescription] = useState(expense?.description ?? '');
  const [category, setCategory] = useState<ExpenseCategory | ''>(
    (expense?.category as ExpenseCategory) ?? (mode === 'purchase' ? 'SUPPLIES' : ''),
  );
  const [supplier, setSupplier] = useState<Supplier | null>(
    expense?.supplier ? ({ id: expense.supplier.id, name: expense.supplier.name } as Supplier) : null,
  );
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [isRestock, setIsRestock] = useState(!!expense?.inventoryItem);
  const [inventoryItems, setInventoryItems] = useState<InventoryOption[]>([]);
  const [inventoryItemId, setInventoryItemId] = useState(expense?.inventoryItem?.id ?? '');
  const [inventoryQuantity, setInventoryQuantity] = useState(
    expense?.inventoryQuantity ? Number(expense.inventoryQuantity).toString() : '',
  );
  const [isCredit, setIsCredit] = useState(expense?.isCredit ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // --- Soporte del gasto ---
  const [paymentMethod, setPaymentMethod] = useState(expense?.paymentMethod ?? '');
  // Cuenta del método de la que salió el dinero, cuando tiene varias (varios Zelle…).
  const [accountKey, setAccountKey] = useState('main');
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate ? expense.expenseDate.slice(0, 10) : '');
  const [referenceNumber, setReferenceNumber] = useState(expense?.referenceNumber ?? '');
  const [spentByName, setSpentByName] = useState(expense?.spentByName ?? '');
  const [receiptImageUrl, setReceiptImageUrl] = useState(expense?.receiptImageUrl ?? '');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [quoteImageUrl, setQuoteImageUrl] = useState(expense?.quoteImageUrl ?? '');
  const [uploadingQuote, setUploadingQuote] = useState(false);
  const [paymentProofImageUrl, setPaymentProofImageUrl] = useState(expense?.paymentProofImageUrl ?? '');
  const [uploadingPaymentProof, setUploadingPaymentProof] = useState(false);
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [documentType, setDocumentType] = useState<ExpenseDocumentType | ''>(expense?.documentType ?? '');
  // IVA de la factura (Libro de compras). Con IVA activado en el restaurante y factura fiscal es
  // obligatorio; se sugiere el 16 % desglosado del total y el usuario lo corrige si la factura
  // trae otro monto (exentos, alícuota reducida). Siempre en la misma moneda que el monto.
  const [ivaAmount, setIvaAmount] = useState(expense?.ivaBase != null ? Number(expense.ivaBase).toFixed(2) : '');
  const [ivaTouched, setIvaTouched] = useState(expense?.ivaBase != null);
  const ivaEnabled = !!restaurant?.ivaEnabled;
  const ivaRequired = ivaEnabled && documentType === 'FISCAL_INVOICE';
  const [isRecurring, setIsRecurring] = useState(expense?.isRecurring ?? false);
  const [invoiceDueDate, setInvoiceDueDate] = useState(expense?.invoiceDueDate ? expense.invoiceDueDate.slice(0, 10) : '');

  const isFieldTrip = category !== '' && FIELD_TRIP_CATEGORIES.has(category);

  // Sugerencia automática del IVA: total ÷ 1.16 × 0.16, mientras el usuario no lo haya editado.
  // Eventos del local, para poder imputarle el gasto a uno. Se piden una sola vez al abrir.
  useEffect(() => {
    if (!esLocal) return;
    let vivo = true;
    api
      .get('/shop/state')
      .then((r) => {
        if (!vivo) return;
        const productos = (r.data.data.products ?? []) as {
          id: string; name: string; isEvent?: boolean | null; eventDate?: string | null;
        }[];
        setEventos(
          productos
            .filter((p) => p.isEvent)
            .map((p) => ({ id: p.id, name: p.name, eventDate: p.eventDate ?? null })),
        );
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [esLocal]);

  useEffect(() => {
    if (!ivaRequired || ivaTouched) return;
    const total = Number(amount);
    setIvaAmount(total > 0 ? ((total / 1.16) * 0.16).toFixed(2) : '');
  }, [amount, ivaRequired, ivaTouched]);
  const methodAccounts = paymentMethod ? methodAccountsOf(restaurant?.paymentMethodsConfig, paymentMethod) : [];
  const selectedAccount = methodAccounts.find((a) => a.key === accountKey) ?? methodAccounts[0] ?? null;

  async function uploadAttachment(endpoint: string, file: File, setUrl: (u: string) => void, setUploading: (b: boolean) => void) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('photo', file);
      const res = await api.post(endpoint, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUrl(res.data.data.url);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo subir la foto.');
    } finally {
      setUploading(false);
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
    // El método de pago es obligatorio: sin él, el arqueo por método nunca cuadra. Solo el
    // gasto a crédito puede quedar sin método (todavía no salió plata de ninguna cuenta).
    if (!paymentMethod && !isCredit) {
      setError('Escoge con qué se pagó.');
      return;
    }
    if (ivaRequired && (ivaAmount === '' || Number.isNaN(Number(ivaAmount)))) {
      setError('Indica el IVA de la factura: es obligatorio para el Libro de compras.');
      return;
    }
    if (ivaAmount !== '' && Number(ivaAmount) > amountBase) {
      setError('El IVA no puede ser mayor que el total de la compra.');
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
        ...(esLocal ? { shopEventProductId: eventoId || (isEdit ? null : undefined) } : {}),
        // Si el bloque de reabastecimiento no se muestra (Gastos, local, club) se manda
        // `undefined` para que el backend conserve el que ya tenía: editar la descripción de
        // una compra no puede deshacer el ingreso de stock.
        ...(!supportsRestock && isEdit
          ? {}
          : isRestock
            ? { inventoryItemId, inventoryQuantity: Number(inventoryQuantity) }
            : isEdit
              ? { inventoryItemId: null, inventoryQuantity: null }
              : {}),
        isCredit,
        paymentMethod: paymentMethod || (isEdit ? null : undefined),
        // Solo al crear: la edición no vuelve a tocar el banco (el asiento ya quedó hecho).
        bankAccountId: isEdit ? undefined : selectedAccount?.bankAccountId ?? undefined,
        expenseDate: expenseDate || (isEdit ? null : undefined),
        referenceNumber: referenceNumber.trim() || (isEdit ? null : undefined),
        spentByName: spentByName.trim() || (isEdit ? null : undefined),
        receiptImageUrl: receiptImageUrl || (isEdit ? null : undefined),
        quoteImageUrl: quoteImageUrl || (isEdit ? null : undefined),
        paymentProofImageUrl: paymentProofImageUrl || (isEdit ? null : undefined),
        notes: notes.trim() || (isEdit ? null : undefined),
        documentType: documentType || (isEdit ? null : undefined),
        // Solo IVA: el backend deriva la base imponible (total − IVA) en la misma moneda.
        ivaBase: ivaAmount !== '' ? Number(ivaAmount) : isEdit ? null : undefined,
        isRecurring,
        invoiceDueDate: invoiceDueDate || (isEdit ? null : undefined),
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
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">¿Con qué se pagó? {!isCredit && <span className="text-red-500">*</span>}</p>
          <select
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value);
              setAccountKey('main');
            }}
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          >
            <option value="">{isCredit ? 'Queda a crédito' : 'Escoge un método…'}</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          {!isEdit && (
            <MethodAccountPicker
              accounts={methodAccounts}
              value={selectedAccount?.key ?? 'main'}
              onChange={setAccountKey}
              label="¿De cuál cuenta salió?"
            />
          )}
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

      <div>
        <p className="text-xs font-medium text-brand-950/50 mb-1.5">Vencimiento de la factura (opcional)</p>
        <input
          type="date"
          value={invoiceDueDate}
          onChange={(e) => setInvoiceDueDate(e.target.value)}
          className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
        />
        <p className="text-[11px] text-brand-950/40 font-light mt-1">
          Si la cargas, Cuentas por pagar te avisa cuando la factura esté por vencer o vencida.
        </p>
      </div>

      {/* Soporte del gasto: en gastos de viaje es lo que se pierde y sin lo cual no hay cómo
          justificar el egreso, por eso se destaca en esas categorías. */}
      <div className={`space-y-2 rounded-lg ${isFieldTrip ? 'border border-brand-500/30 bg-brand-500/[0.04] p-2' : ''}`}>
        <AttachmentField
          label="Factura"
          url={receiptImageUrl}
          uploading={uploadingReceipt}
          onUpload={(f) => uploadAttachment('/movements/upload-receipt', f, setReceiptImageUrl, setUploadingReceipt)}
          onRemove={() => setReceiptImageUrl('')}
        />
        <AttachmentField
          label="Presupuesto"
          url={quoteImageUrl}
          uploading={uploadingQuote}
          onUpload={(f) => uploadAttachment('/movements/upload-quote', f, setQuoteImageUrl, setUploadingQuote)}
          onRemove={() => setQuoteImageUrl('')}
        />
        <AttachmentField
          label="Comprobante de pago"
          url={paymentProofImageUrl}
          uploading={uploadingPaymentProof}
          onUpload={(f) => uploadAttachment('/movements/upload-payment-proof', f, setPaymentProofImageUrl, setUploadingPaymentProof)}
          onRemove={() => setPaymentProofImageUrl('')}
        />
      </div>

      <div>
        <p className="text-xs font-medium text-brand-950/50 mb-1.5">Tipo de documento (opcional)</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(DOCUMENT_TYPE_LABELS) as ExpenseDocumentType[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDocumentType((prev) => (prev === d ? '' : d))}
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                documentType === d ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
              }`}
            >
              {DOCUMENT_TYPE_LABELS[d]}
            </button>
          ))}
        </div>
        {ivaEnabled && (documentType === 'FISCAL_INVOICE' || ivaAmount !== '') && (
          <div className="mt-3 rounded-xl border border-brand-950/10 bg-brand-50/40 p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="text-xs font-medium text-brand-950/60">
                IVA incluido en el total {ivaRequired ? <span className="text-red-500">*</span> : '(opcional)'}
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-brand-950/40">
                    {amountCurrency === 'BS' ? 'Bs' : restaurant?.currencySymbol ?? '$'}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={ivaAmount}
                    onChange={(e) => {
                      setIvaTouched(true);
                      setIvaAmount(e.target.value);
                    }}
                    className="w-40 rounded-lg border border-brand-950/15 py-1.5 pl-8 pr-2 text-sm font-semibold text-brand-950"
                  />
                </div>
              </label>
              <div className="text-right text-xs text-brand-950/60">
                <p>
                  Base imponible:{' '}
                  <span className="font-semibold text-brand-950">
                    {amountCurrency === 'BS' ? 'Bs ' : restaurant?.currencySymbol ?? '$'}
                    {Math.max(0, (Number(amount) || 0) - (Number(ivaAmount) || 0)).toFixed(2)}
                  </span>
                </p>
                {ivaTouched && (
                  <button
                    type="button"
                    onClick={() => {
                      setIvaTouched(false);
                      const total = Number(amount);
                      setIvaAmount(total > 0 ? ((total / 1.16) * 0.16).toFixed(2) : '');
                    }}
                    className="text-[11px] font-medium text-brand-500 hover:underline"
                  >
                    Recalcular al 16 %
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-[11px] font-light text-brand-950/50">
              Este IVA es el crédito fiscal que va al Libro de compras. Si la factura tiene renglones exentos, corrige el monto a mano.
            </p>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-brand-950/50 mb-1.5">Nota (opcional)</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Detalle adicional, condiciones, por qué del gasto…"
          rows={2}
          className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5 resize-none"
        />
      </div>

      {/* Imputar el gasto a un evento: es lo que le da costo real al evento (local, sonido,
          permisos). Solo se ofrece si el local tiene eventos cargados. */}
      {esLocal && eventos.length > 0 && (
        <label className="block text-sm">
          <span className="text-brand-950/70">Gasto de un evento</span>
          <select
            value={eventoId}
            onChange={(e) => setEventoId(e.target.value)}
            className="mt-1 w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          >
            <option value="">No es de un evento</option>
            {eventos.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
                {ev.eventDate ? ` · ${ev.eventDate.split('-').reverse().join('/')}` : ''}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] font-light text-brand-950/45">
            El costo del evento es la suma de los gastos que le asignes.
          </span>
        </label>
      )}

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

      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
        ¿Es un gasto recurrente? (alquiler, nómina, servicios…)
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <TextureButton variant="brand" size="default" disabled={saving} onClick={submit} className="disabled:opacity-50">
        {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : mode === 'purchase' ? 'Guardar compra' : 'Guardar gasto'}
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
  mode = 'expense',
}: {
  onClose: () => void;
  onCreated: () => void;
  /** Si viene, el diálogo edita ese gasto en vez de crear uno nuevo. */
  expense?: EditableExpense;
  mode?: 'expense' | 'purchase';
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {expense ? (mode === 'purchase' ? 'Editar compra' : 'Editar gasto') : mode === 'purchase' ? 'Registrar compra' : 'Agregar gasto'}
          </DialogTitle>
        </DialogHeader>
        <ExpenseForm onCreated={onCreated} expense={expense} mode={mode} />
      </DialogContent>
    </Dialog>
  );
}
