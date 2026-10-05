import { SignupPromotionPrice, type SignupPromotionQuote } from '@/components/billing/SignupPromotionBanner';
import InstallmentCheckout from '@/components/billing/InstallmentCheckout';
import SubscriptionCheckout, {type CheckoutSubmission} from '@/components/billing/SubscriptionCheckout';
import { isCommercialPlan } from '@/utils/commercial-plans';
import { AdvisorLeadDialog } from './AdvisorLeadDialog';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { Toast } from '@/components/ui/toast';
import { useCopyToast } from '@/hooks/useCopyToast';
import { formatBs } from '@/utils/format';
import {
CYCLE_MONTHS,
PAYMENT_METHOD_LABEL,
paymentMethodLines,
type BillingCycle,
type PlanId,
type PlatformPaymentMethods,
type SubscriptionPaymentMethod,
} from '@/utils/plans';
import { Bitcoin,Copy,CreditCard,Landmark,Loader2,Paperclip,Tag,Wallet,X } from 'lucide-react';
import type { FormEvent,ReactNode } from 'react';
import { useEffect,useState } from 'react';
import { PLAN_CONTENT } from './PlanCards.shared';

export interface SelectedPlan {
  plan: Exclude<PlanId, 'TRIAL'>;
  billingCycle: BillingCycle;
  priceUsd: number;
  addonsOnly?: boolean;
  membershipAddons?: {code:string;quantity:number}[];
  customTables?: number;
  customUsers?: number;
  customOrders?: number;
  customAddons?: {
    administration?: boolean;
    inventoryBasic?: boolean;
    inventoryRecipe?: boolean;
    accountsPayable?: boolean;
  };
}

interface InstallmentPayment {
  id: string;
  amountUsd: string;
  paymentMethod: SubscriptionPaymentMethod;
  paymentReference: string;
  proofImageUrl: string;
  createdAt: string;
}

interface InstallmentRequest {
  id: string;
  priceUsd: string;
  payments: InstallmentPayment[];
}

const PAYMENT_METHODS: SubscriptionPaymentMethod[] = ['PAGO_MOVIL', 'BINANCE', 'BANK_TRANSFER'];
const PAYMENT_METHOD_ICON: Record<SubscriptionPaymentMethod, typeof Wallet> = {
  PAGO_MOVIL: Wallet,
  BINANCE: Bitcoin,
  BANK_TRANSFER: Landmark,
};

interface Props {
  selected: SelectedPlan;
  rateBs: string | null;
  onCancel: () => void;
  /** Endpoint donde se envía el FormData: público (inscripción) o autenticado (mensualidad). */
  submitUrl: string;
  /** Si viene, se manda como Bearer (flujo autenticado del panel). */
  authToken?: string;
  prefillName?: string;
  prefillEmail?: string;
  /** Qué mostrar tras un envío exitoso. */
  renderSuccess: (message: string) => ReactNode;
}

