import { useEffect } from 'react';

/**
 * Enciende el tema oscuro del Dashboard maestro mientras la pantalla esté montada.
 *
 * La clase va en <html> y no en el contenedor del maestro porque los diálogos y menús se montan
 * en un portal, fuera de ese árbol: sin esto se abrirían blancos encima del panel oscuro.
 *
 * Se apaga al desmontar para no dejar en tinieblas el panel del restaurante, que comparte las
 * mismas variables de color (ver .master-oscuro en index.css).
 */
export function useMasterTheme() {
  useEffect(() => {
    document.documentElement.classList.add('master-oscuro');
    return () => document.documentElement.classList.remove('master-oscuro');
  }, []);
}
