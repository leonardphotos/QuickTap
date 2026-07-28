import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react';
import {
  ChevronDown,
  ChevronRight,
  Check,
  QrCode,
  ChefHat,
  SplitSquareHorizontal,
  MessageCircle,
  Users,
  Boxes,
  BarChart3,
  Building2,
  Wallet,
  Bell,
  Palette,
  Tag,
  CalendarDays,
  Printer,
  Banknote,
  UserCog,
  Crown,
  ShieldCheck,
  Wallet as WalletIcon,
  Grid2x2,
  Monitor,
  ShoppingBag,
  ShoppingCart,
  Hash,
  ScanLine,
  CreditCard,
} from 'lucide-react';
import { IntroLoader } from '@/components/landing/IntroLoader';
import { GradientWave } from '@/components/ui/gradient-wave';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';

/** Espejo en JS de --ease-out-strong (index.css): arranca rápido, se siente intencional. */
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

/** Capa con parallax: se traslada a distinta velocidad que el scroll de la página, según su propio recorrido por el viewport. */
function ParallaxLayer({
  children,
  offset = 50,
  className,
}: {
  children: ReactNode;
  offset?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [offset, -offset]);
  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}

/** Aparición con fundido + desplazamiento al entrar en el viewport (acompaña el parallax en el resto de bloques). */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Un rol del restaurante de demostración: entra directo con la cuenta de ese rol. */
interface DemoRole {
  icon: typeof Crown;
  role: string;
  email: string;
  label: string;
  description: string;
}

const RESTAURANT_DEMO_PASSWORD = 'Demo1234';
const RESTAURANT_DEMO_SLUG = 'demo';

const DEMO_ROLES: DemoRole[] = [
  { icon: Crown, role: 'OWNER', email: 'demo@quicktap.club', label: 'Dueño', description: 'Ve todo el negocio: caja, reportes, sucursales.' },
  { icon: ShieldCheck, role: 'ADMIN', email: 'admin.demo@quicktap.club', label: 'Administrador', description: 'Administración, inventario, equipo, catálogo.' },
  { icon: WalletIcon, role: 'CASHIER', email: 'cajero.demo@quicktap.club', label: 'Cajero', description: 'Cobros, caja del día, pedidos de delivery.' },
  { icon: Grid2x2, role: 'WAITER', email: 'mesero.demo@quicktap.club', label: 'Mesero', description: 'Toma pedidos y cobra en las mesas asignadas.' },
  { icon: ChefHat, role: 'KITCHEN', email: 'cocina.demo@quicktap.club', label: 'Cocina', description: 'Cola de comandas en vivo, por estación.' },
  { icon: Monitor, role: 'SCREEN', email: 'pantalla.demo@quicktap.club', label: 'Pantalla', description: 'Vista de TV: mesas + cocina en horizontal.' },
  { icon: ShoppingBag, role: 'COMANDA', email: 'comanda.demo@quicktap.club', label: 'Autoservicio', description: 'Kiosco: el cliente pide y paga solo.' },
  { icon: Hash, role: 'NUMERO', email: 'numero.demo@quicktap.club', label: 'Número', description: 'Pantalla de "pedido listo" junto al mostrador.' },
];

/** Local de demostración de QuickTap Shop ("Urbana Store") — mismo mecanismo que el restaurante
 * de arriba, pero con los 3 roles que existen del lado de Shop. */
const SHOP_DEMO_PASSWORD = 'UrbanaDemo2026';
const SHOP_DEMO_SLUG = 'urbana-store';

const SHOP_DEMO_ROLES: DemoRole[] = [
  { icon: Crown, role: 'OWNER', email: 'duena@urbanastore.club', label: 'Dueña', description: 'Ve todo el negocio: ventas, inventario, ingresos por método de pago.' },
  { icon: ShieldCheck, role: 'ADMIN', email: 'admin@urbanastore.club', label: 'Administrador', description: 'Inventario, productos, equipo y catálogo.' },
  { icon: WalletIcon, role: 'CASHIER', email: 'caja@urbanastore.club', label: 'Cajera', description: 'Cobra en el punto de venta y abre/cierra caja.' },
];

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
    { n: 4, state: 'bg-fuchsia-100 text-fuchsia-700', label: 'Reservada' },
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

