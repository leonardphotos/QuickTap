import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { IntroLoader } from '@/components/landing/IntroLoader';

/** Espejo en JS de --ease-out-strong (index.css): arranca rápido, se siente intencional. */
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export default function LandingPage() {
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowIntro(false), 2100);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <AnimatePresence>{showIntro && <IntroLoader key="intro-loader" />}</AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showIntro ? 0 : 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="h-screen overflow-hidden bg-white text-brand-950"
      >
        {/* Nav flotante, estilo "cult-seo": pastilla oscura translúcida sobre el hero */}
        <header className="fixed top-4 inset-x-0 z-30 px-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 rounded-full bg-brand-950/80 backdrop-blur-md border border-white/10 shadow-lg shadow-brand-950/30 px-4 py-2">
            <img src="/logo/icono-blanco.png" alt="QuickTap" className="h-7 w-7" />
            <nav className="flex items-center gap-1 sm:gap-2">
              <Link to="/soluciones" className="hidden sm:inline text-sm text-white/70 hover:text-white px-2 py-1.5">
                Todo lo que hace
              </Link>
              <Link to="/planes" className="hidden sm:inline text-sm text-white/70 hover:text-white px-2 py-1.5">
                Precios
              </Link>
              <Link to="/admin/login" className="text-sm text-white/70 hover:text-white px-2 py-1.5">
                Iniciar sesión
              </Link>
              <Link
                to="/admin/register"
                className="text-sm font-medium bg-white text-brand-950 rounded-full px-3 py-1.5 hover:bg-white/90"
              >
                Regístrate
              </Link>
            </nav>
          </div>
        </header>

        {/* Tarjeta única a pantalla completa (estilo Apple: foto de fondo en blanco por ahora, sin scroll) */}
        <section className="relative h-screen flex flex-col items-center justify-center px-4 text-center bg-white">
          <p className="text-xs font-medium text-brand-950/40 tracking-wide">QuickTap</p>
          <h1 className="mt-4 text-4xl sm:text-5xl font-bold text-brand-950">Todo a un toque.</h1>
          <p className="mt-3 text-base text-brand-950/60 max-w-md mx-auto font-light">
            Menú digital, comandas en tiempo real y delivery por WhatsApp para tu restaurante.
          </p>

          <div className="mt-10 w-full max-w-xs flex flex-col gap-3">
            <Link to="/soluciones" className="w-full">
              <button className="w-full flex items-center justify-center gap-2 rounded-full bg-brand-950 text-white font-medium px-6 py-3 transition-transform duration-200 ease-out-strong hover:opacity-90 active:scale-[0.97]">
                Conoce sobre QuickTap
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            <Link to="/planes" className="w-full">
              <button className="w-full rounded-full border border-brand-950/15 text-brand-950 font-medium px-6 py-3 transition-colors hover:bg-brand-950/5 active:scale-[0.97]">
                Ver planes
              </button>
            </Link>
          </div>
        </section>
      </motion.div>
    </>
  );
}
