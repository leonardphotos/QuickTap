import { motion } from 'motion/react';

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
      <div className="relative h-24 w-24 flex items-center justify-center">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute h-20 w-20 rounded-full border border-brand-400/40"
            initial={{ scale: 0.8, opacity: 0.6 }}
            animate={{ scale: 2.1, opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.5, ease: EASE_OUT }}
          />
        ))}
        <motion.img
          src="/logo/icono-blanco.png"
          alt="QuickTap"
          className="relative h-14 w-14"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        />
      </div>
      <motion.p
        className="mt-6 text-xs font-medium text-white/50 tracking-wide"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3, ease: EASE_OUT }}
      >
        Cargando tu menú digital…
      </motion.p>
    </motion.div>
  );
}
