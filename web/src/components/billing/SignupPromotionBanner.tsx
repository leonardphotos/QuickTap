import { Gift, Sparkles } from 'lucide-react';
import './signup-promotion.css';

export const SIGNUP_PROMOTION_VERSION = 'WELCOME_15D_1M_HALF_20261005';

export function signupDiscountedMonths(version?: string | null) { return version === SIGNUP_PROMOTION_VERSION ? 1 : version === 'WELCOME_15D_2M_HALF_20261003' ? 2 : 0; }

/** Calendario expresado en mensualidades pagadas, después de la prueba gratuita. */
export function SignupPromotionBanner({ remainingMonths, totalMonths = 1 }: { remainingMonths?: number; totalMonths?: number }) {
  return <aside className="qt-signup-offer" aria-label="Promoción de bienvenida">
    <span className="qt-signup-offer-badge"><Gift size={13}/> PROMOCIÓN DE BIENVENIDA</span>
    <h2>{remainingMonths === undefined ? 'Empieza gratis. Crece a tu ritmo.' : 'Tu bienvenida tiene beneficios.'}</h2>
    <p>{remainingMonths === undefined ? 'Conoce QuickTap y comienza a trabajar con tu restaurante.' : `Te queda${remainingMonths === 1 ? '' : 'n'} ${remainingMonths} mensualidad${remainingMonths === 1 ? '' : 'es'} con el 50% de descuento en tu plan.`}</p>
    <ol>
      <li><span>AL REGISTRARTE</span><strong>15 <small>días</small></strong><p>Gratis</p></li>
      <li><span>{totalMonths === 2 ? 'MENSUALIDADES 1 Y 2' : 'PRIMERA MENSUALIDAD'}</span><strong>50<small>%</small></strong><p>Del precio del plan</p></li>
      <li><span>{totalMonths === 2 ? 'DESDE LA TERCERA' : 'DESDE LA SEGUNDA'}</span><strong>100<small>%</small></strong><p>Precio habitual</p></li>
    </ol>
    <div className="qt-signup-offer-note"><Sparkles size={14}/><span>Las mensualidades empiezan después de los 15 días gratis. Aplica a cuentas nuevas en Esencial, Operación y Control; adicionales y servicios aparte.</span></div>
  </aside>;
}

export interface SignupPromotionQuote {
  discountedMonths: number; coveredMonths: number; fullMonthly: number;
  promotionalMonthly: number; discountAmount: number; remainingAfterPayment: number;
}
export function SignupPromotionPrice({ promotion, symbol = '€' }: { promotion: SignupPromotionQuote; symbol?: string }) {
  return <div className="qt-signup-price" role="status"><strong>Tu descuento de bienvenida está aplicado</strong>
    <p>{promotion.discountedMonths} mensualidad{promotion.discountedMonths === 1 ? '' : 'es'} del plan a <b>{symbol}{promotion.promotionalMonthly.toFixed(2)}</b> en este pago. Precio habitual: {symbol}{promotion.fullMonthly.toFixed(2)} al mes.</p>
    {promotion.coveredMonths > promotion.discountedMonths && <p>Las otras {promotion.coveredMonths - promotion.discountedMonths} mensualidades del ciclo se cobran a la tarifa correspondiente.</p>}
    <small>Los adicionales se suman por separado. Los descuentos no se acumulan: si tienes un cupón mayor, aplicamos el más favorable. Al agotar tus mensualidades promocionales corresponde el precio habitual del plan.</small>
  </div>;
}