/** Mini mockup: QR de Pago Móvil real (el que sube el negocio) + monto en Bs + tasa del día,
 * todo en una sola pantalla — igual a como se ve en la pantalla de cobro de QuickTap Shop. */
function ShopQrPaymentMock() {
  return (
    <div className="flex items-center gap-4">
      <img
        src="/images/qr-pago-movil-ejemplo.png"
        alt="Ejemplo de QR de Pago Móvil subido por el negocio"
        className="h-24 w-24 shrink-0 rounded-xl border border-brand-950/10 object-contain bg-white p-1"
      />
      <div className="min-w-0">
        <p className="text-[10px] text-brand-950/40">Monto a cancelar</p>
        <p className="text-lg font-bold text-emerald-600 leading-tight">Bs 61.133,30</p>
        <p className="text-[10px] text-brand-950/50">$82.30 × Bs742.81 (tasa del día)</p>
      </div>
    </div>
  );
}

/** Mini mockup: barra de stock con alerta, catálogo de tienda en vez de insumos de cocina. */
function ShopInventoryMock() {
  const items = [
    { name: 'Camiseta Básica Blanca', pct: 62, low: false },
    { name: 'Jean Slim Fit Negro', pct: 12, low: true },
    { name: 'Zapatilla Runner Blanca', pct: 40, low: false },
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

/** Mini mockup: carrito flotante de Venta (Shop) con cantidad de items y total en $/Bs. */
function ShopCartMock() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-brand-950/10 px-3 py-2">
        <span className="text-xs text-brand-950/70">2x Camiseta Básica Blanca</span>
        <span className="text-xs font-semibold text-brand-950">$25.00</span>
      </div>
      <div className="flex items-center gap-2 rounded-full bg-brand-500 text-white px-4 py-2.5 w-fit shadow-lg shadow-brand-500/30">
        <ShoppingCart className="h-4 w-4" />
        <span className="text-xs font-bold">3 items · $61.00 · Bs 45.320</span>
      </div>
    </div>
  );
}

