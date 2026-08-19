import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ArrowLeft, Camera, Check, Copy, Loader2, QrCode } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase, formatBs, formatBsAbsolute, formatModifierLabel } from '@/utils/format';
import { canApplyDiscount } from '@/utils/roles';
import {
  METHODS_ALLOWING_PROOF,
  METHODS_REQUIRING_PROOF_OR_REFERENCE,
  METHODS_WITH_QR,
  paymentDocumentError,
  referenceLabel,
} from '@/utils/payments';
import type { PaymentMethod } from '@/types';
import { methodAccountsOf } from '@/utils/payment-accounts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { PaymentClientScreen } from '@/components/admin/PaymentClientScreen';
import { MethodAccountPicker } from '@/components/admin/MethodAccountPicker';
import { PromoCodeField, promoDiscountAmount, type AppliedPromo } from '@/components/admin/crm/PromoCodeField';
import { settledOf } from '@/utils/orderBalance';
import { useIsLandscapeTablet } from '@/hooks/useIsLandscapeTablet';
import { PosNumericKeypad, type PosKeypadField } from '@/components/admin/PosNumericKeypad';
import type { LiveOrder, LiveOrderPayment } from './LiveOrdersPanel';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo Bs',
  CASH_USD: 'Efectivo $',
  CARD: 'Punto de Venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
};

const DEFAULT_PAYMENT_OPTIONS: PaymentMethod[] = ['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CASH_USD', 'CARD'];


const PAYMENT_FIELD_LABELS: Record<string, string> = {
  banco: 'Banco',
  telefono: 'Teléfono',
  cedula: 'Cédula/RIF',
  titular: 'Titular',
  correo: 'Correo',
  id: 'ID',
  cuenta: 'Cuenta',
  rif: 'RIF',
};

interface Props {
  order: LiveOrder;
  mode: 'full' | 'split';
  onClose: () => void;
  /** `fullyPaid` = con este pago la comanda quedó saldada (no fue un abono parcial). */
  onPaid: (fullyPaid: boolean) => void;
}

/** Fila de un pago ya registrado (histórico o hecho en esta misma sesión del diálogo), para el desglose final. */
function PaymentRow({ payment, symbol }: { payment: LiveOrderPayment; symbol: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-brand-950/[0.06] last:border-0">
      <div className="min-w-0">
        <p className="font-medium text-brand-950">{PAYMENT_LABELS[payment.method as PaymentMethod] ?? payment.method}</p>
        {payment.referenceNumber && (
          <p className="text-brand-950/40 truncate">
            Ref: {payment.referenceNumber}
            {payment.proofImageUrl && <span className="text-emerald-600"> · ✓ Comprobante</span>}
          </p>
        )}
        {Number(payment.discountBase ?? 0) > 0 && (
          <p className="text-brand-950/40">Descuento: {formatBase(payment.discountBase!, symbol)}</p>
        )}
        {Number(payment.serviceChargeDiscountBase ?? 0) > 0 && (
          <p className="text-brand-950/40">Servicio ajustado: -{formatBase(payment.serviceChargeDiscountBase!, symbol)}</p>
        )}
        {Number(payment.changeBase ?? 0) > 0 && (
          <p className="text-brand-950/40">
            Recibido {formatBase(payment.amountReceivedBase!, symbol)} · vuelto {formatBase(payment.changeBase!, symbol)}
            {payment.changeMethod && payment.changeMethod !== payment.method
              ? ` por ${PAYMENT_LABELS[payment.changeMethod as PaymentMethod] ?? payment.changeMethod}`
              : ''}
          </p>
        )}
      </div>
      <p className="font-semibold text-brand-950 shrink-0">{formatBase(payment.amountBase, symbol)}</p>
    </div>
  );
}

