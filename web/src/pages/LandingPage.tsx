import { Link } from 'react-router-dom';

const FEATURES = [
  {
    icon: '📱',
    title: 'Menú QR al instante',
    text: 'Tus comensales escanean el código de su mesa y ven tu menú, sin apps ni descargas.',
  },
  {
    icon: '🍳',
    title: 'Comandas directo a cocina',
    text: 'Cada pedido en mesa llega en tiempo real a la cola de cocina, listo para imprimir.',
  },
  {
    icon: '📲',
    title: 'Delivery por WhatsApp',
    text: 'El cliente arma su pedido y lo envía formateado directo al WhatsApp del negocio.',
  },
  {
    icon: '💱',
    title: 'Precios en Bs automáticos',
    text: 'Coloca tus precios en $ o € y tus clientes ven el total en bolívares con la tasa BCV del día.',
  },
];

interface Plan {
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  highlighted?: boolean;
  cta: string;
}

const PLANS: Plan[] = [
  {
    name: 'Gratis',
    price: '$0',
    period: '/mes',
    tagline: 'Para empezar y probar QuickTap sin compromiso.',
    features: ['1 restaurante', 'Hasta 20 pedidos/mes', 'Menú QR ilimitado', 'Checkout por WhatsApp'],
    cta: 'Comenzar gratis',
  },
  {
    name: 'Pro',
    price: '$19',
    period: '/mes',
    tagline: 'Para restaurantes con flujo de pedidos constante.',
    features: [
      'Pedidos ilimitados',
      'Cola de cocina en tiempo real',
      'Mesas y QR ilimitados',
      'Soporte por correo',
    ],
    highlighted: true,
    cta: 'Empezar prueba Pro',
  },
  {
    name: 'Premium',
    price: '$49',
    period: '/mes',
    tagline: 'Para cadenas y negocios con varias sucursales.',
    features: ['Todo lo de Pro', 'Multi-sucursal', 'Reportes avanzados', 'Soporte prioritario'],
    cta: 'Hablar con ventas',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-brand-950">
      {/* Nav */}
      <header className="border-b border-brand-950/10 sticky top-0 bg-white/90 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <span className="font-semibold text-lg tracking-tight">
            Quick<span className="text-brand-500">Tap</span>
          </span>
          <nav className="flex items-center gap-2 sm:gap-4">
            <a href="#precios" className="hidden sm:inline text-sm text-brand-950/70 hover:text-brand-950">
              Precios y planes
            </a>
            <Link to="/admin/login" className="text-sm font-medium text-brand-950/80 hover:text-brand-950 px-3 py-2">
              Iniciar sesión
            </Link>
            <Link
              to="/admin/register"
              className="text-sm font-medium bg-brand-950 text-white rounded-lg px-4 py-2 hover:bg-brand-900"
            >
              Regístrate y comienza gratis hoy
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 py-20 text-center">
        <span className="inline-block text-xs font-medium text-brand-900 bg-brand-400/10 rounded-full px-3 py-1 mb-4">
          Menú digital, comandas y delivery para restaurantes
        </span>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
          QuickTap: tu restaurante, <span className="text-brand-500">todo a un toque.</span>
        </h1>
        <p className="mt-5 text-lg text-brand-950/70 max-w-2xl mx-auto font-light">
          Crea tu menú digital, genera los QR de tus mesas y recibe pedidos en cocina en tiempo real o directo por
          WhatsApp. Sin instalar nada.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/admin/register"
            className="w-full sm:w-auto bg-brand-500 text-white font-medium rounded-lg px-6 py-3 hover:bg-brand-800"
          >
            Regístrate y comienza gratis hoy
          </Link>
          <a
            href="#precios"
            className="w-full sm:w-auto border border-brand-950/20 font-medium rounded-lg px-6 py-3 hover:bg-brand-400/5"
          >
            Ver precios y planes
          </a>
          <Link
            to="/admin/login"
            className="w-full sm:w-auto text-brand-950/70 font-medium px-6 py-3 hover:text-brand-950"
          >
            Iniciar sesión
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-brand-950/[0.03] border-y border-brand-950/10">
        <div className="max-w-5xl mx-auto px-4 py-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white border border-brand-950/10 rounded-xl p-5">
              <p className="text-3xl mb-2">{f.icon}</p>
              <p className="font-medium text-brand-950">{f.title}</p>
              <p className="text-sm text-brand-950/60 mt-1 font-light">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="precios" className="max-w-5xl mx-auto px-4 py-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-semibold">Precios y planes</h2>
          <p className="text-brand-950/60 mt-2 font-light">Elige el plan que se ajuste al tamaño de tu restaurante.</p>
          <p className="text-xs text-amber-600 mt-1">
            * Precios de ejemplo, sujetos a ajuste antes del lanzamiento.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-6 flex flex-col ${
                plan.highlighted ? 'border-brand-500 ring-2 ring-brand-400/15 relative' : 'border-brand-950/15'
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                  Más popular
                </span>
              )}
              <p className="font-semibold text-lg">{plan.name}</p>
              <p className="text-sm text-brand-950/60 mt-1 font-light">{plan.tagline}</p>
              <p className="mt-4">
                <span className="text-3xl font-semibold">{plan.price}</span>
                <span className="text-brand-950/60">{plan.period}</span>
              </p>
              <ul className="mt-5 space-y-2 text-sm text-brand-950/70 flex-1 font-light">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-brand-500">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/admin/register"
                className={`mt-6 text-center rounded-lg px-4 py-2.5 text-sm font-medium ${
                  plan.highlighted
                    ? 'bg-brand-500 text-white hover:bg-brand-800'
                    : 'bg-brand-950 text-white hover:bg-brand-900'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="border-t border-brand-950/10 bg-brand-950/[0.03]">
        <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-brand-950/60 font-light">
            © {new Date().getFullYear()} QuickTap.club — todo a un toque.
          </p>
          <div className="flex items-center gap-3">
            <Link to="/admin/login" className="text-sm text-brand-950/70 hover:text-brand-950">
              Iniciar sesión
            </Link>
            <Link
              to="/admin/register"
              className="text-sm font-medium bg-brand-950 text-white rounded-lg px-4 py-2 hover:bg-brand-900"
            >
              Regístrate y comienza gratis hoy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