export function PaymentForm({
  selected,
  rateBs,
  onCancel,
  submitUrl,
  authToken,
  prefillName,
  prefillEmail,
  renderSuccess,
}: Props) {
  // SHOP/CLUB no viven en PLAN_CONTENT (esa lista es solo de Restaurante, para no mezclarse con
  // las 3 tarjetas de PlanCards) — se nombran aparte, igual que en SinglePlanCard.
  const SINGLE_PLAN_NAMES: Partial<Record<typeof selected.plan, string>> = { SHOP: 'QuickTap Shop', ELITE_SHOP: 'Elite Shop', CLUB: 'QuickTap Club' };
  const planName = PLAN_CONTENT.find((p) => p.id === selected.plan)?.name ?? SINGLE_PLAN_NAMES[selected.plan] ?? 'Plan Personalizado';
  const [implementation, setImplementation] = useState({ sites: 1, specialSetup: false, complexInventory: false, onsiteTraining: false, mode: selected.plan === 'ESSENTIAL' ? 'QUICKSTAR' : 'ACCOMPANIED' });
  const [implementationConfirmed, setImplementationConfirmed] = useState(false);
  const [advisor, setAdvisor] = useState(false);
  const requiresQuote = implementation.sites > 2 || (selected.plan === 'CONTROL' && (implementation.sites > 1 || implementation.specialSetup || implementation.complexInventory || implementation.onsiteTraining)) || ((selected.plan === 'ESSENTIAL' || selected.plan === 'OPERATIONS') && implementation.sites > 1);
  const { copy, toastMessage } = useCopyToast();
  const [methods, setMethods] = useState<PlatformPaymentMethods>({});
  const [method, setMethod] = useState<SubscriptionPaymentMethod>('PAGO_MOVIL');
  // Ramblay (C2P/Binance Pay, activación automática) es la opción por
  // defecto; "manual" es el flujo de siempre (transferencia/Zelle con
  // número de referencia, revisado a mano por el equipo de QuickTap). El
  // Dashboard maestro puede apagar cualquiera de las dos globalmente.
  const [payWith, setPayWith] = useState<'ramblay' | 'manual'>('manual');
  const [step, setStep] = useState(0);
  const ramblayEnabled = !selected.addonsOnly && !isCommercialPlan(selected.plan) && (methods.ramblayEnabled ?? true);
  const manualPaymentEnabled = methods.manualPaymentEnabled ?? true;
  const [contactName, setContactName] = useState(prefillName ?? '');
  const [contactEmail, setContactEmail] = useState(prefillEmail ?? '');
  const [contactPhone, setContactPhone] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  // "Pago único" (de siempre) vs "Pago fraccionado": solo tiene sentido para el restaurante ya
  // autenticado pagando su mensualidad (authToken presente) — la inscripción pública sigue el
  // flujo de siempre, un solo comprobante.
  const [payMode, setPayMode] = useState<'single' | 'installment'>('single');
  const [installment, setInstallment] = useState<InstallmentRequest | null>(null);
  const [startingInstallment, setStartingInstallment] = useState(false);
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [installmentProof, setInstallmentProof] = useState<File | null>(null);
  // Comprobante del pago único, opcional: si se adjunta, se reenvía de una vez por WhatsApp al
  // número verificador (ver plan-request.controller.ts#notifyVerifierOfProof), para que el
  // equipo de QuickTap lo revise sin tener que entrar al Dashboard a buscarlo.
  const [singleProof, setSingleProof] = useState<File | null>(null);
  const [addingPayment, setAddingPayment] = useState(false);
  const [installmentError, setInstallmentError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<{ code: string; discountPercent: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Moneda en la que QuickTap cobra la mensualidad (Dashboard maestro → Planes → Moneda de
  // cobro) — self-fetch igual que PlanCards, único consumidor de este componente.
  const [currencySymbol, setCurrencySymbol] = useState('€');
  const [quotedTotal, setQuotedTotal] = useState<number | null>(null);
  const [signupPromotion, setSignupPromotion] = useState<SignupPromotionQuote | null>(null);
  useEffect(() => {
    if (!authToken || selected.plan === 'CUSTOM') return;
    let cancelled = false;
    setQuotedTotal(null);
    setSignupPromotion(null);
    api.get('/plan-requests/quote', { params: { plan: selected.plan, billingCycle: selected.billingCycle, promoCode: promo?.code, addonsOnly: selected.addonsOnly ? "true" : undefined, membershipAddons: selected.membershipAddons ? JSON.stringify(selected.membershipAddons) : undefined } })
      .then((res) => { if (!cancelled) { setQuotedTotal(Number(res.data.data.totalUsd)); setSignupPromotion(res.data.data.signupPromotion ?? null); } })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.error ?? 'No pudimos consultar el monto. Vuelve a intentar antes de pagar.'); });
    return () => { cancelled = true; };
  }, [authToken, selected.plan, selected.billingCycle, selected.membershipAddons, selected.addonsOnly, promo?.code]);

  useEffect(() => {
    api
      .get('/public/plans/currency')
      .then((res) => setCurrencySymbol(res.data.data?.currency === 'EUR' ? '€' : '$'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api
      .get('/public/payment-methods')
      .then((res) => {
        const data: PlatformPaymentMethods = res.data.data ?? {};
        setMethods(data);
        // Si Ramblay (la opción por defecto) está apagado, cae al manual automáticamente.
        if (data.ramblayEnabled === false && data.manualPaymentEnabled !== false) setPayWith('manual');
        if (!isCommercialPlan(selected.plan) && data.manualPaymentEnabled === false && data.ramblayEnabled !== false) setPayWith('ramblay');
      })
      .catch(() => setMethods({}));
  }, [selected.plan]);

  const authHeaders = authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : undefined;

  // Retoma el pago fraccionado pendiente (si el restaurante ya había empezado uno) en vez de
  // obligarlo a empezar de cero cada vez que vuelve a esta pantalla.
  useEffect(() => {
    if (!authToken) return;
    api
      .get(`${submitUrl}/installment/pending`, authHeaders)
      .then((res) => {
        if (res.data.data) { setInstallment(res.data.data); setPayMode('installment'); setPayWith('manual'); setStep(2); }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  async function startInstallment() {
    if (!contactName.trim() || !contactEmail.trim()) {
      setInstallmentError('Escribe tu nombre y correo para continuar.');
      return;
    }
    setStartingInstallment(true);
    setInstallmentError(null);
    try {
      const { data } = await api.post(
        `${submitUrl}/installment`,
        {
          plan: selected.plan,
        membershipAddons: selected.membershipAddons,
        addonsOnly: selected.addonsOnly,
          ...(isCommercialPlan(selected.plan) ? { implementation } : {}),
          billingCycle: selected.billingCycle,
          ...(promo ? { promoCode: promo.code } : {}),
          contactName,
          contactEmail,
          ...(contactPhone ? { contactPhone } : {}),
        },
        authHeaders,
      );
      setInstallment(data.data);
      setInstallmentAmount('');
    } catch (err: any) {
      setInstallmentError(err.response?.data?.error ?? 'No se pudo iniciar el pago fraccionado.');
    } finally {
      setStartingInstallment(false);
    }
  }

  async function addInstallmentPayment() {
    if (!installment) return;
    const amount = Number(installmentAmount);
    if (installment.payments.length >= 3 || amount > installmentRemainingUsd || (installment.payments.length === 2 && Math.abs(amount - installmentRemainingUsd) > 0.001)) {
      setInstallmentError('Máximo 3 partes. La última debe cubrir el saldo y ningún abono puede superarlo.');
      return;
    }
    if (!amount || amount <= 0) {
      setInstallmentError('Escribe el monto que vas a abonar.');
      return;
    }
    if (!paymentReference.trim()) {
      setInstallmentError('Escribe el número de referencia de este abono.');
      return;
    }
    if (!installmentProof) {
      setInstallmentError('Sube el comprobante de este abono.');
      return;
    }
    setAddingPayment(true);
    setInstallmentError(null);
    try {
      const form = new FormData();
      form.append('amountUsd', String(amount));
      form.append('paymentMethod', method);
      form.append('paymentReference', paymentReference.trim());
      form.append('photo', installmentProof);
      await api.post(`${submitUrl}/${installment.id}/payments`, form, {
        headers: { ...(authHeaders?.headers ?? {}), 'Content-Type': 'multipart/form-data' },
      });
      const { data } = await api.get(`${submitUrl}/installment/pending`, authHeaders);
      setInstallment(data.data);
      setInstallmentAmount('');
      setPaymentReference('');
      setInstallmentProof(null);
    } catch (err: any) {
      setInstallmentError(err.response?.data?.error ?? 'No se pudo registrar el abono.');
    } finally {
      setAddingPayment(false);
    }
  }

  const installmentPaidUsd = installment ? installment.payments.reduce((a, p) => a + Number(p.amountUsd), 0) : 0;
  const installmentRemainingUsd = installment ? Math.max(0, Number(installment.priceUsd) - installmentPaidUsd) : 0;

  // selected.priceUsd es la MENSUALIDAD EQUIVALENTE del ciclo; lo que se paga
  // de una vez son todos los meses del ciclo (el backend recalcula igual).
  const finalPriceUsd = promo
    ? Math.round(selected.priceUsd * (1 - promo.discountPercent / 100) * 100) / 100
    : selected.priceUsd;
  const cycleMonths = CYCLE_MONTHS[selected.billingCycle];
  const cycleTotalUsd = installment ? Number(installment.priceUsd) : quotedTotal ?? Math.round(finalPriceUsd * cycleMonths * 100) / 100;
  const cycleFullUsd = Math.round(selected.priceUsd * cycleMonths * 100) / 100;

  async function applyPromo() {
    if (!promoInput.trim()) return;
    setCheckingPromo(true);
    setPromoError(null);
    try {
      const { data } = await api.get(`/public/promo-codes/${encodeURIComponent(promoInput.trim())}`);
      setPromo(data.data);
    } catch (err: any) {
      setPromo(null);
      setPromoError(err.response?.data?.error ?? 'Código inválido.');
    } finally {
      setCheckingPromo(false);
    }
  }

  async function onSubmit(e?: FormEvent, checkout?: CheckoutSubmission) {
    e?.preventDefault();
    const submittedProof = checkout?.proof ?? singleProof;
    const submittedReference = checkout?.reference ?? paymentReference;
    // El "pago fraccionado" no usa este submit — cada abono se envía con su propio botón
    // (addInstallmentPayment) para no mezclar su validación con la del pago único.
    if (payWith === 'manual' && authToken && payMode === 'installment') return;
    if (payWith === 'ramblay') {
      await payWithRamblay();
      return;
    }
    if (authToken && !submittedProof) {
      setError('Sube tu comprobante para enviar el pago a verificación.');
      return;
    }
    if (!submittedReference.trim()) {
      setError('Escribe el número de referencia del pago.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        plan: selected.plan,
        membershipAddons: selected.membershipAddons,
        addonsOnly: selected.addonsOnly,
          ...(isCommercialPlan(selected.plan) ? { implementation } : {}),
        billingCycle: selected.billingCycle,
        paymentMethod: checkout?.method ?? method,
        paymentReference: submittedReference.trim(),
        ...(selected.plan === 'CUSTOM'
          ? {
              customTables: selected.customTables ?? 0,
              customUsers: selected.customUsers ?? 0,
              customOrders: selected.customOrders ?? 0,
              customAdministration: !!selected.customAddons?.administration,
              customInventoryBasic: !!selected.customAddons?.inventoryBasic,
              customInventoryRecipe: !!selected.customAddons?.inventoryRecipe,
              customAccountsPayable: !!selected.customAddons?.accountsPayable,
            }
          : {}),
        ...(promo ? { promoCode: promo.code } : {}),
        contactName: checkout?.contactName ?? contactName,
        contactEmail: checkout?.contactEmail ?? contactEmail,
        ...((checkout?.contactPhone ?? contactPhone) ? { contactPhone: checkout?.contactPhone ?? contactPhone } : {}),
        ...((checkout?.restaurantName ?? restaurantName) ? { restaurantName: checkout?.restaurantName ?? restaurantName } : {}),
      };
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
      if (submittedProof) {
        const form = new FormData();
        form.append('payload', JSON.stringify(payload));
        form.append('photo', submittedProof);
        await api.post(submitUrl, form, { timeout:30000, headers: { ...(headers ?? {}), 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post(submitUrl, payload, headers ? { headers } : undefined);
      }
      setSuccessMessage('Tu pago fue recibido y está en verificación. Tienes una hora de acceso provisional desde el primer comprobante. Si sigue pendiente, recordaremos al equipo que lo revise.');
    } catch (err: any) {
      const message = err.response?.data?.error ?? 'No se pudo enviar la solicitud.';
      setError(message);
      if (checkout) throw new Error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function payWithRamblay() {
    if (!contactName.trim() || !contactEmail.trim()) {
      setError('Escribe tu nombre y correo para continuar.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post(
        `${submitUrl}/ramblay-checkout`,
        {
          plan: selected.plan,
        membershipAddons: selected.membershipAddons,
        addonsOnly: selected.addonsOnly,
          ...(isCommercialPlan(selected.plan) ? { implementation } : {}),
          billingCycle: selected.billingCycle,
          ...(promo ? { promoCode: promo.code } : {}),
          contactName,
          contactEmail,
          ...(contactPhone ? { contactPhone } : {}),
          ...(restaurantName ? { restaurantName } : {}),
        },
        authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : undefined,
      );
      window.location.href = data.data.checkoutUrl;
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo iniciar el pago con Ramblay.');
      setSubmitting(false);
    }
  }

  if (successMessage) {
    return <>{renderSuccess(successMessage)}</>;
  }

  const enabledMethods = PAYMENT_METHODS.filter(m => m === 'BINANCE' ? !!(methods.binance?.id || methods.binance?.correo) : m === 'PAGO_MOVIL' ? !!(methods.pagoMovil?.banco && methods.pagoMovil?.telefono && methods.pagoMovil?.cedula) : !!(methods.bankTransfer?.banco && methods.bankTransfer?.cuenta));
  const methodOptions = (amount:number) => enabledMethods.filter(m => m === 'BINANCE' || Number(rateBs)>0).map(id => ({id,amountTitle:id==='BINANCE'?'Importe de tu suscripción':undefined,amountLabel:id==='BINANCE'?`${currencySymbol}${amount.toFixed(2)}`:formatBs(amount,rateBs!),rateLabel:id==='BINANCE'?'Confirma la equivalencia con soporte antes de transferir':`Tasa aplicada: ${currencySymbol}1 = Bs. ${rateBs}`}));
  const requirements = <>{signupPromotion && <SignupPromotionPrice promotion={signupPromotion} symbol={currencySymbol} />}      {isCommercialPlan(selected.plan) && <section className="mb-6 space-y-3 rounded-xl bg-blue-50 p-4 text-sm">
        <h3 className="font-semibold">Tu implementación</h3>
        <label className="block text-sm font-medium">Sedes <input type="number" min="1" max="100" value={implementation.sites} onChange={e => setImplementation({ ...implementation, sites: Number(e.target.value) })} className="ml-3 w-20 rounded border p-2 text-base" /></label>
        {selected.plan === 'ESSENTIAL' && <select className="rounded border p-2 text-base" value={implementation.mode} onChange={e => setImplementation({ ...implementation, mode: e.target.value })}><option value="QUICKSTAR">Configúralo con QuickStar</option><option value="ACCOMPANIED">Implementación asistida</option></select>}
        {selected.plan !== 'ESSENTIAL' && <p>Implementación acompañada.</p>}
        {selected.plan === 'CONTROL' && (['specialSetup', 'complexInventory', 'onsiteTraining'] as const).map((key, index) => <label key={key} className="block text-sm font-medium"><input type="checkbox" checked={implementation[key]} onChange={e => setImplementation({ ...implementation, [key]: e.target.checked })} /> {['Necesito configuración especial', 'Tengo inventario complejo', 'Necesito capacitación presencial'][index]}</label>)}
        {requiresQuote ? <button type="button" className="font-semibold text-brand-500 underline" onClick={() => setAdvisor(true)}>Solicitar demo / cotización</button> : <label className="block text-sm font-medium"><input type="checkbox" checked={implementationConfirmed} onChange={e => setImplementationConfirmed(e.target.checked)} /> Confirmo estos requisitos y las condiciones del plan seleccionado.</label>}
        {advisor && <AdvisorLeadDialog onClose={() => setAdvisor(false)} />}
      </section>}
      <div className="mb-6">
        <span className="text-sm text-brand-950/70 font-medium">Código de descuento</span>
        {promo ? (
          <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-emerald-50 text-emerald-700 px-3 py-2 text-sm w-fit">
            <Tag className="h-4 w-4" /> {promo.code} · -{promo.discountPercent}%
            <button
              type="button"
              onClick={() => {
                setPromo(null);
                setPromoInput('');
              }}
              className="text-emerald-700/60 hover:text-emerald-900"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="mt-1.5 flex items-center gap-2">
            <input
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
              placeholder="Ej: LANZAMIENTO20"
              className="border border-brand-950/15 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
            />
            <button
              type="button"
              onClick={applyPromo}
              disabled={checkingPromo || !promoInput.trim()}
              className="text-sm font-medium text-brand-500 disabled:opacity-40"
            >
              {checkingPromo ? 'Validando…' : 'Aplicar'}
            </button>
          </div>
        )}
        {promoError && <p className="text-red-600 mt-1 text-xs">{promoError}</p>}
      </div>
</>;
  if (authToken && payWith==='manual' && manualPaymentEnabled && (installment || payMode==='installment')) {
    return <InstallmentCheckout total={cycleTotalUsd} symbol={currencySymbol} payments={installment?.payments??[]} onBack={()=>{if(installment)onCancel();else{setPayMode('single');setStep(0)}}}
      renderCheckout={(amount,submit,back)=><SubscriptionCheckout includedPlan={selected.addonsOnly ? undefined : selected.plan} planName={planName} periodLabel="Abono de membresía" totalLabel={`${currencySymbol}${amount.toFixed(2)}`} restaurantName={restaurantName||'Tu restaurante'} methods={methodOptions(amount)} accounts={methods} collectContact prefillName={contactName} prefillEmail={contactEmail} onBack={back} onSubmit={submit}/>}
      onPay={async(amount,payment)=>{
        let request=installment;
        try {
          if(!request){const result=await api.post(`${submitUrl}/installment`,{plan:selected.plan,addonsOnly:selected.addonsOnly,membershipAddons:selected.membershipAddons,billingCycle:selected.billingCycle,...(isCommercialPlan(selected.plan)?{implementation}:{}),...(promo?{promoCode:promo.code}:{}),contactName:payment.contactName,contactEmail:payment.contactEmail,...(payment.contactPhone?{contactPhone:payment.contactPhone}:{})},authHeaders);request=result.data.data;setInstallment(request)}
          if(!request)throw new Error('No se pudo iniciar el pago fraccionado.');
          const form=new FormData();form.append('amountUsd',amount.toFixed(2));form.append('paymentMethod',payment.method);form.append('paymentReference',payment.reference);form.append('photo',payment.proof);
          const result=await api.post(`${submitUrl}/${request.id}/payments`,form,{timeout:30000,headers:{...(authHeaders?.headers??{}),'Content-Type':'multipart/form-data'}});
          const recorded=result.data.data;
          setInstallment({...request,payments:[...request.payments,{id:recorded?.id||payment.reference,amountUsd:amount.toFixed(2),paymentMethod:payment.method,paymentReference:payment.reference,proofImageUrl:recorded?.proofImageUrl||'',createdAt:recorded?.createdAt||new Date().toISOString()}]});
        }catch(err:any){throw new Error(err.response?.data?.error||err.message||'No se pudo registrar el abono. Tus datos siguen aquí.')}
      }}/>
  }
  if (step <= 1 && payWith==='manual' && manualPaymentEnabled && payMode==='single' && !installment) {
    const ready=(!authToken||quotedTotal!==null)&&(selected.addonsOnly||!isCommercialPlan(selected.plan)||(implementationConfirmed&&!requiresQuote));
    return <SubscriptionCheckout includedPlan={selected.addonsOnly ? undefined : selected.plan} planName={planName} periodLabel={selected.addonsOnly?'Adicionales hasta tu vencimiento actual':cycleMonths>1?`${cycleMonths} meses`:'Suscripción mensual'} totalLabel={authToken&&quotedTotal===null?'Consultando…':`${currencySymbol}${cycleTotalUsd.toFixed(2)}`} restaurantName={restaurantName||'Tu restaurante'} methods={methodOptions(cycleTotalUsd)} accounts={methods} collectContact collectRestaurant={!authToken} prefillName={contactName} prefillEmail={contactEmail}
      beforePayment={<>{selected.addonsOnly?<p className="qt-pay-intro text-base">Solo pagas los adicionales hasta el vencimiento actual, con base de 30 días por mes. Al renovar se suman a tu mensualidad.</p>:requirements}{error&&<p role="alert" className="qt-pay-error text-xs">{error}</p>}</>} canContinue={ready}
      onBack={onCancel} onInstallments={authToken&&ready?()=>{setPayMode('installment');setStep(2)}:undefined} onAutomated={ramblayEnabled&&ready?()=>{setPayWith('ramblay');setStep(2)}:undefined} onSubmit={payment=>onSubmit(undefined,payment)}/>;
  }

  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white p-6 sm:p-8 shadow-sm">
      {signupPromotion && <SignupPromotionPrice promotion={signupPromotion} symbol={currencySymbol} />}
      <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="Pasos del pago">
        {['Tu membresía', 'Método y datos', 'Comprobante'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={`rounded-xl px-3 py-3 text-xs font-medium ${step === index ? 'bg-brand-500 text-white' : 'bg-sky-50 text-brand-950/60'}`}>{index + 1}. {label}</li>)}
      </ol>
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <p className="text-brand-950/50 font-light text-base">Estás eligiendo</p>
          <p className="text-lg font-semibold text-brand-950">
            {planName} ·{' '}
            {promo ? (
              <>
                <span className="line-through text-brand-950/40">{currencySymbol}{cycleFullUsd.toFixed(2)}</span>{' '}
                <span className="text-brand-500">{currencySymbol}{cycleTotalUsd.toFixed(2)}</span>
              </>
            ) : (
              <>{currencySymbol}{cycleTotalUsd.toFixed(2)}</>
            )}
            <span className="text-sm font-normal text-brand-950/50">
              {' '}
              {cycleMonths > 1 ? `por ${cycleMonths} meses` : '/mes'}
            </span>
            {rateBs && (
              <span className="text-sm font-normal text-brand-950/50"> ({formatBs(cycleTotalUsd, rateBs)})</span>
            )}
          </p>
          {cycleMonths > 1 && (
            <p className="text-brand-950/50 font-light mt-0.5 text-xs">
              Equivale a {currencySymbol}
              {finalPriceUsd.toFixed(2)}/mes · un solo pago por adelantado
            </p>
          )}
        </div>
        <button onClick={onCancel} className="text-sm text-brand-950/40 hover:text-brand-950 shrink-0">
          Cambiar plan
        </button>
      </div>

      {isCommercialPlan(selected.plan) && step === 0 && <section className="mb-6 space-y-3 rounded-xl bg-blue-50 p-4 text-sm">
        <h3 className="font-semibold">Tu implementación</h3>
        <label className="block text-sm font-medium">Sedes <input type="number" min="1" max="100" value={implementation.sites} onChange={e => setImplementation({ ...implementation, sites: Number(e.target.value) })} className="ml-3 w-20 rounded border p-2 text-base" /></label>
        {selected.plan === 'ESSENTIAL' && <select className="rounded border p-2 text-base" value={implementation.mode} onChange={e => setImplementation({ ...implementation, mode: e.target.value })}><option value="QUICKSTAR">Configúralo con QuickStar</option><option value="ACCOMPANIED">Implementación asistida</option></select>}
        {selected.plan !== 'ESSENTIAL' && <p>Implementación acompañada.</p>}
        {selected.plan === 'CONTROL' && (['specialSetup', 'complexInventory', 'onsiteTraining'] as const).map((key, index) => <label key={key} className="block text-sm font-medium"><input type="checkbox" checked={implementation[key]} onChange={e => setImplementation({ ...implementation, [key]: e.target.checked })} /> {['Necesito configuración especial', 'Tengo inventario complejo', 'Necesito capacitación presencial'][index]}</label>)}
        {requiresQuote ? <button type="button" className="font-semibold text-brand-500 underline" onClick={() => setAdvisor(true)}>Solicitar demo / cotización</button> : <label className="block text-sm font-medium"><input type="checkbox" checked={implementationConfirmed} onChange={e => setImplementationConfirmed(e.target.checked)} /> Confirmo estos requisitos y las condiciones del plan seleccionado.</label>}
        {advisor && <AdvisorLeadDialog onClose={() => setAdvisor(false)} />}
      </section>}
      <div className="mb-6" hidden={step !== 0}>
        <span className="text-sm text-brand-950/70 font-medium">Código de descuento</span>
        {promo ? (
          <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-emerald-50 text-emerald-700 px-3 py-2 text-sm w-fit">
            <Tag className="h-4 w-4" /> {promo.code} · -{promo.discountPercent}%
            <button
              type="button"
              onClick={() => {
                setPromo(null);
                setPromoInput('');
              }}
              className="text-emerald-700/60 hover:text-emerald-900"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="mt-1.5 flex items-center gap-2">
            <input
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
              placeholder="Ej: LANZAMIENTO20"
              className="border border-brand-950/15 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
            />
            <button
              type="button"
              onClick={applyPromo}
              disabled={checkingPromo || !promoInput.trim()}
              className="text-sm font-medium text-brand-500 disabled:opacity-40"
            >
              {checkingPromo ? 'Validando…' : 'Aplicar'}
            </button>
          </div>
        )}
        {promoError && <p className="text-red-600 mt-1 text-xs">{promoError}</p>}
      </div>

      <div hidden={step !== 1}>
      {(ramblayEnabled || manualPaymentEnabled) && (
        <div className="flex flex-wrap gap-2 mb-6">
          {ramblayEnabled && (
            <button
              type="button"
              onClick={() => setPayWith('ramblay')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                payWith === 'ramblay' ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
              }`}
            >
              <CreditCard className="h-3.5 w-3.5" /> Pago Automatizado
            </button>
          )}
          {manualPaymentEnabled && (
            <button
              type="button"
              onClick={() => setPayWith('manual')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                payWith === 'manual' ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
              }`}
            >
              Pago manual
            </button>
          )}
        </div>
      )}

      {!ramblayEnabled && !manualPaymentEnabled ? (
        <p className="text-amber-600 font-medium mb-6 text-base">
          Los pagos están deshabilitados temporalmente. Contáctanos para activar tu plan.
        </p>
      ) : payWith === 'ramblay' ? (
        <p className="text-brand-950/60 font-light mb-6 text-base">
          Pagas con C2P o Binance Pay en el checkout seguro de Ramblay. En cuanto se confirme, tu plan se activa solo —
          sin esperar revisión manual.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {PAYMENT_METHODS.map((m) => {
              const Icon = PAYMENT_METHOD_ICON[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    method === m ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {PAYMENT_METHOD_LABEL[m]}
                </button>
              );
            })}
          </div>

          <div className="rounded-xl bg-brand-950/[0.03] p-4 mb-6 text-sm space-y-1.5">
            {paymentMethodLines(method, methods).filter(line => line.label !== 'Titular').map((line) => (
              <div key={line.label} className="flex items-center justify-between gap-2">
                <p className="text-brand-950/70 text-base">
                  <span className="text-brand-950/50">{line.label}: </span>
                  {line.value}
                </p>
                {line.copyable && (
                  <button
                    type="button"
                    onClick={() => copy(line.value, `${line.label} copiado`)}
                    aria-label={`Copiar ${line.label}`}
                    className="shrink-0 text-brand-950/40 hover:text-brand-500 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      </div>
      <div className="mb-5 flex justify-between gap-3">
        {step > 0 && <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={() => setStep(step - 1)}>Atrás</button>}
        {step < 2 && <button type="button" disabled={(!!authToken && quotedTotal === null) || (isCommercialPlan(selected.plan) && (!implementationConfirmed || requiresQuote))} className="ml-auto rounded-xl bg-brand-500 px-5 py-2 text-sm text-white disabled:opacity-40" onClick={() => setStep(step + 1)}>Continuar</button>}
      </div>
      <form onSubmit={onSubmit} hidden={step !== 2} className={`space-y-4 ${!ramblayEnabled && !manualPaymentEnabled ? 'hidden' : ''}`}>
        {payWith === 'manual' && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nombre" value={contactName} onChange={setContactName} required />
              <Field label="Correo" type="email" value={contactEmail} onChange={setContactEmail} required />
              <Field label="Teléfono" value={contactPhone} onChange={setContactPhone} placeholder="584141234567" />
              {!authToken && <Field label="Nombre del restaurante" value={restaurantName} onChange={setRestaurantName} />}
            </div>

            {authToken && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPayMode('single')}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    payMode === 'single' ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                  }`}
                >
                  Pago único
                </button>
                <button
                  type="button"
                  onClick={() => setPayMode('installment')}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    payMode === 'installment' ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                  }`}
                >
                  Pago fraccionado
                </button>
              </div>
            )}

            {payMode === 'single' || !authToken ? (
              <>
                <Field
                  label="Número de referencia del pago"
                  value={paymentReference}
                  onChange={setPaymentReference}
                  placeholder="Ej: 004215778901"
                  required
                />
                <label className="flex items-center gap-2 text-brand-950/70 cursor-pointer text-sm font-medium">
                  <Paperclip className="h-4 w-4 shrink-0 text-brand-950/40" />
                  <span className="truncate">{singleProof ? singleProof.name : 'Subir comprobante de pago'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setSingleProof(e.target.files?.[0] ?? null)}
                  />
                </label>
                {singleProof && (
                  <p className="text-brand-950/40 font-light -mt-2 text-xs">
                    Se lo reenviamos de una vez a nuestro equipo por WhatsApp para agilizar la revisión.
                  </p>
                )}
              </>
            ) : !installment ? (
              <div className="rounded-xl bg-brand-950/[0.03] p-4 space-y-3">
                <p className="text-brand-950/60 font-light text-base">
                  Abona el monto que puedas ahora y sigue completando el resto con más abonos, cada uno con su propio
                  comprobante, hasta cubrir el total.
                </p>
                {installmentError && <p className="text-red-600 text-base">{installmentError}</p>}
                <TextureButton
                  type="button"
                  variant="brand"
                  size="sm"
                  disabled={startingInstallment}
                  className="!w-auto disabled:opacity-50"
                  onClick={startInstallment}
                >
                  {startingInstallment ? 'Iniciando…' : 'Iniciar pago fraccionado'}
                </TextureButton>
              </div>
            ) : (
              <div className="rounded-xl bg-brand-950/[0.03] p-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-brand-950/70">
                      Pagado: <span className="font-semibold text-brand-950">{currencySymbol}{installmentPaidUsd.toFixed(2)}</span> de{' '}
                      {currencySymbol}
                      {Number(installment.priceUsd).toFixed(2)}
                    </span>
                    {installmentRemainingUsd > 0 && (
                      <span className="text-brand-950/50">Faltan {currencySymbol}{installmentRemainingUsd.toFixed(2)}</span>
                    )}
                  </div>
                  <div className="h-2 rounded-full bg-brand-950/10 overflow-hidden">
                    <div
                      className="h-full bg-brand-500 transition-all"
                      style={{
                        width: `${Math.min(100, (installmentPaidUsd / Number(installment.priceUsd)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                {installment.payments.length > 0 && (
                  <div className="rounded-lg border border-brand-950/10 divide-y divide-brand-950/[0.06]">
                    {installment.payments.map((p, i) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="text-brand-950/70">
                          Abono {i + 1} · {PAYMENT_METHOD_LABEL[p.paymentMethod]} · Ref. {p.paymentReference}
                        </span>
                        <span className="font-semibold text-brand-950 shrink-0">{currencySymbol}{Number(p.amountUsd).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {installment.payments.length > 0 && <p role="status" className="rounded-xl bg-sky-50 p-3 text-brand-950 text-base">Tu pago fue recibido y está en verificación. Abonos enviados: {installment.payments.length}/3. La hora de acceso provisional comienza con el primer comprobante y no se reinicia con los siguientes.</p>}
                {installmentRemainingUsd > 0 && installment.payments.length < 3 ? (
                  <div className="space-y-3 pt-1 border-t border-brand-950/[0.06]">
                    <p className="font-medium text-brand-950/70 text-base">Registrar un abono</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Field
                        label={`Monto a abonar (${currencySymbol})`}
                        type="number"
                        value={installmentAmount}
                        onChange={setInstallmentAmount}
                        placeholder={installmentRemainingUsd.toFixed(2)}
                      />
                      <Field
                        label="Número de referencia"
                        value={paymentReference}
                        onChange={setPaymentReference}
                        placeholder="Ej: 004215778901"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-brand-950/70 cursor-pointer text-sm font-medium">
                      <Paperclip className="h-4 w-4 shrink-0 text-brand-950/40" />
                      <span className="truncate">{installmentProof ? installmentProof.name : 'Subir comprobante de este abono'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setInstallmentProof(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    {installmentError && <p className="text-red-600 text-base">{installmentError}</p>}
                    <TextureButton
                      type="button"
                      variant="brand"
                      size="sm"
                      disabled={addingPayment}
                      className="!w-auto disabled:opacity-50 flex items-center gap-2"
                      onClick={addInstallmentPayment}
                    >
                      {addingPayment && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {addingPayment ? 'Guardando…' : 'Agregar abono'}
                    </TextureButton>
                  </div>
                ) : (
                  <p className="text-emerald-600 font-medium pt-1 border-t border-brand-950/[0.06] text-base">
                    ¡Cubriste el total! En cuanto lo confirmemos, activaremos tu cuenta.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {error && <p className="text-red-600 text-base">{error}</p>}

        {!(payWith === 'manual' && authToken && payMode === 'installment') && (
          <TextureButton
            variant="brand"
            size="default"
            disabled={submitting}
            className="!w-auto disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting
              ? payWith === 'ramblay'
                ? 'Abriendo Ramblay…'
                : 'Enviando…'
              : payWith === 'ramblay'
                ? 'Pagar con Ramblay'
                : 'Pagar'}
          </TextureButton>
        )}
      </form>
      <Toast message={toastMessage} />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      <span className="text-brand-950/70">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
      />
    </label>
  );
}
