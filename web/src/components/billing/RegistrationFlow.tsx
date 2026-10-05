import { registrationPaymentDates, registrationDateLabel } from '../../utils/registration-payment-dates';
import { passwordStrength, passwordsMatch } from '../../utils/password-strength';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ClipboardList, CreditCard, ShieldCheck } from 'lucide-react';
import { WhatsappPhoneInput } from '../ui/whatsapp-phone-input';
import { COMMERCIAL_PLANS, type CommercialPlan } from '../../utils/commercial-plans';
import { PLAN_CONTENT } from '../landing/PlanCards.shared';
import { RegistrationPromotionTerms } from './RegistrationWelcome';
import './registration-flow.css';

export interface RegistrationFields {
  restaurantName: string; slug: string; whatsappPhone: string; baseCurrency: 'USD' | 'EUR';
  ownerName: string; email: string; password: string;
}
interface Props {
  values: RegistrationFields;
  onChange: (key: keyof RegistrationFields, value: string) => void;
  plan: CommercialPlan;
  onPlanChange: (plan: CommercialPlan) => void;
  google?: { googleName: string; googleEmail: string } | null;
  googleButton: ReactNode;
  onClearGoogle: () => void;
  onSubmit: (event: FormEvent) => void;
  loading: boolean;
  error: string | null;
}
const titles = ['Empecemos por ti.', 'Dale forma a tu restaurante.', 'Todo claro antes de empezar.'];
const money = (amount: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);

