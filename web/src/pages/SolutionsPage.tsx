import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  QrCode,
  ChefHat,
  SplitSquareHorizontal,
  MessageCircle,
  Users,
  Boxes,
  BarChart3,
  Building2,
  ChevronDown,
  Check,
  Wallet,
  Bell,
  Palette,
  Tag,
  CalendarDays,
  Printer,
  Banknote,
  UserCog,
} from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';

/** Una de las 8 "vitrinas" grandes (headline + bullets + mini-mockup). */
interface Showcase {
  icon: typeof QrCode;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  mock: React.ReactNode;
}

/** Mini mockup: mesas con estado (libre/ocupada/por cobrar), estilo mapa de piso. */
function FloorMock() {
  const tables = [
    { n: 1, state: 'bg-emerald-100 text-emerald-700', label: 'Libre' },
    { n: 2, state: 'bg-amber-100 text-amber-700', label: 'Ocupada' },
    { n: 3, state: 'bg-rose-100 text-rose-700', label: 'Por cobrar' },
    { n: 4, state: 'bg-amber-100 text-amber-700', label: 'Ocupada' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {tables.map((t) => (
        <div key={t.n} className={`rounded-xl p-3 ${t.state}`}>
          <p className="text-xs font-semibold">Mesa {t.n}</p>
          <p className="text-[11px] opacity-70">{t.label}</p>
        </div>
      ))}
    </div>
  );
}

/** Mini mockup: comanda con estaciones de cocina. */
function KitchenMock() {
  const stations = [
    { name: 'Parrilla', items: ['2x Big Bite Clásica', '1x BBQ Bacon'] },
    { name: 'Bar', items: ['2x Refresco'] },
    { name: 'Postres', items: ['1x Brownie'] },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {stations.map((s) => (
        <div key={s.name} className="rounded-xl bg-brand-950/[0.04] p-2.5">
          <p className="text-[11px] font-semibold text-brand-950 mb-1.5">{s.name}</p>
          <div className="space-y-1">
            {s.items.map((it) => (
              <div key={it} className="rounded-lg bg-white px-2 py-1 text-[10px] text-brand-950/70 shadow-sm">
                {it}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mini mockup: una cuenta dividida en varias. */
function SplitMock() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-xl border border-brand-950/10 p-3 text-center">
        <p className="text-[10px] text-brand-950/40">Mesa 5</p>
        <p className="text-sm font-semibold text-brand-950">$42.80</p>
      </div>
      <span className="text-brand-950/30">→</span>
      <div className="flex gap-1.5">
        {['A', 'B', 'C'].map((l) => (
          <div key={l} className="rounded-lg bg-brand-500/10 px-2.5 py-2 text-center">
            <p className="text-[10px] text-brand-500 font-semibold">{l}</p>
            <p className="text-[10px] text-brand-950/60">$14.27</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mini mockup: chat de WhatsApp con el resumen del pedido. */
function WhatsappMock() {
  return (
    <div className="rounded-2xl bg-[#dcf8c6]/60 p-3 max-w-xs">
      <p className="text-[11px] text-brand-950/80 font-medium mb-1">🧾 NUEVO PEDIDO — Big Bite Burgers</p>
      <p className="text-[10px] text-brand-950/60">📍 Modalidad: Delivery</p>
      <p className="text-[10px] text-brand-950/60">• 2x Combo Big Bite — $19.80</p>
      <p className="text-[10px] text-brand-950/60">• 1x Refresco — $1.80</p>
      <p className="text-[10px] font-semibold text-brand-950 mt-1">Total: $21.60</p>
    </div>
  );
}

/** Mini mockup: kiosco de autoservicio + pantalla de números. */
function KioskMock() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 rounded-xl border border-brand-950/10 p-3">
        <p className="text-[10px] text-brand-950/40 mb-1">Autoservicio</p>
        <p className="text-xs font-semibold text-brand-950">Pantalla táctil para pedir</p>
      </div>
      <div className="rounded-xl bg-brand-950 p-3 text-center w-20">
        <p className="text-[9px] text-white/50">Listo</p>
        <p className="text-2xl font-bold text-white">07</p>
      </div>
    </div>
  );
}

/** Mini mockup: barra de stock con alerta. */
function InventoryMock() {
  const items = [
    { name: 'Carne de res', pct: 70, low: false },
    { name: 'Pan', pct: 18, low: true },
    { name: 'Queso cheddar', pct: 55, low: false },
  ];
  return (
    <div className="space-y-2.5">
      {items.map((i) => (
        <div key={i.name}>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-brand-950/70">{i.name}</span>
            {i.low && <span className="text-amber-600 font-medium">Bajo</span>}
          </div>
          <div className="h-1.5 rounded-full bg-brand-950/[0.08] overflow-hidden">
            <div
              className={`h-full rounded-full ${i.low ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${i.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mini mockup: tarjetas de reporte (ventas, margen). */
function ReportsMock() {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <div className="rounded-xl bg-brand-950/[0.04] p-3">
        <p className="text-[10px] text-brand-950/40">Ventas del mes</p>
        <p className="text-base font-bold text-brand-950">$8,420</p>
      </div>
      <div className="rounded-xl bg-emerald-50 p-3">
        <p className="text-[10px] text-emerald-700/70">Utilidad</p>
        <p className="text-base font-bold text-emerald-700">+$2,150</p>
      </div>
    </div>
  );
}

/** Mini mockup: mapa de sucursales consolidado. */
function BranchesMock() {
  const branches = ['Centro', 'Este', 'Oeste'];
  return (
    <div className="space-y-2">
      {branches.map((b) => (
        <div key={b} className="flex items-center justify-between rounded-xl border border-brand-950/10 px-3 py-2">
          <span className="flex items-center gap-2 text-xs text-brand-950/70">
            <Building2 className="h-3.5 w-3.5 text-brand-500" /> Sucursal {b}
          </span>
          <span className="text-xs font-semibold text-brand-950">${(1200 + b.length * 340).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

const SHOWCASES: Showcase[] = [
  {
    icon: QrCode,
    eyebrow: 'Menú digital',
    title: 'Tu menú, en el bolsillo de cada cliente',
    description:
      'Cada mesa tiene su propio QR (o NFC): el cliente escanea o acerca el teléfono y ve tu menú completo, con fotos, variantes y modificadores — sin instalar nada.',
    bullets: [
      'Precios en $ o € convertidos automáticamente a bolívares con la tasa BCV del día',
      'Variantes (tamaños) y modificadores (extras, sin cebolla, punto de cocción) con límites configurables',
      'Colores, logo y banner del menú 100% personalizables',
    ],
    mock: <FloorMock />,
  },
  {
    icon: ChefHat,
    eyebrow: 'Cocina en vivo',
    title: 'El pedido llega solo a cocina',
    description:
      'Cada comanda se reparte automáticamente por estación (parrilla, bar, postres...) y se imprime sola en la impresora térmica correcta, sin que nadie tenga que gritarla.',
    bullets: [
      'Pantalla de cocina en tiempo real, por estación o consolidada',
      'Impresión automática: cocina, barra o caja — cada ticket a su impresora',
      'Los pedidos que carga el propio mesero/cajero entran directo; los del cliente esperan un toque de aceptación',
    ],
    mock: <KitchenMock />,
  },
  {
    icon: SplitSquareHorizontal,
    eyebrow: 'Cobros flexibles',
    title: 'Una mesa, tantas cuentas como haga falta',
    description:
      'Divide la cuenta por persona o por ítems, acepta el método de pago que uses (efectivo en $ o Bs, tarjeta, pago móvil, Zelle, Binance, transferencia) y deja cuentas pendientes por cobrar sin perderlas de vista.',
    bullets: [
      'Pago fraccionado por ítems o por porcentaje',
      'Varias cuentas abiertas en la misma mesa al mismo tiempo',
      'Apertura y cierre de caja con resumen congelado (no se desactualiza después)',
    ],
    mock: <SplitMock />,
  },
  {
    icon: MessageCircle,
    eyebrow: 'Delivery y pickup',
    title: 'El pedido llega directo a tu WhatsApp',
    description:
      'Sin apps de terceros ni comisiones: el cliente arma su carrito, elige delivery o pickup, y el pedido llega armado (con dirección y ubicación) directo al WhatsApp del negocio.',
    bullets: [
      'Zonas de entrega por polígono en el mapa, o tarifa automática por distancia',
      'Despacho a repartidores propios desde el panel',
      'Ubicación en vivo del cliente (botón "usar mi ubicación actual")',
    ],
    mock: <WhatsappMock />,
  },
  {
    icon: Users,
    eyebrow: 'Autoservicio',
    title: 'Kiosco de autoservicio + pantalla de números',
    description:
      'Monta una tablet en modo kiosco para que el cliente pida y pague solo, y una pantalla junto al mostrador que avisa el número cuando su pedido está listo — como en el fast-food.',
    bullets: [
      'Rol "Comanda": pantalla completa, tema con los colores de tu marca, precios en $ y Bs',
      'Rol "Número": solo lectura, avisa en grande cuando el pedido está listo',
      'El pedido de autoservicio espera confirmación de pago antes de pasar a cocina',
    ],
    mock: <KioskMock />,
  },
  {
    icon: Boxes,
    eyebrow: 'Inventario',
    title: 'El stock se descuenta solo, con cada venta',
    description:
      'Vincula los insumos a la receta de cada producto y QuickTap descuenta el inventario automáticamente al servir — con alertas en tiempo real cuando algo está por agotarse.',
    bullets: [
      'Costeo por receta (automático) o manual, producto por producto',
      'Alertas de stock bajo en vivo, sin recargar la pantalla',
      'Lista de insumos imprimible para el proveedor',
    ],
    mock: <InventoryMock />,
  },
  {
    icon: BarChart3,
    eyebrow: 'Administración',
    title: 'Toda la caja del negocio, en un solo lugar',
    description:
      'Ventas por mesero, margen de utilidad por producto, gastos con proveedor, y el historial completo de cada cobro — para saber exactamente qué está pasando con tu plata.',
    bullets: [
      'Reportes de ventas semanales/mensuales con drill-down hasta el recibo',
      'Margen de utilidad automático (receta o costo manual) por producto',
      'Módulo de gastos con categoría y proveedor',
    ],
    mock: <ReportsMock />,
  },
  {
    icon: Building2,
    eyebrow: 'Multi-sucursal',
    title: 'Todas tus sedes, un solo panel',
    description:
      'Si tienes más de un local, ves el reporte consolidado de ventas, inventario, productos más vendidos y utilidad de todas tus sucursales sin tener que entrar sede por sede.',
    bullets: [
      'Cada sucursal con su propio catálogo, inventario y equipo',
      'Ventas por sucursal con historial de pedidos y desglose por método de pago',
      'Cambia de sede sin cerrar sesión',
    ],
    mock: <BranchesMock />,
  },
];

const SUPPORTING = [
  { icon: Wallet, title: 'Cuentas por cobrar', text: 'Deja la cuenta abierta con un toque y llévala organizada hasta que se cobre.' },
  { icon: Bell, title: 'Alertas en vivo', text: 'Stock bajo, pedidos nuevos y comandas listas avisan al instante, sin recargar.' },
  { icon: Palette, title: 'Menú a tu marca', text: 'Colores, logo, banner y portada — el menú público se ve como tu restaurante, no como una plantilla.' },
  { icon: Tag, title: 'Códigos promocionales', text: 'Crea descuentos y compártelos con tus clientes desde el panel.' },
  { icon: CalendarDays, title: 'Reservas', text: 'Tus clientes reservan mesa directo desde el menú público.' },
  { icon: Printer, title: 'Estación de impresión', text: 'Convierte cualquier computador en terminal de impresión de comandas y recibos.' },
  { icon: Banknote, title: 'Tasa BCV automática', text: 'Precios en $/€ mostrados en bolívares con la tasa oficial, actualizada varias veces al día.' },
  { icon: UserCog, title: 'Roles del equipo', text: 'Dueño, Admin, Cajero, Mesero, Cocina, Pantalla — cada quien ve solo lo que le corresponde.' },
];

const FAQ = [
  {
    q: '¿Necesito instalar algo?',
    a: 'No. El menú lo escanean desde la cámara del teléfono, y el panel del restaurante funciona desde cualquier navegador — en una tablet, computador o celular.',
  },
  {
    q: '¿Funciona con impresoras térmicas?',
    a: 'Sí. La Estación de Impresión convierte cualquier computador en terminal de impresión: cada comanda se manda sola a la impresora de su estación (cocina, barra, caja).',
  },
  {
    q: '¿Puedo tener varias sucursales?',
    a: 'Sí, con el Plan Sucursales. Cada sede tiene su propio catálogo, inventario y equipo, y ves el reporte consolidado de todas desde un solo panel.',
  },
  {
    q: '¿Cómo llegan los pedidos de delivery?',
    a: 'El cliente arma su pedido en el menú público y lo envía directo al WhatsApp de tu negocio, ya armado con el detalle, la dirección y el total — sin apps de terceros ni comisiones por pedido.',
  },
  {
    q: '¿Puedo probarlo antes de pagar?',
    a: 'Sí — hay un restaurante de demostración abierto para explorar todo el sistema en vivo, y un período de prueba gratis al crear tu cuenta.',
  },
];

export default function SolutionsPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="text-brand-950">
      {/* Nav flotante, igual al de la Landing */}
      <header className="fixed top-4 inset-x-0 z-30 px-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 rounded-full bg-brand-950/80 backdrop-blur-md border border-white/10 shadow-lg shadow-brand-950/30 px-4 py-2">
          <Link to="/">
            <img src="/logo/icono-blanco.png" alt="QuickTap" className="h-7 w-7" />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link to="/#precios" className="hidden sm:inline text-sm text-white/70 hover:text-white px-2 py-1.5">
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

      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-950 pt-32 pb-20 px-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div
            className="absolute left-1/2 top-0 w-[140%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-60"
            style={{ background: 'radial-gradient(circle, #0597f2 0%, #7c3aed 38%, #fb923c 62%, transparent 75%)' }}
          />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <p className="text-xs font-medium text-white/50 tracking-wide">Todo lo que hace QuickTap</p>
          <h1 className="mt-4 text-3xl sm:text-5xl font-bold text-white">Del QR de la mesa a la caja del mes. En un toque.</h1>
          <p className="mt-5 text-base text-white/60 max-w-xl mx-auto font-light">
            QuickTap conecta tu menú, tus comandas, tu cobro, tu delivery y tu inventario en un solo sistema — para que
            dejes de operar tu restaurante desde cinco herramientas distintas.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/admin/register" className="w-full sm:w-auto">
              <TextureButton variant="brand" size="lg" className="sm:!w-auto">
                Regístrate y comienza gratis hoy
              </TextureButton>
            </Link>
            <a href="/r/demo" className="w-full sm:w-auto">
              <button className="w-full sm:w-auto rounded-full border border-white/20 text-white font-medium px-6 py-2.5 transition-colors hover:bg-white/10 active:scale-[0.97]">
                Ver restaurante de demostración
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* Vitrinas grandes: alternando texto izq/der con el mockup */}
      <section className="bg-white py-16 sm:py-24 px-4">
        <div className="max-w-5xl mx-auto space-y-20 sm:space-y-28">
          {SHOWCASES.map((s, i) => (
            <div
              key={s.title}
              className={`grid md:grid-cols-2 gap-10 items-center ${i % 2 === 1 ? 'md:[&>*:first-child]:order-2' : ''}`}
            >
              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-500 uppercase tracking-wide">
                  <s.icon className="h-4 w-4" /> {s.eyebrow}
                </span>
                <h2 className="mt-3 text-2xl sm:text-3xl font-bold text-brand-950">{s.title}</h2>
                <p className="mt-3 text-brand-950/60 font-light">{s.description}</p>
                <ul className="mt-5 space-y-2.5">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm text-brand-950/70">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl border border-brand-950/[0.06] bg-brand-950/[0.02] p-6 shadow-[0_20px_50px_-24px_rgba(0,27,67,0.25)]">
                {s.mock}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Grid de features secundarias */}
      <section className="bg-brand-950/[0.02] py-16 sm:py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-brand-950 text-center mb-10">Y también incluye</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SUPPORTING.map((f) => (
              <div key={f.title} className="rounded-2xl border border-brand-950/[0.06] bg-white p-5">
                <div className="w-10 h-10 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center mb-3">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-brand-950 font-semibold text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-brand-950/50 font-light">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-16 sm:py-20 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-brand-950 text-center mb-10">Preguntas frecuentes</h2>
          <div className="space-y-2">
            {FAQ.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q} className="rounded-2xl border border-brand-950/[0.06] overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-brand-950/[0.02]"
                  >
                    <span className="text-sm font-medium text-brand-950">{item.q}</span>
                    <ChevronDown className={`h-4 w-4 text-brand-950/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && <p className="px-5 pb-4 text-sm text-brand-950/60 font-light">{item.a}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-brand-950 py-20 px-4 text-center">
        <h2 className="text-2xl sm:text-4xl font-bold text-white">Prueba QuickTap gratis hoy</h2>
        <p className="mt-3 text-white/60 font-light max-w-md mx-auto">
          Crea tu cuenta, arma tu menú y genera el primer QR en minutos.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/admin/register" className="w-full sm:w-auto">
            <TextureButton variant="brand" size="lg" className="sm:!w-auto">
              Regístrate y comienza gratis hoy
            </TextureButton>
          </Link>
          <Link to="/#precios" className="w-full sm:w-auto">
            <button className="w-full sm:w-auto rounded-full border border-white/20 text-white font-medium px-6 py-2.5 transition-colors hover:bg-white/10 active:scale-[0.97]">
              Ver precios y planes
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-brand-950/10 bg-white">
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
              <TextureButton variant="primary" size="sm" className="!w-auto">
                Regístrate y comienza gratis hoy
              </TextureButton>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