/** "Pagar" / "Pago Fraccionado": selecciona método, muestra sus datos de cobro y registra el pago del pedido. */
export function PaymentDialog({ order, mode, onClose, onPaid }: Props) {
  const { restaurant, user } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const showDiscount = canApplyDiscount(user?.role);

  // Un descuento (y el ajuste de servicio) perdona esa parte de la deuda: cuenta como
  // "saldado" igual que el efectivo cobrado — misma cuenta que hace el backend.
  const paidBase = settledOf(order.payments);
  const balanceBase = Math.max(0, Number(order.totalBase) - paidBase);

  // Propina: aparte del saldo de la venta (no cuenta para "saldado"). `tipOutstanding` es lo
  // que el pedido declaró (QR de mesa, o una edición manual) menos lo ya cobrado en pagos
  // anteriores de esta misma cuenta — se precarga acá, pero el cajero puede ajustarlo o
  // dejarlo en 0 si el cliente no quiere dejar propina en este cobro.
  const tipCollectedSoFar = order.payments.reduce((acc, p) => acc + Number(p.tipBase ?? 0), 0);
  const tipOutstanding = Math.max(0, Number(order.tipBase ?? 0) - tipCollectedSoFar);

  const paymentConfig = restaurant?.paymentMethodsConfig;
  const hasPaymentConfig = paymentConfig && Object.values(paymentConfig).some((m) => m?.enabled);
  const paymentOptions = hasPaymentConfig
    ? (Object.keys(PAYMENT_LABELS) as PaymentMethod[]).filter((k) => paymentConfig?.[k]?.enabled)
    : DEFAULT_PAYMENT_OPTIONS;

  const [method, setMethod] = useState<PaymentMethod>(paymentOptions[0] ?? 'CASH');
  // Cuenta receptora elegida cuando el método tiene varias (varios Zelle…). Decide qué
  // datos/QR se muestran y a cuál cuenta bancaria se asienta el cobro.
  const [accountKey, setAccountKey] = useState('main');
  const [amount, setAmount] = useState(mode === 'split' ? '' : balanceBase.toFixed(2));
  // La propina se escribe en la moneda que sea más cómoda para el cajero (casi siempre Bs,
  // como la dice el cliente en el mostrador) y se convierte a la moneda base del pedido (la que
  // guarda OrderPayment.tipBase) con la MISMA tasa congelada del pedido — no la tasa del día —
  // para que cuadre con lo que el backend termina acreditando.
  const rateBsOfOrder = Number(order.exchangeRate) || 0;
  // Modo POS: tablet en horizontal sobre el mostrador. La ventana pasa a pantalla completa
  // en tres columnas (cuenta · cobro · teclado) porque ahí no hay teclado físico y el del
  // sistema tapa media pantalla — ver PosNumericKeypad.
  const isPos = useIsLandscapeTablet();
  const [posField, setPosField] = useState<PosKeypadField>(mode === 'split' ? 'amount' : 'tip');
  const [tipCurrency, setTipCurrency] = useState<'BASE' | 'BS'>('BS');
  const [tipValue, setTipValue] = useState(
    tipOutstanding > 0 ? (rateBsOfOrder > 0 ? round2(tipOutstanding * rateBsOfOrder) : tipOutstanding).toFixed(2) : '',
  );
  // Descuento y ajuste de servicio de ESTE cobro puntual — cada uno se puede escribir en % o en
  // monto fijo (discountMode/serviceMode eligen cuál de los dos interpreta discountValue/serviceValue).
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  // Promoción del CRM aplicada con su código: descuenta sobre el saldo, y el backend
  // registra el canje al cobrar. Independiente del descuento manual del cajero.
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const [serviceMode, setServiceMode] = useState<'percent' | 'amount'>('percent');
  const [serviceValue, setServiceValue] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  // Vuelto (solo efectivo): cuánto entregó el cliente. Si supera lo que se cobra, la diferencia
  // es el cambio — se devuelve en el mismo efectivo o en Bs por Pago Móvil (changeMethod).
  const [amountReceived, setAmountReceived] = useState('');
  const [changeMethod, setChangeMethod] = useState<PaymentMethod | ''>('');
  const [changeReference, setChangeReference] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Submodalidad de "Pago fraccionado": por monto libre (de siempre) o eligiendo ítems puntuales.
  const [splitBy, setSplitBy] = useState<'amount' | 'items'>('amount');
  const [pickedQty, setPickedQty] = useState<Record<string, number>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidNow, setPaidNow] = useState<number | null>(null);
  // Pantalla a pantalla completa que ve el cliente tras elegir método (ver PaymentClientScreen).
  const [clientScreenOpen, setClientScreenOpen] = useState(false);
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [printing, setPrinting] = useState(false);
  // Pagos registrados durante esta sesión del diálogo (para el desglose final, junto a order.payments).
  const [sessionPayments, setSessionPayments] = useState<LiveOrderPayment[]>([]);

  const methodAccounts = methodAccountsOf(paymentConfig, method);
  const selectedAccount = methodAccounts.find((a) => a.key === accountKey) ?? methodAccounts[0] ?? null;
  const needsReference = METHODS_REQUIRING_PROOF_OR_REFERENCE.includes(method);
  const needsProof = METHODS_ALLOWING_PROOF.includes(method);
  const qrImageUrl = METHODS_WITH_QR.includes(method) ? selectedAccount?.qrImageUrl ?? null : null;

  function round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  const canAdjust = showDiscount && splitBy === 'amount';
  const serviceChargeBaseNum = Number(order.serviceChargeBase);
  // Porcentaje efectivo (0-100, clamped) de cada ajuste — solo tiene sentido en modo 'percent'.
  const discountPct = canAdjust && discountMode === 'percent' ? Math.min(100, Math.max(0, Number(discountValue) || 0)) : 0;
  const servicePct = canAdjust && serviceMode === 'percent' ? Math.min(100, Math.max(0, Number(serviceValue) || 0)) : 0;
  // Monto forgivado de cada ajuste, sin importar en qué modo se escribió — clamped a su propia base
  // (el descuento nunca puede superar el saldo; el ajuste de servicio nunca puede superar el
  // cargo de servicio del pedido).
  const discountAmt = !canAdjust
    ? 0
    : discountMode === 'amount'
      ? Math.min(balanceBase, Math.max(0, Number(discountValue) || 0))
      : round2(balanceBase * (discountPct / 100));
  const serviceAdjAmt = !canAdjust
    ? 0
    : serviceMode === 'amount'
      ? Math.min(serviceChargeBaseNum, Math.max(0, Number(serviceValue) || 0))
      : round2(serviceChargeBaseNum * (servicePct / 100));
  // Espejo del cálculo del backend: la promo descuenta sobre el saldo completo.
  const promoAmt = promo ? promoDiscountAmount(promo, balanceBase) : 0;
  const discountedBalance = round2(Math.max(0, balanceBase - discountAmt - serviceAdjAmt - promoAmt));

  function remainingQty(item: LiveOrder['items'][number]) {
    return Math.max(0, item.quantity - item.paidQuantity);
  }

  function stepItem(itemId: string, delta: number, max: number) {
    setPickedQty((prev) => {
      const next = Math.max(0, Math.min(max, (prev[itemId] ?? 0) + delta));
      return { ...prev, [itemId]: next };
    });
  }

  const itemsSubtotal = round2(order.items.reduce((acc, it) => acc + Number(it.unitPrice) * (pickedQty[it.id] ?? 0), 0));
  const itemsPickedCount = Object.values(pickedQty).reduce((acc, q) => acc + q, 0);
  // Monto a cobrar ahora mismo — mismo valor que ya se muestra como "Monto a cobrar" más abajo,
  // usado también para el bloque de QR/Bs de Pago Móvil.
  const amountToCharge =
    mode === 'split' && splitBy === 'items' ? itemsSubtotal : mode === 'split' ? Number(amount) || 0 : discountedBalance;
  const tipValueNum = Math.max(0, Number(tipValue) || 0);
  const tipAmt = tipCurrency === 'BS' && rateBsOfOrder > 0 ? round2(tipValueNum / rateBsOfOrder) : tipValueNum;

  /** Cambiar Bs <-> $ convierte lo ya escrito, para no perder lo que el cajero tecleó. */
  function onTipCurrencyChange(next: 'BASE' | 'BS') {
    if (next !== tipCurrency && rateBsOfOrder > 0 && tipValueNum > 0) {
      const converted =
        next === 'BS' ? round2(tipValueNum * rateBsOfOrder) : round2(tipValueNum / rateBsOfOrder);
      setTipValue(converted.toFixed(2));
    }
    setTipCurrency(next);
  }
  // Lo que de verdad hay que recibir ahora: la venta más la propina, si el cliente deja una.
  const totalWithTip = round2(amountToCharge + tipAmt);

  // Vuelto: solo con billetes (Efectivo $ / Efectivo Bs). Recibido − a cobrar (venta + propina
  // incluida, si la hay), si es positivo.
  const isCashMethod = method === 'CASH' || method === 'CASH_USD';
  const receivedNum = Number(amountReceived) || 0;
  const changeAmt = isCashMethod && receivedNum > totalWithTip + 0.001 ? round2(receivedNum - totalWithTip) : 0;
  const rateBs = restaurant?.exchangeRate?.rateBs;
  const effectiveChangeMethod: PaymentMethod = changeMethod || method;

  /** Elegir método no abre nada solo: el cajero decide cuándo enseñarle los datos al
   *  cliente con el botón "Mostrar datos". */
  function selectMethod(next: PaymentMethod) {
    setMethod(next);
    setAccountKey('main');
    setError(null);
  }

  const detailLines = order.items.map(
    (it) => `${it.quantity}x ${it.productName}${it.variantName ? ` (${it.variantName})` : ''}`,
  );

  // Datos de cobro de la CUENTA elegida del método (correo de Zelle, cuenta, teléfono…):
  // los ve tanto el cajero en el diálogo como el cliente en la pantalla completa — sin
  // ellos no puede pagar un método que no lleva QR.
  const paymentDetailsBlock = selectedAccount && Object.keys(selectedAccount.fields).length > 0 ? (
    <div className="text-xs text-brand-950/60 bg-brand-950/[0.03] rounded-lg px-2.5 py-2 space-y-1">
      {(Object.keys(PAYMENT_FIELD_LABELS) as (keyof typeof PAYMENT_FIELD_LABELS)[])
        .filter((f) => selectedAccount.fields[f])
        .map((f) => {
          const value = selectedAccount.fields[f];
          return (
            <div key={f} className="flex items-center justify-between gap-2">
              <p className="truncate">
                <span className="text-brand-950/40">{PAYMENT_FIELD_LABELS[f]}:</span> {value}
              </p>
              <button
                type="button"
                onClick={() => copyField(f, value)}
                aria-label={`Copiar ${PAYMENT_FIELD_LABELS[f]}`}
                className="shrink-0 flex items-center gap-1 text-brand-500 hover:text-brand-400 font-medium"
              >
                {copiedField === f ? (
                  <>
                    <Check className="h-3 w-3" /> Copiado
                  </>
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          );
        })}
    </div>
  ) : null;

  // En modo 'split' por monto, cambiar cualquiera de los dos ajustes recalcula el abono
  // sugerido — en modo 'full' el monto a cobrar ya se muestra calculado (discountedBalance),
  // no hace falta tocar `amount`.
  function recomputeSplitAmount(nextDiscountAmt: number, nextServiceAmt: number) {
    if (mode === 'full') return;
    setAmount(round2(Math.max(0, balanceBase - nextDiscountAmt - nextServiceAmt)).toFixed(2));
  }

  function onDiscountValueChange(v: string) {
    const clean = v.replace(/[^0-9.]/g, '');
    setDiscountValue(clean);
    const amt =
      discountMode === 'amount'
        ? Math.min(balanceBase, Math.max(0, Number(clean) || 0))
        : round2(balanceBase * (Math.min(100, Math.max(0, Number(clean) || 0)) / 100));
    recomputeSplitAmount(amt, serviceAdjAmt);
  }

  function onDiscountModeChange(m: 'percent' | 'amount') {
    setDiscountMode(m);
    setDiscountValue('');
    recomputeSplitAmount(0, serviceAdjAmt);
  }

  function onServiceValueChange(v: string) {
    const clean = v.replace(/[^0-9.]/g, '');
    setServiceValue(clean);
    const amt =
      serviceMode === 'amount'
        ? Math.min(serviceChargeBaseNum, Math.max(0, Number(clean) || 0))
        : round2(serviceChargeBaseNum * (Math.min(100, Math.max(0, Number(clean) || 0)) / 100));
    recomputeSplitAmount(discountAmt, amt);
  }

  function onServiceModeChange(m: 'percent' | 'amount') {
    setServiceMode(m);
    setServiceValue('');
    recomputeSplitAmount(discountAmt, 0);
  }

  async function copyField(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField((c) => (c === key ? null : c)), 1500);
    } catch {
      // El navegador puede negar el permiso de portapapeles; fallamos en silencio.
    }
  }

  async function handleProofFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingProof(true);
    setProofError(null);
    try {
      const form = new FormData();
      form.append('photo', file);
      const { data } = await api.post('/orders/upload-payment-proof', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProofUrl(data.data.url);
    } catch (e: any) {
      setProofError(e.response?.data?.error ?? 'No se pudo subir la foto.');
    } finally {
      setUploadingProof(false);
    }
  }

  async function submit() {
    const byItems = mode === 'split' && splitBy === 'items';
    const amountBase = byItems ? itemsSubtotal : mode === 'split' ? Number(amount) : discountedBalance;
    if (byItems) {
      if (itemsPickedCount === 0) {
        setError('Elige al menos un ítem a cobrar.');
        return;
      }
    } else if (!amountBase || amountBase <= 0) {
      setError('Escribe un monto válido.');
      return;
    }
    if (amountBase > balanceBase + 0.01) {
      setError(`El monto no puede superar el saldo pendiente (${formatBase(balanceBase, symbol)}).`);
      return;
    }
    const docError = paymentDocumentError(method, referenceNumber, proofUrl);
    if (docError) {
      setError(docError);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const { data } = await api.post(`/orders/${order.id}/payments`, {
        amountBase: byItems ? undefined : amountBase,
        items: byItems
          ? Object.entries(pickedQty)
              .filter(([, qty]) => qty > 0)
              .map(([orderItemId, quantity]) => ({ orderItemId, quantity }))
          : undefined,
        method,
        discountPercent: discountMode === 'percent' && discountPct > 0 ? discountPct : undefined,
        discountAmount: discountMode === 'amount' && discountAmt > 0 ? discountAmt : undefined,
        serviceChargeDiscountPercent: serviceMode === 'percent' && servicePct > 0 ? servicePct : undefined,
        serviceChargeDiscountAmount: serviceMode === 'amount' && serviceAdjAmt > 0 ? serviceAdjAmt : undefined,
        referenceNumber: needsReference ? referenceNumber.trim() : undefined,
        proofImageUrl: needsProof ? proofUrl ?? undefined : undefined,
        bankAccountId: selectedAccount?.bankAccountId ?? undefined,
        promoCode: promo?.code ?? undefined,
        tipBase: tipAmt > 0 ? tipAmt : undefined,
        // Vuelto: solo se manda si de verdad hubo cambio.
        amountReceived: changeAmt > 0 ? receivedNum : undefined,
        changeMethod: changeAmt > 0 ? effectiveChangeMethod : undefined,
        changeReferenceNumber: changeAmt > 0 && changeReference.trim() ? changeReference.trim() : undefined,
      });
      // El endpoint devuelve el pedido completo (no solo el pago nuevo). Se identifica el/los
      // pago(s) recién creados comparando contra los que ya conocíamos ANTES de este POST — así
      // sessionPayments guarda el objeto real (mismo id que luego traerá `order.payments` al
      // refrescar), en vez de uno inventado en el cliente que nunca podría des-duplicarse.
      const freshPayments: LiveOrderPayment[] = data.data?.payments ?? [];
      const newPayments = freshPayments.filter((fp) => !order.payments.some((p) => p.id === fp.id));
      setSessionPayments((prev) => [...prev, ...newPayments]);
      // El saldo restante se recalcula con el pedido que devuelve el servidor (ya trae los
      // pagos con su descuento y ajuste de servicio). Restar solo `amountBase` daba por
      // pendiente lo que el descuento acababa de perdonar.
      const remaining = Number(data.data?.totalBase ?? order.totalBase) - settledOf(freshPayments);
      const fullyPaid = mode === 'full' || remaining <= 0.01;
      onPaid(fullyPaid);
      if (fullyPaid) {
        setShowPrintPrompt(true);
      } else {
        setPaidNow(amountBase);
        setAmount('');
        setReferenceNumber('');
        setProofUrl(null);
        setProofError(null);
        setDiscountValue('');
        setServiceValue('');
        setTipValue('');
      }
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo registrar el pago.');
    } finally {
      setSending(false);
    }
  }

  async function printReceipt() {
    setPrinting(true);
    try {
      await api.post(`/orders/${order.id}/print-receipt`);
    } catch {
      // La estación de impresión puede estar apagada/desconectada; no bloqueamos el cierre por eso.
    } finally {
      setPrinting(false);
      onClose();
    }
  }

  const remainingAfter = paidNow != null ? Math.max(0, balanceBase - paidNow) : balanceBase;
  // `order` es una prop que el padre mantiene sincronizada con el servidor (se refresca
  // en segundo plano apenas hay datos nuevos) — una vez que ese refresco llega, el pago que
  // acabamos de registrar aparece TANTO en `order.payments` como en `sessionPayments` (lo
  // guardamos localmente para no depender de esa carrera). Se filtra por id para no duplicarlo.
  const allPayments = [...order.payments, ...sessionPayments.filter((sp) => !order.payments.some((p) => p.id === sp.id))];

  // Qué campo llena el teclado numérico del modo POS. `set` reusa los mismos manejadores que
  // los inputs (onDiscountValueChange recalcula el abono sugerido), no escribe el estado crudo.
  const posFields: Record<PosKeypadField, { label: string; value: string; suffix: string | null; set: (v: string) => void }> = {
    amount: { label: 'Monto a abonar', value: amount, suffix: symbol, set: setAmount },
    tip: { label: 'Propina', value: tipValue, suffix: tipCurrency === 'BS' ? 'Bs' : symbol, set: setTipValue },
    discount: {
      label: 'Descuento',
      value: discountValue,
      suffix: discountMode === 'percent' ? '%' : symbol,
      set: onDiscountValueChange,
    },
    service: {
      label: 'Ajuste de servicio',
      value: serviceValue,
      suffix: serviceMode === 'percent' ? '%' : symbol,
      set: onServiceValueChange,
    },
    received: { label: 'Efectivo recibido', value: amountReceived, suffix: symbol, set: setAmountReceived },
    reference: { label: referenceLabel(method), value: referenceNumber, suffix: null, set: setReferenceNumber },
  };
  const activePosField = posFields[posField];
  const keypadDigit = (d: string) => activePosField.set(`${activePosField.value ?? ''}${d}`);
  const keypadBackspace = () => activePosField.set(String(activePosField.value ?? '').slice(0, -1));
  const keypadClear = () => activePosField.set('');

  /** En modo POS agrupa su contenido en una columna; en vertical lo deja tal cual estaba
   * (hijo directo del `space-y-4`), para no alterar el layout de siempre en teléfono. */
  const PosColumn = ({ className, children }: { className: string; children: React.ReactNode }) =>
    isPos ? <div className={className}>{children}</div> : <>{children}</>;

  return (
    <>
      {/* Se monta ENCIMA del diálogo, no en su lugar: si se devolviera esta pantalla en vez
          del <Dialog>, Radix lo desmontaría y al cerrarla se perdía todo el cobro en curso. */}
      {clientScreenOpen && (
        <PaymentClientScreen
          method={method}
          methodLabel={PAYMENT_LABELS[method]}
          qrImageUrl={qrImageUrl}
          // En fraccionado, mientras el cajero no escriba el abono, al cliente se le muestra
          // el saldo pendiente en vez de un 0,00 que no le dice nada.
          amountBase={amountToCharge > 0 ? totalWithTip : discountedBalance}
          amountLabel={amountToCharge > 0 ? 'Monto a cobrar' : 'Saldo pendiente'}
          symbol={symbol}
          // Tasa CONGELADA del pedido, no la del login: el backend asienta el cobro con
          // `order.exchangeRate` (la misma que vio el cliente en el menú), así que mostrarle la
          // de `restaurant` — cargada al iniciar sesión y sin refrescar — le pedía en Bs un
          // monto distinto al que quedaba registrado.
          rateBs={order.exchangeRate ?? restaurant?.exchangeRate?.rateBs}
          detailTitle={`Detalle del pedido (${order.items.length} ${order.items.length === 1 ? 'ítem' : 'ítems'})`}
          detailLines={detailLines}
          details={paymentDetailsBlock}
          onNext={() => setClientScreenOpen(false)}
          onBack={() => setClientScreenOpen(false)}
        />
      )}

      <Dialog open onOpenChange={(o) => !o && onClose()}>
        {/* Con la pantalla del cliente encima, cualquier clic en ella cae "fuera" del diálogo
            y Radix lo cerraría — el cajero volvía a Editar pedido y perdía el cobro. Mientras
            esa pantalla esté abierta, el diálogo ignora los clics de afuera y el Escape. */}
        <DialogContent
          className={
            isPos
              ? 'max-w-none w-screen h-screen max-h-screen rounded-none border-0 p-5 gap-3 translate-x-0 translate-y-0 left-0 top-0 grid-rows-[auto_minmax(0,1fr)]'
              : undefined
          }
          onPointerDownOutside={(e) => clientScreenOpen && e.preventDefault()}
          onInteractOutside={(e) => clientScreenOpen && e.preventDefault()}
          onFocusOutside={(e) => clientScreenOpen && e.preventDefault()}
          onEscapeKeyDown={(e) => clientScreenOpen && e.preventDefault()}
        >
        <DialogHeader className={showPrintPrompt || paidNow != null ? undefined : 'flex-row items-center gap-2 pr-6'}>
          {/* Botón de retorno: solo antes de registrar el pago, para que el cajero pueda
              salir y elegir otra modalidad (Pago/Fraccionado/Deuda) si el cliente cambia de
              opinión sobre cómo va a pagar. Una vez registrado el pago ya no tiene sentido
              "volver" — se cierra con "Cerrar"/"Sí, imprimir" más abajo. */}
          {!showPrintPrompt && paidNow == null && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Volver"
              className="shrink-0 h-8 w-8 rounded-full bg-brand-950/[0.06] hover:bg-brand-950/10 flex items-center justify-center focus:outline-none"
            >
              <ArrowLeft className="h-4 w-4 text-brand-950/70" />
            </button>
          )}
          <DialogTitle>{mode === 'full' ? 'Pagar' : 'Pago fraccionado'}</DialogTitle>
        </DialogHeader>

        <div
          className={
            isPos
              ? 'grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_300px] gap-4 items-stretch min-h-0'
              : 'space-y-4'
          }
        >
          <PosColumn className="space-y-3 min-h-0 overflow-y-auto pr-1">
          <div className="rounded-xl bg-brand-950/[0.03] px-3 py-2.5 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-brand-950/60">Total del pedido</span>
              <span className="font-semibold text-brand-950">{formatBase(order.totalBase, symbol)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-brand-950/40">Equivalente</span>
              <span className="text-brand-950/50">{formatBsAbsolute(order.totalBs)}</span>
            </div>
          </div>

          <details className="rounded-xl border border-brand-950/10 px-3 py-2" open>
            <summary className="text-xs font-medium text-brand-950/60 cursor-pointer select-none">
              Detalle del pedido ({order.items.length} {order.items.length === 1 ? 'ítem' : 'ítems'})
            </summary>
            <ul className="text-sm space-y-1 mt-2 max-h-32 overflow-y-auto">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-medium">{it.quantity}x</span> {it.productName}
                    {it.variantName && <span className="text-brand-950/50"> ({it.variantName})</span>}
                    {it.modifiers.length > 0 && (
                      <span className="text-brand-950/50"> ({it.modifiers.map(formatModifierLabel).join(', ')})</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>

          {paidBase > 0 && (
            <div className="flex items-center justify-between text-sm bg-brand-950/[0.03] rounded-xl px-3 py-2.5 -mt-2">
              <span className="text-brand-950/60">Ya pagado</span>
              <span className="font-medium text-emerald-600">{formatBase(paidBase, symbol)}</span>
            </div>
          )}
          </PosColumn>

          <PosColumn className="space-y-4 min-h-0 overflow-y-auto pr-1">
          {showPrintPrompt ? (
            <div className="space-y-3 text-center py-2">
              <p className="text-sm font-medium text-emerald-600">✓ Cuenta saldada</p>
              {allPayments.length > 0 && (
                <div className="text-left rounded-xl border border-brand-950/10 px-3 py-2">
                  {allPayments.map((p) => (
                    <PaymentRow key={p.id} payment={p} symbol={symbol} />
                  ))}
                </div>
              )}
              <p className="text-sm text-brand-950/70">¿Desea imprimir la cuenta?</p>
              <div className="flex gap-2 justify-center">
                <TextureButton variant="brand" size="default" className="!w-auto disabled:opacity-50" disabled={printing} onClick={printReceipt}>
                  {printing ? 'Imprimiendo…' : 'Sí, imprimir'}
                </TextureButton>
                <TextureButton variant="secondary" size="default" className="!w-auto" disabled={printing} onClick={onClose}>
                  No
                </TextureButton>
              </div>
            </div>
          ) : paidNow != null ? (
            <div className="space-y-3 text-center py-2">
              <p className="text-sm font-medium text-emerald-600">
                ✓ Pago de {formatBase(paidNow, symbol)} registrado
              </p>
              {allPayments.length > 0 && (
                <div className="text-left rounded-xl border border-brand-950/10 px-3 py-2">
                  {allPayments.map((p) => (
                    <PaymentRow key={p.id} payment={p} symbol={symbol} />
                  ))}
                </div>
              )}
              {remainingAfter > 0.01 ? (
                <p className="text-sm text-brand-950/60">
                  Aún debe <span className="font-semibold text-brand-950">{formatBase(remainingAfter, symbol)}</span>
                </p>
              ) : (
                <p className="text-sm text-brand-950/60">Cuenta saldada.</p>
              )}
              <div className="flex gap-2 justify-center">
                {mode === 'split' && remainingAfter > 0.01 && (
                  <TextureButton
                    variant="brand"
                    size="default"
                    className="!w-auto"
                    onClick={() => {
                      setPaidNow(null);
                      setAmount('');
                      setDiscountValue('');
                      setServiceValue('');
                      setReferenceNumber('');
                      setProofUrl(null);
                      setProofError(null);
                      setPickedQty({});
                    }}
                  >
                    Seguir pagando fraccionado
                  </TextureButton>
                )}
                <TextureButton variant="secondary" size="default" className="!w-auto" onClick={onClose}>
                  {remainingAfter > 0.01 ? 'Cerrar por ahora' : 'Cerrar'}
                </TextureButton>
              </div>
            </div>
          ) : (
            <>
              {mode === 'split' && (
                <div className="flex gap-1.5">
                  {(['amount', 'items'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSplitBy(s)}
                      className={`flex-1 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                        splitBy === s ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                      }`}
                    >
                      {s === 'amount' ? 'Por monto' : 'Por ítems'}
                    </button>
                  ))}
                </div>
              )}

              {isCashMethod && (mode === 'full' || splitBy === 'amount') && (
                <div className="rounded-xl border border-brand-950/10 bg-brand-950/[0.02] p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-brand-950/50 mb-1">Recibido del cliente ({symbol})</p>
                      <input
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value.replace(/[^0-9.]/g, ''))}
                        onFocus={() => setPosField('received')}
                        inputMode="decimal"
                        placeholder={amountToCharge > 0 ? totalWithTip.toFixed(2) : '0.00'}
                        className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-brand-950/50 mb-1">Vuelto</p>
                      <p className={`text-base font-semibold ${changeAmt > 0 ? 'text-brand-950' : 'text-brand-950/30'}`}>
                        {formatBase(changeAmt, symbol)}
                      </p>
                      {changeAmt > 0 && rateBs && (
                        <p className="text-[11px] text-brand-950/50">{formatBs(changeAmt, rateBs)} a la tasa de hoy</p>
                      )}
                    </div>
                  </div>
                  {changeAmt > 0 && (
                    <>
                      <p className="text-xs font-medium text-brand-950/50">¿Cómo se devuelve el vuelto?</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            [method, `Mismo efectivo (${PAYMENT_LABELS[method]})`],
                            ['MOBILE_PAYMENT', 'Pago Móvil (Bs)'],
                            ...(method === 'CASH_USD' ? ([['CASH', 'Efectivo Bs']] as const) : []),
                            ...(method === 'CASH' ? ([['CASH_USD', 'Efectivo $']] as const) : []),
                          ] as [PaymentMethod, string][]
                        ).map(([m, label]) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setChangeMethod(m === method ? '' : m)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                              effectiveChangeMethod === m ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {effectiveChangeMethod === 'MOBILE_PAYMENT' && (
                        <input
                          value={changeReference}
                          onChange={(e) => setChangeReference(e.target.value)}
                          placeholder="Referencia del pago móvil del vuelto (opcional)"
                          className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                        />
                      )}
                      <p className="text-[11px] text-brand-950/40 font-light">
                        {effectiveChangeMethod === method
                          ? `En caja queda el neto: ${formatBase(totalWithTip, symbol)}.`
                          : `En caja entra ${formatBase(receivedNum, symbol)} en ${PAYMENT_LABELS[method]} y sale ${formatBase(changeAmt, symbol)}${rateBs ? ` (${formatBs(changeAmt, rateBs)})` : ''} por ${PAYMENT_LABELS[effectiveChangeMethod]}.`}
                      </p>
                    </>
                  )}
                </div>
              )}

              {needsReference && (
                <div>
                  <p className="text-xs font-medium text-brand-950/50 mb-1.5">
                    {referenceLabel(method)}
                    {needsProof && <span className="text-brand-950/40"> — o adjunta el comprobante abajo</span>}
                  </p>
                  <input
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    onFocus={() => setPosField('reference')}
                    placeholder={referenceLabel(method)}
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                </div>
              )}

              {needsProof && (
                <div className="space-y-1.5">
                  <TextureButton
                    variant="minimal"
                    size="sm"
                    className="w-full justify-center"
                    disabled={uploadingProof}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingProof ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {uploadingProof ? 'Subiendo…' : proofUrl ? 'Cambiar comprobante' : 'Adjuntar comprobante'}
                  </TextureButton>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleProofFileChange}
                  />
                  {proofUrl && (
                    <div className="flex items-center gap-2.5 justify-center">
                      <img src={proofUrl} alt="Comprobante" className="h-12 w-12 rounded-lg object-cover border border-brand-950/10" />
                      <p className="text-xs font-semibold text-emerald-600">✓ Comprobante adjunto</p>
                    </div>
                  )}
                  {proofError && <p className="text-xs font-semibold text-red-600">{proofError}</p>}
                </div>
              )}

              {showDiscount && !(mode === 'split' && splitBy === 'items') && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-brand-950/50 mb-1.5">Descuento</p>
                    <input
                      value={discountValue}
                      onChange={(e) => onDiscountValueChange(e.target.value)}
                      onFocus={() => setPosField('discount')}
                      placeholder="0"
                      className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                  <div className="flex rounded-lg border border-brand-950/15 overflow-hidden shrink-0">
                    {(['percent', 'amount'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onDiscountModeChange(m)}
                        className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          discountMode === m ? 'bg-brand-500 text-white' : 'bg-white text-brand-950/50 hover:bg-brand-950/[0.04]'
                        }`}
                      >
                        {m === 'percent' ? '%' : symbol}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showDiscount && !(mode === 'split' && splitBy === 'items') && serviceChargeBaseNum > 0 && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-brand-950/50 mb-1.5">
                      Ajuste de servicio <span className="font-normal">(cargo: {formatBase(serviceChargeBaseNum, symbol)})</span>
                    </p>
                    <input
                      value={serviceValue}
                      onChange={(e) => onServiceValueChange(e.target.value)}
                      onFocus={() => setPosField('service')}
                      placeholder="0"
                      className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                  <div className="flex rounded-lg border border-brand-950/15 overflow-hidden shrink-0">
                    {(['percent', 'amount'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onServiceModeChange(m)}
                        className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          serviceMode === m ? 'bg-brand-500 text-white' : 'bg-white text-brand-950/50 hover:bg-brand-950/[0.04]'
                        }`}
                      >
                        {m === 'percent' ? '%' : symbol}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mode === 'split' && splitBy === 'items' ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-brand-950/50">Elige qué ítems cobra esta persona</p>
                  <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                    {order.items.map((it) => {
                      const remaining = remainingQty(it);
                      const qty = pickedQty[it.id] ?? 0;
                      if (remaining === 0) return null;
                      return (
                        <li
                          key={it.id}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-sm ${
                            qty > 0 ? 'border-brand-500 bg-brand-400/10' : 'border-brand-950/10'
                          }`}
                        >
                          <span className="min-w-0 truncate">
                            {it.productName}
                            {it.variantName && <span className="text-brand-950/50"> ({it.variantName})</span>}
                            <span className="text-brand-950/40"> · quedan {remaining}</span>
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => stepItem(it.id, -1, remaining)}
                              disabled={qty === 0}
                              className="w-6 h-6 rounded-full border border-brand-950/20 font-bold text-brand-950 text-xs disabled:opacity-30"
                            >
                              −
                            </button>
                            <span className="w-4 text-center font-medium">{qty}</span>
                            <button
                              type="button"
                              onClick={() => stepItem(it.id, 1, remaining)}
                              disabled={qty >= remaining}
                              className="w-6 h-6 rounded-full border border-brand-950/20 font-bold text-brand-950 text-xs disabled:opacity-30"
                            >
                              +
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex items-center justify-between text-sm font-semibold pt-1">
                    <span>Monto a cobrar</span>
                    <span>{formatBase(itemsSubtotal, symbol)}</span>
                  </div>
                </div>
              ) : mode === 'split' ? (
                <div>
                  <p className="text-xs font-medium text-brand-950/50 mb-1.5">Monto a abonar</p>
                  <input
                    autoFocus
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    onFocus={() => setPosField('amount')}
                    placeholder={`Máx. ${balanceBase.toFixed(2)}`}
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                </div>
              ) : (
                <div className="space-y-1 pt-1">
                  {discountAmt > 0 && (
                    <div className="flex items-center justify-between text-xs text-brand-950/50">
                      <span>Descuento aplicado</span>
                      <span>-{formatBase(discountAmt, symbol)}</span>
                    </div>
                  )}
                  {promoAmt > 0 && promo && (
                    <div className="flex items-center justify-between text-xs text-emerald-600">
                      <span>Promoción {promo.code}</span>
                      <span>-{formatBase(promoAmt, symbol)}</span>
                    </div>
                  )}
                  {serviceAdjAmt > 0 && (
                    <div className="flex items-center justify-between text-xs text-brand-950/50">
                      <span>Ajuste de servicio</span>
                      <span>-{formatBase(serviceAdjAmt, symbol)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Monto a cobrar</span>
                    <span>{formatBase(discountedBalance, symbol)}</span>
                  </div>
                </div>
              )}

              {/* Propina: aparte de la venta, en su propio segmento — no perdona ni suma saldo del
                  pedido, solo plata extra que entra junto con este cobro (ver orderBalance.ts y
                  cash-session.service.ts, donde se reporta separado de las ventas). */}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <p className="text-xs font-medium text-brand-950/50 mb-1.5">
                    Propina {tipOutstanding > 0 && <span className="font-normal">(el cliente eligió {formatBase(tipOutstanding, symbol)})</span>}
                  </p>
                  <input
                    value={tipValue}
                    onChange={(e) => setTipValue(e.target.value.replace(/[^0-9.]/g, ''))}
                    onFocus={() => setPosField('tip')}
                    placeholder="0.00 — ¿el cliente quiere dejar propina?"
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                </div>
                <div className="flex rounded-lg border border-brand-950/15 overflow-hidden shrink-0">
                  {(['BS', 'BASE'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onTipCurrencyChange(c)}
                      className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        tipCurrency === c ? 'bg-brand-500 text-white' : 'bg-white text-brand-950/50 hover:bg-brand-950/[0.04]'
                      }`}
                    >
                      {c === 'BS' ? 'Bs' : symbol}
                    </button>
                  ))}
                </div>
              </div>
              {tipValueNum > 0 && rateBsOfOrder > 0 && (
                <p className="text-xs text-brand-950/40 -mt-1">
                  ≈ {tipCurrency === 'BS' ? formatBase(tipAmt, symbol) : formatBs(tipAmt, rateBsOfOrder)}
                </p>
              )}
              {tipAmt > 0 && (
                <div className="flex items-center justify-between text-sm font-semibold -mt-1">
                  <span>Total a cobrar (con propina)</span>
                  <span>
                    {formatBase(totalWithTip, symbol)}
                    {rateBsOfOrder > 0 && <span className="font-normal text-brand-950/50"> · {formatBs(totalWithTip, rateBsOfOrder)}</span>}
                  </span>
                </div>
              )}

              {/* Código de promoción del CRM: valida contra la lista del cliente del pedido. */}
              <PromoCodeField phone={order.customerPhone} applied={promo} onApplied={setPromo} symbol={symbol} />

              {/* Método y "Mostrar datos" van juntos y al final, pegados a "Registrar pago":
                  el cajero elige cómo le pagan, se lo enseña al cliente en pantalla completa
                  y recién entonces registra. El QR no va acá — ocupa media pantalla y el
                  cliente no lee este diálogo, lo ve en la pantalla que abre el botón. */}
              <div>
                <p className="text-xs font-medium text-brand-950/50 mb-1.5">Método de pago</p>
                <div className="flex flex-wrap gap-1.5">
                  {paymentOptions.map((o) => (
                    <button
                      key={o}
                      onClick={() => selectMethod(o)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                        method === o ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                      }`}
                    >
                      {PAYMENT_LABELS[o]}
                    </button>
                  ))}
                </div>
                <MethodAccountPicker accounts={methodAccounts} value={selectedAccount?.key ?? 'main'} onChange={setAccountKey} />
                {/* Siempre disponible, tenga o no datos cargados ese método: aunque el
                    restaurante no haya configurado su cuenta, la pantalla del cliente sirve
                    para enseñarle cuánto tiene que pagar (en Bs y en divisa) — antes el
                    botón desaparecía y el cajero se quedaba sin cómo mostrárselo. */}
                <TextureButton
                  variant="minimal"
                  size="default"
                  className="mt-2 w-full justify-center"
                  onClick={() => setClientScreenOpen(true)}
                >
                  <QrCode className="h-4 w-4" />
                  Mostrar datos
                </TextureButton>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <TextureButton variant="brand" size="default" disabled={sending} onClick={submit} className="disabled:opacity-50">
                {sending ? 'Registrando…' : 'Registrar pago'}
              </TextureButton>
            </>
          )}
          </PosColumn>

          {/* Teclado: solo mientras se está cobrando — con la cuenta ya saldada o el pago
              registrado, esa columna no tiene nada que escribir. */}
          {isPos && !showPrintPrompt && paidNow == null && (
            <div className="min-h-0">
              <PosNumericKeypad
                activeLabel={activePosField.label}
                value={activePosField.value}
                suffix={activePosField.suffix}
                onDigit={keypadDigit}
                onBackspace={keypadBackspace}
                onClear={keypadClear}
                onEnter={submit}
                enterLabel={sending ? 'Registrando…' : 'Cobrar'}
                enterDisabled={sending}
              />
            </div>
          )}
        </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