export default function RegistrationFlow({ values, onChange, plan, onPlanChange, google, googleButton, onClearGoogle, onSubmit, loading, error }: Props) {
  const [step, setStep] = useState(0);
  const [registrationNow, setRegistrationNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setRegistrationNow(new Date());
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const paymentDates = registrationPaymentDates(registrationNow);
  const [accepted, setAccepted] = useState(false);
  const [validation, setValidation] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const strength = passwordStrength(values.password);
  const confirmed = passwordsMatch(values.password, passwordConfirmation);
  const heading = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);
  const offer = COMMERCIAL_PLANS[plan];
  // Mismo redondeo por mensualidad que signupCyclePrice del servidor.
  const promotionalMonthly = Math.round(Math.round(offer.monthly * 100) / 2) / 100;
  useEffect(() => {
    if (started.current) heading.current?.focus();
    started.current = true;
  }, [step]);
  function go(next: number) { setValidation(''); setAccepted(false); setStep(next); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (step === 0 && values.whatsappPhone && !/^[1-9]\d{6,14}$/.test(values.whatsappPhone)) {
      setValidation('Revisa el WhatsApp: incluye el país y un número válido.'); return;
    }
    if (step === 1 && (!values.restaurantName.trim() || (!google && !values.ownerName.trim()))) {
      setValidation('Escribe el nombre del restaurante y el nombre del responsable.'); return;
    }
    if (step >= 1 && !google && !confirmed) { setValidation('Las contraseñas no coinciden. Revísalas antes de continuar.'); return; }
    if (step < 2) { go(step + 1); return; }
    if (!accepted) { setValidation('Acepta los términos para crear tu cuenta.'); return; }
    onSubmit(event);
  }
  const field = (key: keyof RegistrationFields, label: string, options: { type?: string; placeholder?: string; autoComplete?: string; minLength?: number; maxLength?: number; pattern?: string } = {}) =>
    <label className="qt-signup-field text-sm font-medium" key={key}>{label}<input required value={values[key]} onChange={e => onChange(key, e.target.value)} {...options}/></label>;
  return <main className="qt-signup">
    <header className="qt-signup-header"><Link to="/" aria-label="QuickTap, inicio"><img src="/logo/quicktap-logo.png?v=20261002" alt="QuickTap"/></Link><span>¿Ya tienes cuenta? <Link to="/admin/login">Ingresa</Link></span></header>
    <div className="qt-signup-shell">
      <aside className="qt-signup-story">
        <p className="qt-signup-eyebrow">TU RESTAURANTE, CONECTADO</p>
        <h1>Empieza con orden.<br/><span>Crece con control.</span></h1>
        <p>Un solo lugar para organizar tus pedidos y seguir cada cobro desde el primer día.</p>
        <div className="qt-signup-benefits"><p><ClipboardList size={19}/>Pedidos y cocina conectados</p><p><CreditCard size={19}/>Cobros y pendientes más claros</p><p><ShieldCheck size={19}/>Tu equipo, con sus propios accesos</p></div>
        <div className="qt-signup-offer"><span>Promoción de bienvenida</span><strong>15 días gratis.</strong><p>Primera mensualidad al <b>50%</b>. <br/>Desde la segunda, precio habitual.</p><small>Prueba con Control. Sin débito automático.</small></div>
      </aside>
      <section className="qt-signup-panel" aria-labelledby="qt-signup-title">
        <nav aria-label="Pasos del registro"><ol className="qt-signup-steps">{['Tu acceso', 'Restaurante y plan', 'Revisión'].map((label, i) => <li key={label} aria-current={step === i ? 'step' : undefined} className={step >= i ? 'is-reached' : ''}><span>{step > i ? <Check size={14}/> : i + 1}</span><b>{label}</b></li>)}</ol></nav>
        <p className="qt-signup-step-count text-base">Paso {step + 1} de 3</p>
        <h2 id="qt-signup-title" tabIndex={-1} ref={heading}>{titles[step]}</h2>
        <p className="qt-signup-intro text-base">{['Tu correo será tu acceso. Podrás revisar todo antes de crear la cuenta.', 'Configura lo esencial y elige el plan que quieres al terminar la prueba.', 'Revisa tus datos y conoce cuánto pagarías al continuar. Hoy no tienes que pagar.'][step]}</p>
        <form onSubmit={submit}>
          <fieldset disabled={loading}>
          {step === 0 && <>
            {google ? <div className="qt-signup-google"><strong>{google.googleName}</strong><span>{google.googleEmail || 'Verificando cuenta de Google…'}</span><button type="button" onClick={onClearGoogle}>Usar otro correo</button></div> : <><div className="qt-signup-google-button">{googleButton}</div><div className="qt-signup-divider">o continúa con tu correo</div>{field('email', 'Correo electrónico', { type: 'email', autoComplete: 'email', placeholder: 'tu@correo.com', maxLength: 254 })}</>}
            <div className="qt-signup-field"><span>WhatsApp de contacto <small>Opcional</small></span><WhatsappPhoneInput value={values.whatsappPhone} onChange={v => onChange('whatsappPhone', v)}/><small>Para contactar contigo sobre tu cuenta. Elige el país y escribe el número local.</small></div>
            <p className="qt-signup-privacy text-xs">Los datos del formulario se enviarán al confirmar el registro; Google verifica tu acceso al elegir esa opción. El borrador no se conserva al cerrar o recargar la página.</p>
          </>}
          {step === 1 && <>
            {field('restaurantName', 'Nombre del restaurante', { autoComplete: 'organization', maxLength: 120, placeholder: 'Ej. Casa Oliva' })}
            <div className="qt-signup-columns">{field('slug', 'Enlace del restaurante', { minLength: 3, maxLength: 60, pattern: '[a-z0-9]+(-[a-z0-9]+)*', placeholder: 'casa-oliva', autoComplete: 'off' })}<label className="qt-signup-field text-sm font-medium">Moneda de tus precios<select value={values.baseCurrency} onChange={e => onChange('baseCurrency', e.target.value)}><option value="USD">Dólares ($)</option><option value="EUR">Euros (€)</option></select></label></div>
            <p className="qt-signup-hint text-xs">Tu menú: quicktap.club/r/{values.slug || 'tu-restaurante'}. La conversión a Bs usa la tasa BCV.</p>
            {!google && <>
              {field('ownerName', 'Tu nombre', { autoComplete: 'name', maxLength: 120 })}
              {field('password', 'Contraseña', { type: 'password', minLength: 6, maxLength: 100, autoComplete: 'new-password', placeholder: 'Mínimo 6 caracteres' })}
              <div className="qt-signup-password-strength" data-level={strength.level}>
                <div role="meter" aria-label="Seguridad estimada de la contraseña" aria-valuemin={0} aria-valuemax={3} aria-valuenow={strength.level} aria-valuetext={strength.label}><span style={{width:`${strength.level / 3 * 100}%`}}/></div>
                <p aria-live="polite">Seguridad estimada: <strong>{strength.label}</strong></p>
                <small>Usa una frase larga y única. Combina palabras y evita nombres o secuencias fáciles de adivinar. Este indicador es orientativo.</small>
              </div>
              <label className="qt-signup-field text-sm font-medium">Confirmar contraseña<input required type="password" autoComplete="new-password" minLength={6} maxLength={100} value={passwordConfirmation} onChange={e=>{setPasswordConfirmation(e.target.value);setValidation('');}} aria-invalid={passwordConfirmation.length > 0 && !confirmed} aria-describedby="qt-password-match" placeholder="Repite tu contraseña"/></label>
              <p id="qt-password-match" className="qt-signup-password-match text-base" data-match={confirmed} aria-live="polite">{passwordConfirmation ? confirmed ? 'Las contraseñas coinciden.' : 'Las contraseñas todavía no coinciden.' : 'Escríbela de nuevo para confirmar.'}</p>
            </>}
            <fieldset className="qt-signup-plans"><legend>Tu plan después de la prueba</legend>{Object.entries(COMMERCIAL_PLANS).map(([id, p]) => <label key={id} className={plan === id ? 'is-selected' : ''}><input type="radio" name="plan" value={id} checked={plan === id} onChange={() => onPlanChange(id as CommercialPlan)}/><span><strong>{p.name}</strong><small>{p.outcome}</small></span><b>{money(p.monthly)}<small>/mes habitual</small></b></label>)}</fieldset>
            <details className="qt-signup-plan-details" key={plan}><summary>Qué incluye {offer.name}</summary><p>{PLAN_CONTENT.find(p => p.id === plan)?.capacity}</p><ul>{PLAN_CONTENT.find(p => p.id === plan)?.features.map(feature => <li key={feature}>{feature}</li>)}</ul></details>
            <p className="qt-signup-hint text-xs">Todos empiezan con 15 días de Control. Podrás cambiar de plan; servicios y adicionales se cotizan aparte.</p>
          </>}
          {step === 2 && <>
            <section className="qt-signup-review"><div><h3>Tu cuenta y restaurante</h3><button type="button" onClick={() => go(0)}>Editar acceso</button></div><dl><dt>Correo</dt><dd>{google?.googleEmail || values.email}</dd><dt>WhatsApp</dt><dd>{values.whatsappPhone ? `+${values.whatsappPhone}` : 'No indicado'}</dd><dt>Responsable</dt><dd>{google?.googleName || values.ownerName}</dd><dt>Restaurante</dt><dd>{values.restaurantName}</dd><dt>Enlace</dt><dd>quicktap.club/r/{values.slug}</dd><dt>Moneda del menú</dt><dd>{values.baseCurrency === 'USD' ? 'Dólares ($)' : 'Euros (€)'}</dd></dl><button type="button" onClick={() => go(1)}>Editar restaurante y plan</button></section>
            <section className="qt-signup-pricing"><h3>Tu comienzo con {offer.name}</h3><dl>
              <div><dt>15 días gratis con Control<small>Del {registrationDateLabel(paymentDates.start)} al {registrationDateLabel(paymentDates.first)}</small></dt><dd>0 €</dd></div>
              <div><dt>Primera mensualidad · 50%<small>Pago: {registrationDateLabel(paymentDates.first)}</small></dt><dd>{money(promotionalMonthly)}</dd></div>
              <div><dt>Desde la segunda mensualidad<small>Primer pago completo: {registrationDateLabel(paymentDates.second)}</small></dt><dd>{money(offer.monthly)}<small>cada 30 días</small></dd></div>
            </dl><p className="qt-signup-calendar-note text-xs">Fechas si te registras hoy y renuevas a tiempo. Cada mensualidad cubre 30 días; una aprobación posterior al vencimiento puede desplazar las siguientes fechas. No hay débito automático.</p></section>
            <RegistrationPromotionTerms/>
            <label className="qt-signup-accept text-sm font-medium"><input type="checkbox" required checked={accepted} onChange={e => setAccepted(e.target.checked)}/><span>Tengo capacidad para contratar y acepto los <a href="/legal#terminos" target="_blank" rel="noreferrer">términos del servicio</a>. He leído el <a href="/legal#privacidad" target="_blank" rel="noreferrer">aviso de privacidad</a>. Esto no autoriza el envío de promociones.</span></label>
            <p className="qt-signup-privacy text-xs">Al crear tu cuenta entrarás a la pasarela del plan elegido. Puedes empezar la prueba sin enviar un pago. Tus datos se usan para gestionar tu cuenta y avisos del servicio.</p>
          </>}
          {(error || validation) && <p className="qt-signup-error text-xs" role="alert">{validation || error}</p>}
          <div className="qt-signup-actions">{step > 0 && <button type="button" className="qt-signup-back" onClick={() => go(step - 1)}><ArrowLeft size={16}/>Atrás</button>}<button className="qt-signup-next" type="submit">{loading ? 'Un momento…' : step === 2 ? 'Crear cuenta y empezar gratis' : 'Continuar'}{!loading && <ArrowRight size={17}/>}</button></div>
          </fieldset>
        </form>
      </section>
    </div>
    <footer className="qt-signup-footer"><ShieldCheck size={14}/> Sin instalaciones · Sin tarjeta para empezar <Link to="/legal#privacidad">Privacidad</Link></footer>
  </main>;
}
