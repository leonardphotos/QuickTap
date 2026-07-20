import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useSpring, useTransform } from 'motion/react';
import { Banknote, SmartphoneNfc, MessageCircle, ChefHat, CircleDollarSign, Boxes, Clock } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import { PricingSection } from '@/components/landing/PricingSection';
import { IntroLoader } from '@/components/landing/IntroLoader';

/** Espejo en JS de --ease-out-strong (index.css): arranca rápido, se siente intencional. */
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const FEATURES = [
  {
    icon: Banknote,
    title: 'Precios en Bs automáticos',
    text: 'Coloca tus precios en $ o € y tus clientes ven el total en bolívares con la tasa BCV del día.',
    badge: 'bg-cyan-500/15 text-cyan-400',
  },
  {
    icon: SmartphoneNfc,
    title: 'Menú QRNFC al instante con un toque',
    text: 'Tus comensales escanean o acercan su teléfono al QR de su mesa y ven tu menú, sin apps ni descargas.',
    badge: 'bg-blue-500/15 text-blue-400',
  },
  {
    icon: MessageCircle,
    title: 'Delivery por WhatsApp',
    text: 'El cliente arma su pedido y lo envía directo al WhatsApp del negocio.',
    badge: 'bg-orange-500/15 text-orange-400',
  },
  {
    icon: ChefHat,
    title: 'Comandas directo a cocina',
    text: 'Cada pedido en mesa llega en tiempo real para poder visualizarlo en tu pantalla, tablet o teléfono.',
    badge: 'bg-violet-500/15 text-violet-400',
  },
  {
    icon: CircleDollarSign,
    title: 'Sistema administrativo',
    text: 'Historial de pedidos, propinas y reportes de ventas por producto, repartidor y método de pago.',
    badge: 'bg-emerald-500/15 text-emerald-400',
  },
  {
    icon: Boxes,
    title: 'Inventario por receta',
    text: 'Vincula insumos a cada producto y descuenta el stock automáticamente al vender.',
    badge: 'bg-amber-500/15 text-amber-400',
  },
  {
    icon: Clock,
    title: 'Cuentas pendientes por pagar',
    text: 'Deja la cuenta del cliente abierta con un toque y llévala organizada hasta que se cobre.',
    badge: 'bg-rose-500/15 text-rose-400',
  },
];

export default function LandingPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowIntro(false), 2100);
    return () => clearTimeout(t);
  }, []);

  const { scrollYProgress: heroProgress } = useScroll({
    container: scrollRef,
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  // El scroll crudo se siente mecánico (1:1 con el dedo/rueda, sin inercia).
  // Un spring de por medio le da al parallax un settle natural, con leve
  // "lag" físico en vez de seguir la posición de scroll al milímetro.
  const smoothHeroProgress = useSpring(heroProgress, { stiffness: 300, damping: 40, mass: 0.5 });

  const glowY = useTransform(smoothHeroProgress, [0, 1], ['0%', '30%']);
  const heroContentY = useTransform(smoothHeroProgress, [0, 1], [0, 90]);
  const heroContentOpacity = useTransform(smoothHeroProgress, [0, 1], [1, 0]);

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
              <a href="#precios" className="hidden sm:inline text-sm text-white/70 hover:text-white px-2 py-1.5">
                Precios
              </a>
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

        {/* Contenedor con scroll-snap: cada sección ocupa la pantalla completa al deslizar */}
        <div ref={scrollRef} className="h-screen overflow-y-scroll snap-y snap-mandatory scroll-smooth">
          {/* Hero: pantalla completa, fondo oscuro con resplandor radial (estilo cleanmyseo.com) y parallax */}
          <section ref={heroRef} className="relative h-screen snap-start overflow-hidden bg-brand-950">
            <motion.div
              aria-hidden
              style={{ y: glowY }}
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              <div
                className="absolute left-1/2 top-full w-[160%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-80"
                style={{
                  background: 'radial-gradient(circle, #0597f2 0%, #7c3aed 38%, #fb923c 62%, transparent 75%)',
                }}
              />
              <div
                className="absolute left-1/2 top-full w-[90%] aspect-square -translate-x-1/2 -translate-y-[35%] rounded-full blur-2xl opacity-60"
                style={{
                  background: 'radial-gradient(circle, #38bdf8 0%, #056cf2 45%, transparent 70%)',
                }}
              />
            </motion.div>

            <motion.div
              style={{ y: heroContentY, opacity: heroContentOpacity }}
              className="relative z-10 max-w-5xl mx-auto px-4 h-full flex flex-col items-center justify-center pt-14 text-center"
            >
              <p className="text-xs font-medium text-white/50 tracking-wide">
                Menú digital, comandas y delivery para restaurantes
              </p>
              <img
                src="/logo/quicktap-white.png"
                alt="QuickTap"
                className="w-56 sm:w-72 max-w-full h-auto mx-auto mt-5 mb-4"
              />
              <p className="mt-5 text-base text-white/60 max-w-2xl mx-auto font-light">
                Crea tu menú digital, genera los QR de tus mesas y recibe pedidos en cocina en tiempo real o directo
                por WhatsApp. Sin instalar nada.
              </p>
              <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link to="/admin/register" className="w-full sm:w-auto">
                  <TextureButton variant="brand" size="lg" className="sm:!w-auto px-2">
                    Regístrate y comienza gratis hoy
                  </TextureButton>
                </Link>
                <a href="#precios" className="w-full sm:w-auto">
                  <button className="w-full sm:w-auto rounded-full border border-white/20 text-white font-medium px-6 py-2.5 transition-[background-color,transform] duration-200 ease-out-strong hover:bg-white/10 active:scale-[0.97]">
                    Ver precios y planes
                  </button>
                </a>
              </div>
            </motion.div>
          </section>

          {/* Features: degradado que nace del hero oscuro y termina en blanco, para continuidad visual con la sección de precios */}
          <section className="min-h-screen snap-start flex items-center bg-gradient-to-b from-brand-950 via-brand-950 to-white">
            <div className="max-w-5xl mx-auto px-4 py-16 w-full">
              <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-10">¿Qué es QuickTap?</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {FEATURES.map((f) => (
                  <div
                    key={f.title}
                    className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 transition-[background-color,transform,box-shadow] duration-200 ease-out-strong hover:bg-white/[0.06] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${f.badge}`}>
                      <f.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-white font-semibold mb-1">{f.title}</h3>
                    <p className="text-sm text-white/50 font-light">{f.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Pricing */}
          <section id="precios" className="snap-start bg-white">
            <PricingSection />
          </section>

          {/* Footer CTA */}
          <footer className="snap-start border-t border-brand-950/10 bg-brand-950/[0.03]">
            <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src="/logo/icono.png" alt="" className="h-7 w-7" />
                <p className="text-sm text-brand-950/60 font-light">
                  © {new Date().getFullYear()} QuickTap.club — todo a un toque.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link to="/admin/login" className="text-sm text-brand-950/70 hover:text-brand-950">
                  Iniciar sesión
                </Link>
                <Link to="/admin/register">
                  <TextureButton variant="primary" size="sm" className="!w-auto px-1">
                    Regístrate y comienza gratis hoy
                  </TextureButton>
                </Link>
              </div>
            </div>
          </footer>
        </div>
      </motion.div>
    </>
  );
}
