import { PASS_LOGO_URL, PASS_NAME } from './passBrand';

/**
 * Telón de entrada a QuickTap Pass.
 *
 * El panel del cliente es oscuro y suele abrirse desde un enlace del negocio, así que sin
 * transición la pantalla salta de blanco a negro de golpe. Acá el logo aparece chico y
 * centrado sobre blanco mientras se piden los datos, y al terminar el telón se levanta
 * dejando ver el panel ya cargado — nunca se ve un panel vacío llenándose.
 *
 * `saliendo` lo enciende la pantalla cuando ya tiene los datos Y pasó el mínimo en pantalla:
 * sin ese mínimo, en una conexión rápida el logo alcanzaría a parpadear.
 */
export function PassIntro({ saliendo }: { saliendo: boolean }) {
  return (
    <div
      // aria-hidden: es decorativo. Quien usa lector de pantalla escucha directamente el panel.
      aria-hidden
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-white ${
        saliendo ? 'pass-intro--saliendo pointer-events-none' : ''
      }`}
    >
      <img src={PASS_LOGO_URL} alt="" className="pass-intro-logo h-12 w-auto" />
      <p className="pass-intro-label mt-2.5 text-[11px] font-semibold uppercase text-brand-950">
        {PASS_NAME.replace('QuickTap ', '')}
      </p>
    </div>
  );
}
