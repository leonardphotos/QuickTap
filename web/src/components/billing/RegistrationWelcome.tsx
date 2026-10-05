import './registration-welcome.css';

export function RegistrationWelcome({ onContinue }: { onContinue: () => void }) {
  return <section className="qr-offer" aria-label="Promoción de bienvenida">
    <p className="qr-offer-label text-base">Promoción de bienvenida</p>
    <h1>Tu restaurante.<br/>Un gran comienzo.</h1>
    <p className="qr-offer-lead text-base">Empieza con QuickTap y crece a tu ritmo.</p>
    <div className="qr-free-days"><strong>15</strong><p><span>días</span> gratis.</p></div>
    <div className="qr-offer-months">
      <div><h2>Primera<br/>mensualidad</h2><p className="qr-offer-amount">50<span>%</span></p><p>del precio del plan</p></div>
      <div><h2>Desde la segunda</h2><p className="qr-offer-amount">100<span>%</span></p><p>del precio habitual</p></div>
    </div>
    <button type="button" onClick={onContinue} className="qr-register">Registrar mi local</button>
  </section>;
}

export function RegistrationPromotionTerms() {
  return <p className="qr-offer-terms text-xs">Las mensualidades comienzan después de los 15 días gratis. Aplica a cuentas nuevas en Esencial, Operación y Control. Adicionales y servicios aparte. No hay débito automático de la membresía. Puedes solicitar la no renovación en soporte@quicktap.club. <a href="/legal#terminos" target="_blank" rel="noreferrer">Ver condiciones</a> · <a href="/legal#privacidad" target="_blank" rel="noreferrer">Privacidad</a>.</p>;
}