/** Mini mockup: chips de métodos de pago aceptados en Venta (Shop). */
function ShopPaymentMock() {
  const methods = ['Efectivo Bs', 'Efectivo $', 'Pago Móvil', 'Zelle', 'Binance'];
  return (
    <div className="flex flex-wrap gap-2">
      {methods.map((m) => (
        <span key={m} className="rounded-full bg-brand-950/[0.04] px-3 py-1.5 text-[11px] font-medium text-brand-950/70">
          {m}
        </span>
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

const SHOP_SHOWCASES: Showcase[] = [
  {
    icon: QrCode,
    eyebrow: 'Punto Pago',
    title: 'Sube tu QR una sola vez, cobra Pago Móvil sin salir de QuickTap',
    description:
      'Sube la imagen de tu QR de Pago Móvil (el de tu banco, Suiche 7B o el que ya uses) una sola vez desde Ajustes. Desde ese momento, cada vez que cobras, QuickTap te muestra ese QR junto con el monto exacto en bolívares y la tasa BCV del día — todo en una sola pantalla, sin cambiar de app ni sacar la calculadora.',
    bullets: [
      'El QR se sube una sola vez; QuickTap lo reutiliza en cada cobro por Pago Móvil',
      'El monto en bolívares y la tasa del día se calculan solos, en la misma pantalla del QR',
      'El cliente escanea y paga, tú confirmas con el número de referencia — sin apps de terceros ni cambiar de pantalla',
    ],
    mock: <ShopQrPaymentMock />,
  },
  {
    icon: ShoppingBag,
    eyebrow: 'Inventario',
    title: 'Cada producto con su foto, variantes y stock',
    description:
      'Registra tu catálogo con foto obligatoria, variantes de talla y color (o un stock básico si el producto no las necesita), y deja que QuickTap te avise antes de que algo se agote o venza.',
    bullets: [
      'Foto obligatoria al crear un producto — el catálogo se ve como una tienda real, no una lista',
      'Variantes (talla × color) o stock básico si el producto no maneja variantes',
      'Alertas de stock bajo y productos próximos a vencer, en vivo',
    ],
    mock: <ShopInventoryMock />,
  },
  {
    icon: ScanLine,
    eyebrow: 'Punto de venta',
    title: 'Cobra en segundos, con o sin lector de código de barras',
    description:
      'Escanea con la cámara del celular o un lector USB/Bluetooth, y un carrito flotante te muestra la cantidad de productos y el total en $ y en bolívares mientras sigues recorriendo el catálogo.',
    bullets: [
      'Escaneo con cámara o lector físico — el producto entra solo al carrito',
      'Carrito flotante con el total en $ y Bs, siempre a la vista en el celular',
      'Precio mayorista y promocional automáticos según la cantidad',
    ],
    mock: <ShopCartMock />,
  },
  {
    icon: CreditCard,
    eyebrow: 'Métodos de pago',
    title: 'Acepta como te paguen: Bs, $, Pago Móvil, Zelle, Binance',
    description:
      'Cada venta se registra en la moneda real del pago — bolívares para Pago Móvil o efectivo en Bs, dólares para efectivo, Zelle o Binance — y puedes dejar cuentas fiadas, completas o con abono.',
    bullets: [
      'Ventas fiadas: pago completo pendiente o abono parcial ahora',
      'Caja: apertura, cierre y arqueo, con historial de informes',
      'Animación y sonido de confirmación en cada pago registrado',
    ],
    mock: <ShopPaymentMock />,
  },
  {
    icon: BarChart3,
    eyebrow: 'Panel administrativo',
    title: 'Ingresos por método de pago, margen y alertas, todo junto',
    description:
      'Ve cuánto entró por cada método de pago, el margen de utilidad de cada producto y los productos más vendidos del día, sin salir del panel.',
    bullets: [
      'Ingresos por método de pago — hoy y últimos 30 días',
      'Margen de utilidad automático por producto',
      'Egresos e ingresos manuales, con categoría',
    ],
    mock: <ReportsMock />,
  },
];

const SHOP_SUPPORTING = [
  { icon: Wallet, title: 'Ventas fiadas', text: 'Pago completo pendiente o abono parcial — el saldo queda siempre a la vista.' },
  { icon: Bell, title: 'Alertas en vivo', text: 'Stock bajo y productos por vencer avisan al instante, sin recargar.' },
  { icon: Tag, title: 'Precio mayorista y promo', text: 'Se aplican solos según la cantidad en el carrito — no hay que cambiar precios a mano.' },
  { icon: Banknote, title: 'Tasa BCV automática', text: 'Cada producto muestra su precio en $ y en bolívares, actualizado varias veces al día.' },
  { icon: UserCog, title: 'Roles del equipo', text: 'Dueño, Administrador y Cajero — cada quien entra con su cuenta y ve solo lo que le corresponde.' },
  { icon: Users, title: 'Directorio de clientes', text: 'Historial de compras por cliente, para fidelizar y dar seguimiento.' },
  { icon: CalendarDays, title: 'Vencimientos', text: 'Alerta antes de que un producto perecedero caduque.' },
  { icon: ScanLine, title: 'Escaneo flexible', text: 'Cámara del celular o lector USB/Bluetooth — lo que ya tengas en el mostrador.' },
];

const SHOP_FAQ = [
  {
    q: '¿Qué tipo de negocios pueden usar QuickTap Shop?',
    a: 'Cualquier tienda con inventario por unidades: ropa, calzado, ferretería, farmacia y más — eliges el rubro al registrarte.',
  },
  {
    q: '¿Necesito un lector de código de barras?',
    a: 'No. La cámara del celular escanea igual; el lector USB/Bluetooth es opcional para ir más rápido en el mostrador.',
  },
  {
    q: '¿Cómo registro una venta fiada?',
    a: 'Eliges "Fiado" al cobrar: pago completo pendiente o un abono ahora, y el resto queda registrado como deuda con el cliente.',
  },
  {
    q: '¿Puedo ver cuánto entró en efectivo vs. Pago Móvil?',
    a: '"Ingresos por método de pago" desglosa cada venta según cómo se cobró, en la moneda correspondiente — hoy y en los últimos 30 días.',
  },
  {
    q: '¿Puedo probarlo antes de pagar?',
    a: 'Sí — hay un local de demostración ("Urbana Store") abierto para explorar todo el sistema en vivo, y un período de prueba gratis al crear tu cuenta.',
  },
];

export default function LandingPage() {
  const [showIntro, setShowIntro] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [demoOpen, setDemoOpen] = useState(false);
  const [enteringRole, setEnteringRole] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [vertical, setVertical] = useState<'restaurant' | 'shop'>('restaurant');
  const { login } = useAuth();
  const navigate = useNavigate();

  // Contenido de toda la página desde acá para abajo depende del toggle Restaurantes / Locales
  // Comerciales — mismo componente, dos catálogos de contenido en paralelo.
  const isShop = vertical === 'shop';
  const activeShowcases = isShop ? SHOP_SHOWCASES : SHOWCASES;
  const activeSupporting = isShop ? SHOP_SUPPORTING : SUPPORTING;
  const activeFaq = isShop ? SHOP_FAQ : FAQ;
  const activeDemoRoles = isShop ? SHOP_DEMO_ROLES : DEMO_ROLES;
  const heroContent = isShop
    ? {
        eyebrow: 'QuickTap Shop',
        title: 'Del inventario al cierre de caja. En un toque.',
        description:
          'QuickTap Shop conecta tu catálogo, tu punto de venta, tus métodos de pago y tu inventario en un solo sistema — para tiendas de ropa, calzado, ferretería, farmacia y más.',
        cta: 'Ver local de demostración',
      }
    : {
        eyebrow: 'Todo lo que hace QuickTap',
        title: 'Del QR de la mesa a la caja del mes. En un toque.',
        description:
          'QuickTap conecta tu menú, tus comandas, tu cobro, tu delivery y tu inventario en un solo sistema — para que dejes de operar tu restaurante desde cinco herramientas distintas.',
        cta: 'Ver restaurante de demostración',
      };

  // Parallax del hero: el logo se retira más rápido que el scroll de la página,
  // creando sensación de profundidad al pasar a la primera sección de contenido.
  const { scrollY } = useScroll();
  const heroLogoY = useTransform(scrollY, [0, 800], [0, -220]);
  const heroLogoOpacity = useTransform(scrollY, [0, 500], [1, 0.15]);

  useEffect(() => {
    const t = setTimeout(() => setShowIntro(false), 2100);
    return () => clearTimeout(t);
  }, []);

  async function enterDemoAs(demoRole: DemoRole) {
    setEnteringRole(demoRole.role);
    setDemoError(null);
    try {
      const password = isShop ? SHOP_DEMO_PASSWORD : RESTAURANT_DEMO_PASSWORD;
      const slug = isShop ? SHOP_DEMO_SLUG : RESTAURANT_DEMO_SLUG;
      await login(demoRole.email, password, slug);
      setDemoOpen(false);
      navigate('/admin');
    } catch {
      setDemoError('No se pudo entrar a la demostración. Intenta de nuevo.');
    } finally {
      setEnteringRole(null);
    }
  }

  return (
    <>
      <AnimatePresence>{showIntro && <IntroLoader key="intro-loader" />}</AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showIntro ? 0 : 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="text-brand-950"
      >
        {/* Nav flotante, estilo "cult-seo": pastilla oscura translúcida sobre el hero */}
        <header className="fixed top-4 inset-x-0 z-30 px-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 rounded-full bg-brand-950/80 backdrop-blur-md border border-white/10 shadow-lg shadow-brand-950/30 px-4 py-2">
            <img src="/logo/icono-blanco.png" alt="QuickTap" className="h-7 w-7" />
            <nav className="flex items-center gap-1 sm:gap-2">
              <Link to="/planes" className="hidden sm:inline text-sm text-white/70 hover:text-white px-2 py-1.5">
                Ver planes
              </Link>
              <Link to="/admin/login" className="text-sm text-white/70 hover:text-white px-2 py-1.5">
                Iniciar sesión
              </Link>
              <Link
                to="/empezar"
                className="text-sm font-medium bg-white text-brand-950 rounded-full px-3 py-1.5 hover:bg-white/90"
              >
                Regístrate
              </Link>
            </nav>
          </div>
        </header>

        {/* Tarjeta única a pantalla completa, fondo de onda animada, sin texto: solo invita a deslizar */}
        <section className="relative h-screen overflow-hidden bg-white">
          <GradientWave />

          {/* Logo centrado en toda la sección, con parallax: se retira más rápido que el scroll */}
          <motion.div
            style={{ y: heroLogoY, opacity: heroLogoOpacity }}
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
          >
            <img src="/logo/quicktap-white.png" alt="QuickTap" className="w-36 sm:w-52 h-auto mix-blend-difference" />
          </motion.div>

          {/* Animación de "desliza para ver más" — invita a hacer scroll sin ningún texto */}
          <div className="absolute bottom-10 inset-x-0 z-10 flex justify-center pointer-events-none">
            <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
              <ChevronDown className="h-8 w-8 text-white mix-blend-difference" />
            </motion.div>
          </div>
        </section>

        {/* Hero secundario: presentación general (antes en /soluciones) */}
        <section className="relative bg-white min-h-screen flex items-center px-4 pt-24 pb-12">
          <Reveal className="relative z-10 max-w-3xl mx-auto text-center">
            {/* Toggle Restaurantes / Locales Comerciales: todo el contenido de acá para abajo
                (vitrinas, features, FAQ y el demo) cambia según cuál esté activo. */}
            <div className="inline-flex items-center gap-1 rounded-full border border-brand-950/10 bg-brand-950/[0.03] p-1 mb-6">
              <button
                type="button"
                onClick={() => setVertical('restaurant')}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  !isShop ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950/80'
                }`}
              >
                Restaurantes
              </button>
              <button
                type="button"
                onClick={() => setVertical('shop')}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  isShop ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950/80'
                }`}
              >
                Locales Comerciales
              </button>
            </div>
            <p className="text-xs font-medium text-brand-950/40 tracking-wide">{heroContent.eyebrow}</p>
            <h1 className="mt-4 text-3xl sm:text-5xl font-bold text-brand-950">{heroContent.title}</h1>
            <p className="mt-5 text-base text-brand-950/60 max-w-xl mx-auto font-light">{heroContent.description}</p>
            <div className="mt-8 flex items-center justify-center">
              <TextureButton variant="brand" size="lg" className="sm:!w-auto" onClick={() => setDemoOpen(true)}>
                {heroContent.cta}
              </TextureButton>
            </div>
          </Reveal>
        </section>

        {/* Vitrinas grandes: alternando texto izq/der con el mockup, cada mockup con parallax propio */}
        <section className="bg-white py-16 sm:py-24 px-4 overflow-hidden">
          <div className="max-w-5xl mx-auto space-y-20 sm:space-y-28">
            {activeShowcases.map((s, i) => (
              <div
                key={s.title}
                className={`grid md:grid-cols-2 gap-10 items-center ${i % 2 === 1 ? 'md:[&>*:first-child]:order-2' : ''}`}
              >
                <Reveal>
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
                </Reveal>
                <ParallaxLayer
                  offset={i % 2 === 0 ? 40 : -40}
                  className="rounded-3xl border border-brand-950/[0.06] bg-brand-950/[0.02] p-6 shadow-[0_20px_50px_-24px_rgba(0,27,67,0.25)]"
                >
                  {s.mock}
                </ParallaxLayer>
              </div>
            ))}
          </div>
        </section>

        {/* Grid de features secundarias */}
        <section className="bg-brand-950/[0.02] py-16 sm:py-20 px-4">
          <div className="max-w-5xl mx-auto">
            <Reveal>
              <h2 className="text-2xl sm:text-3xl font-bold text-brand-950 text-center mb-10">Y también incluye</h2>
            </Reveal>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {activeSupporting.map((f, i) => (
                <Reveal key={f.title} delay={(i % 4) * 0.06} className="rounded-2xl border border-brand-950/[0.06] bg-white p-5">
                  <div className="w-10 h-10 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center mb-3">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-brand-950 font-semibold text-sm mb-1">{f.title}</h3>
                  <p className="text-xs text-brand-950/50 font-light">{f.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-white py-16 sm:py-20 px-4">
          <div className="max-w-2xl mx-auto">
            <Reveal>
              <h2 className="text-2xl sm:text-3xl font-bold text-brand-950 text-center mb-10">Preguntas frecuentes</h2>
            </Reveal>
            <div className="space-y-2">
              {activeFaq.map((item, i) => {
                const open = openFaq === i;
                return (
                  <Reveal key={item.q} delay={(i % 5) * 0.05} className="rounded-2xl border border-brand-950/[0.06] overflow-hidden">
                    <button
                      onClick={() => setOpenFaq(open ? null : i)}
                      className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-brand-950/[0.02]"
                    >
                      <span className="text-sm font-medium text-brand-950">{item.q}</span>
                      <ChevronDown className={`h-4 w-4 text-brand-950/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && <p className="px-5 pb-4 text-sm text-brand-950/60 font-light">{item.a}</p>}
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="bg-white py-20 px-4 text-center border-t border-brand-950/[0.06]">
          <Reveal>
            <h2 className="text-2xl sm:text-4xl font-bold text-brand-950">Prueba QuickTap gratis hoy</h2>
            <p className="mt-3 text-brand-950/60 font-light max-w-md mx-auto">
              Crea tu cuenta, arma tu menú y genera el primer QR en minutos.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/empezar" className="w-full sm:w-auto">
                <TextureButton variant="brand" size="lg" className="sm:!w-auto">
                  Regístrate y comienza gratis hoy
                </TextureButton>
              </Link>
              <Link to="/planes" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto rounded-full border border-brand-950/15 text-brand-950 font-medium px-6 py-2.5 transition-colors hover:bg-brand-950/5 active:scale-[0.97]">
                  Ver precios y planes
                </button>
              </Link>
            </div>
          </Reveal>
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
              <Link to="/empezar">
                <TextureButton variant="primary" size="sm" className="!w-auto">
                  Regístrate y comienza gratis hoy
                </TextureButton>
              </Link>
            </div>
          </div>
        </footer>

        {/* Selector de rol para entrar al restaurante de demostración */}
        <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>¿Con qué rol quieres entrar?</DialogTitle>
              <p className="text-sm text-brand-950/50 font-light">
                Cada rol ve una parte distinta de QuickTap — entra con el que quieras probar.
              </p>
            </DialogHeader>
            {demoError && <p className="text-sm text-red-600">{demoError}</p>}
            <div className="grid sm:grid-cols-2 gap-2.5">
              {activeDemoRoles.map((r) => (
                <button
                  key={r.role}
                  onClick={() => enterDemoAs(r)}
                  disabled={enteringRole !== null}
                  className="flex items-start gap-3 rounded-2xl border border-brand-950/[0.08] p-4 text-left transition-colors hover:bg-brand-950/[0.03] disabled:opacity-50"
                >
                  <div className="w-9 h-9 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center shrink-0">
                    <r.icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-brand-950">{r.label}</p>
                    <p className="text-xs text-brand-950/50 font-light mt-0.5">{r.description}</p>
                  </div>
                  {enteringRole === r.role ? (
                    <span className="text-xs text-brand-950/40 shrink-0 self-center">Entrando…</span>
                  ) : (
                    <ChevronRight className="h-4 w-4 text-brand-950/30 shrink-0 self-center" />
                  )}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </>
  );
}
