/** Efectos de sonido de QuickTap Shop — una sola instancia de Audio por sonido, reseteando
 * currentTime antes de cada reproducción para que se pueda disparar rápido y repetido (ej.
 * escanear varios códigos seguidos) sin esperar a que termine la reproducción anterior. */
const scannerAudio = new Audio('/sounds/scaner.mp3');
const cashAudio = new Audio('/sounds/caja.mp3');

export function playScannerSound() {
  scannerAudio.currentTime = 0;
  scannerAudio.play().catch(() => {});
}

export function playCashSound() {
  cashAudio.currentTime = 0;
  cashAudio.play().catch(() => {});
}
