import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { IntroLoader } from '@/components/landing/IntroLoader';
import { GradientWave } from '@/components/ui/gradient-wave';

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
        className="h-screen overflow-hidden text-brand-950"
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

        {/* Tarjeta única a pantalla completa, fondo de onda animada, contenido abajo a la izquierda */}
        <section className="relative h-screen overflow-hidden bg-white">
          <GradientWave />

          {/* Logo centrado en toda la sección */}
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <img src="/logo/quicktap-white.png" alt="QuickTap" className="w-48 sm:w-64 h-auto mix-blend-difference" />
          </div>

          <div className="relative z-10 h-screen flex flex-col items-start justify-end px-6 sm:px-12 pb-16 sm:pb-20 text-left">
            {/* Texto blanco + mix-blend-difference: invierte solo (negro sobre blanco, blanco sobre azul) siguiendo el fondo animado */}
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white mix-blend-difference">
              Todo a un toque.
            </h1>
            <p className="mt-3 text-base sm:text-lg text-white max-w-md font-light mix-blend-difference">
              Menú digital, comandas en tiempo real y delivery por WhatsApp para tu restaurante.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-start gap-4 sm:gap-8">
              <Link
                to="/soluciones"
                className="group flex items-center gap-1.5 text-base font-medium text-white mix-blend-difference transition-opacity hover:opacity-70"
              >
                Conoce sobre QuickTap
                <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out-strong group-hover:translate-x-1" />
              </Link>
              <Link
                to="/planes"
                className="text-base font-medium text-white mix-blend-difference transition-opacity opacity-70 hover:opacity-100"
              >
                Ver planes
              </Link>
            </div>
          </div>
        </section>
      </motion.div>
    </>
  );
}
