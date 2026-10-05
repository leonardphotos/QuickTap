import { motion } from 'motion/react';
import KineticDotsLoader from '@/components/ui/kinetic-dots-loader';

/** Espejo en JS de --ease-out-strong (index.css): arranca rápido, se siente intencional. */
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

/** Splash de carga que antecede a la landing: mismo fondo que el hero para un cruce sin parpadeos. */
export function IntroLoader() {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-brand-950"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <KineticDotsLoader />
      <motion.p
        className="-mt-2 text-xs font-medium text-white/50 tracking-wide"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3, ease: EASE_OUT }}
      >
        Estamos casi listos
      </motion.p>
    </motion.div>
  );
}
