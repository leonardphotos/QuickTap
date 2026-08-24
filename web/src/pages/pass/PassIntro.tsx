import { PASS_NAME, PASS_WORDMARK_URL } from './passBrand';

/**
 * Telón de entrada a QuickTap Pass.
 *
 * Se muestra mientras se piden los datos y al terminar se levanta dejando ver el panel ya
 * cargado — nunca se ve un panel vacío llenándose.
 *
 * Va en el mismo negro que la portada y el panel: el telón era blanco cuando el resto del
 * portal todavía no era oscuro, y así metía un destello blanco entre dos pantallas negras.
 *
 * `saliendo` lo enciende la pantalla cuando ya tiene los datos Y pasó el mínimo en pantalla:
 * sin ese mínimo, en una conexión rápida el logo alcanzaría a parpadear.
 *
 * OJO: quien lo monte tiene que dejarlo FUERA de cualquier contenedor con `transform` (por
 * ejemplo .pass-panel, que se anima al entrar). Un transform en un ancestro hace que este
 * `fixed inset-0` se posicione contra ese ancestro en vez de contra la ventana, y el logo
 * termina centrado respecto al alto completo del contenido — o sea, fuera de la vista.
 */
export function PassIntro({ saliendo }: { saliendo: boolean }) {
  return (
    <div
      // aria-hidden: es decorativo. Quien usa lector de pantalla escucha directamente el panel.
      aria-hidden
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#04070d] ${
        saliendo ? 'pass-intro--saliendo pointer-events-none' : ''
      }`}
    >
      <img src={PASS_WORDMARK_URL} alt={PASS_NAME} className="pass-intro-logo h-12 w-auto" />
    </div>
  );
}
