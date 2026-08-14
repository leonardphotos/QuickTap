import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Coffee,
  Menu,
  Trophy,
  UtensilsCrossed,
  X,
  Check,
  QrCode,
  ChefHat,
  SplitSquareHorizontal,
  MessageCircle,
  Bot,
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
  Hash,
  ScanLine,
  CreditCard,
  Tablet,
} from 'lucide-react';
import { IntroLoader } from '@/components/landing/IntroLoader';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';

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

/** Club de demostración de QuickTap Canchas ("Canchas Demo") — siempre listo para mostrar:
 * cualquier horario se puede reservar, el código de verificación acepta cualquier número de
 * 4 dígitos y el QR de la tablet arranca una partida de 1 minuto (ver refreshClubDemo/backend). */
const CLUB_DEMO_PASSWORD = 'Demo1234';
const CLUB_DEMO_SLUG = 'demo-canchas';

const CLUB_DEMO_ROLES: DemoRole[] = [
  { icon: Crown, role: 'OWNER', email: 'demo@canchas.club', label: 'Dueño', description: 'Ve todo el club: caja, reservas, canchas y jugadores.' },
  { icon: Tablet, role: 'CANCHA', email: 'cancha@canchas.club', label: 'Tablet de cancha', description: 'El kiosco que el jugador escanea para pedir y pagar desde la cancha.' },
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

/** Mini mockup: secuencia de mensajes automáticos del chatbot (bienvenida -> cobro -> confirmación).
 * Sigue siendo un mockup ilustrativo (no una captura real) porque el mensaje se manda por WhatsApp,
 * fuera de la app — y el bot de la demo no está vinculado a un número real. */
function ChatbotMock() {
  const bubbles = [
    '¡Hola! 👋 Bienvenido a Big Bite Burgers. Puedes ver el menú y pedir aquí: quicktap.club/r/bigbite',
    '💳 Total a pagar: Bs 8.372,71 ($11.21) — Pago Móvil: Banesco, 0424-1234567, V-12345678',
    '✅ Tu pago fue confirmado. ¡Tu pedido #42 ya está en proceso!',
  ];
  return (
    <div className="space-y-1.5 max-w-xs">
      {bubbles.map((b, i) => (
        <div key={i} className="rounded-2xl bg-[#dcf8c6]/60 px-3 py-2">
          <p className="text-[10px] text-brand-950/70 leading-snug">{b}</p>
        </div>
      ))}
    </div>
  );
}

/** Marco de celular simple (CSS puro) para mostrar una captura real de la app dentro de una
 * vitrina, en vez de un mockup abstracto — más creíble para una captura de pantalla real. */
function PhoneMockup({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative mx-auto w-[190px] rounded-[1.75rem] border-[5px] border-brand-950 bg-brand-950 shadow-[0_24px_50px_-20px_rgba(0,27,67,0.5)]">
      <div className="absolute top-0 inset-x-0 z-10 flex justify-center pt-1">
        <div className="h-3.5 w-16 rounded-full bg-brand-950" />
      </div>
      <div className="overflow-hidden rounded-[1.35rem] aspect-[9/19.5] bg-white">
        <img src={src} alt={alt} className="h-full w-full object-cover object-top" />
      </div>
    </div>
  );
}

/** Captura real de la pantalla de cobro por Pago Móvil de QuickTap Shop — con el QR que subió el
 * negocio, el monto en Bs y la tasa del día, todo en una sola pantalla. */
function ShopQrPaymentMock() {
  return <PhoneMockup src="/images/punto-pago-captura.jpg" alt="Pantalla de cobro por Pago Móvil de QuickTap Shop, con QR, monto en Bs y tasa del día" />;
}

/** Marco de tablet horizontal (CSS puro), para las capturas reales de la tablet de cancha —
 * mismo criterio que PhoneMockup, pero apaisado. */
function TabletMockup({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative mx-auto w-full max-w-md rounded-2xl border-[6px] border-brand-950 bg-brand-950 shadow-[0_24px_50px_-20px_rgba(0,27,67,0.5)]">
      <div className="overflow-hidden rounded-lg aspect-[2360/1400] bg-white">
        <img src={src} alt={alt} className="h-full w-full object-cover object-top" />
      </div>
    </div>
  );
}

/** Tarjeta simple para una captura real que ya trae su propia forma (un diálogo, una pantalla
 * de escritorio) — sin bezel de dispositivo, solo el marco que usan el resto de vitrinas. */
function ScreenshotCard({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="mx-auto w-full overflow-hidden rounded-2xl border border-brand-950/10 shadow-[0_20px_50px_-24px_rgba(0,27,67,0.35)]">
      <img src={src} alt={alt} className="h-auto w-full" />
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
    mock: (
      <PhoneMockup
        src="/images/restaurant-menu-allgrill-captura.jpg"
        alt="Menú digital real de All Grill Chirikayen, visto desde el teléfono al escanear el QR de la mesa"
      />
    ),
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
    mock: (
      <ScreenshotCard
        src="/images/restaurant-cocina-captura.jpg"
        alt="Cola de cocina en vivo de Big Bite Burgers, con las comandas reales entrando por mesa, delivery y pickup"
      />
    ),
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
    mock: (
      <ScreenshotCard
        src="/images/restaurant-cobros-captura.jpg"
        alt="Diálogo real de pago fraccionado de una mesa, con método de pago, referencia y monto a abonar"
      />
    ),
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
    mock: (
      <PhoneMockup
        src="/images/restaurant-delivery-captura.jpg"
        alt="Checkout de delivery real de All Grill Chirikayen, con el envío calculado por zona y el botón para enviar el pedido por WhatsApp"
      />
    ),
  },
  {
    icon: Bot,
    eyebrow: 'Chatbot de WhatsApp',
    title: 'Un chatbot que cobra y confirma el pedido por ti',
    description:
      'Vincula el WhatsApp del negocio (como un dispositivo más, sin apps externas ni comisiones) y deja que el chatbot atienda cada conversación de principio a fin: saluda al cliente, le manda los datos exactos para pagar, revisa el comprobante contigo y manda el pedido a cocina solo cuando el pago quedó confirmado.',
    bullets: [
      'Responde con el menú apenas alguien te escribe por primera vez, sin que nadie del equipo tenga que contestar',
      'Apenas se crea el pedido, manda el monto exacto y los datos de cobro (Pago Móvil, Zelle, Binance, PayPal o Transferencia) según el método elegido',
      'El cliente responde con la foto del comprobante — el chatbot se la reenvía a tu número de confianza para que la apruebes o la rechaces',
      'Al aprobarla, el pedido pasa solo de pendiente a cocina — nadie del equipo tiene que aceptar nada a mano',
      'Si rechazas el comprobante, le pide al cliente reenviarlo; si no respondes a tiempo, te avisa en el panel para que lo revises',
      'Avisa automáticamente "pedido recibido", "listo para retirar" y "va en camino" en cada paso, desde el WhatsApp del propio negocio',
    ],
    mock: <ChatbotMock />,
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
    mock: (
      <ScreenshotCard
        src="/images/restaurant-autoservicio-captura.jpg"
        alt="Kiosco de autoservicio real, con el catálogo del restaurante listo para que el cliente pida solo"
      />
    ),
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
    mock: (
      <ScreenshotCard
        src="/images/restaurant-inventario-captura.jpg"
        alt="Alertas de inventario reales: insumos por agotarse en Big Bite Burgers, con su stock y mínimo"
      />
    ),
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
    mock: (
      <ScreenshotCard
        src="/images/restaurant-administracion-captura.jpg"
        alt="Panel de Administración real de Big Bite Burgers, con el balance del día y el detalle de ventas"
      />
    ),
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
    mock: (
      <ScreenshotCard
        src="/images/restaurant-sucursales-captura.jpg"
        alt="Panel de Sucursales real, con las 3 sedes de Big Bite Burgers y el reporte consolidado de ventas"
      />
    ),
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
    mock: (
      <ScreenshotCard
        src="/images/shop-inventario-captura.jpg"
        alt="Inventario real de Urbana Store, con SKU, categoría, ubicación en tienda, precio y stock por producto"
      />
    ),
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
    mock: (
      <ScreenshotCard
        src="/images/shop-venta-captura.jpg"
        alt="Punto de venta real de Urbana Store, con el catálogo y el carrito con el total en $ y Bs"
      />
    ),
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
    mock: (
      <ScreenshotCard
        src="/images/shop-pagos-captura.jpg"
        alt="Selector real de método de pago al cobrar en Urbana Store: Efectivo Bs, Efectivo $, Pago Móvil y Zelle"
      />
    ),
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
    mock: (
      <ScreenshotCard
        src="/images/shop-panel-captura.jpg"
        alt="Panel administrativo real de Urbana Store, con ventas, utilidad y gastos de los últimos 30 días"
      />
    ),
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

const CLUB_SHOWCASES: Showcase[] = [
  {
    icon: CalendarDays,
    eyebrow: 'Reservas',
    title: 'El jugador reserva solo, tú ves la cancha llena',
    description:
      'Comparte el enlace de tu club: el jugador elige cancha, día y hora, ve el precio de cada franja (con recargo en hora pico) y confirma con un código que llega por WhatsApp — sin llamadas ni grupos para coordinar horarios.',
    bullets: [
      'Calendario en vivo por cancha, con la hora pico marcada aparte',
      'Confirmación por código de WhatsApp — sin reservas fantasma',
      'Torneos Americano/Mexicano: se piden los nombres de los jugadores al reservar',
    ],
    mock: (
      <PhoneMockup
        src="/images/canchas-reservas-captura.jpg"
        alt="Calendario de reservas de QuickTap Canchas, con los turnos libres y de hora pico de cada cancha"
      />
    ),
  },
  {
    icon: QrCode,
    eyebrow: 'Control de acceso',
    title: 'Un QR abre la cancha, nadie más',
    description:
      'Cada reserva genera un QR de acceso único: el jugador lo escanea en la tablet de su cancha y ahí arranca el cronómetro de su turno — sin que recepción tenga que estar pendiente de quién llegó.',
    bullets: [
      'El QR solo abre SU cancha, en SU horario — nunca la de otra reserva',
      'Cuenta regresiva en vivo, visible desde la cancha',
      'Llave maestra para recepción, por si el QR no escanea',
    ],
    mock: (
      <TabletMockup
        src="/images/canchas-acceso-captura.jpg"
        alt="Tablet de la cancha con el nombre del jugador y la cuenta regresiva de su partida"
      />
    ),
  },
  {
    icon: ShoppingBag,
    eyebrow: 'Tablet de cancha',
    title: 'El jugador pide desde la cancha, sin levantarse',
    description:
      'Desde la misma tablet, el jugador pide a la tienda del club (o a hasta 4 negocios vinculados) y todo se suma a su cuenta — cada tienda cobra lo suyo, con su propio método de pago.',
    bullets: [
      'Hasta 4 tiendas vinculadas, cada una con su icono en la tablet',
      'Cada tienda ve la comanda como "Pedido desde Cancha X"',
      'La cuenta se separa sola: cancha + tienda propia vs. cada tienda vinculada',
    ],
    mock: (
      <TabletMockup
        src="/images/canchas-tienda-captura.jpg"
        alt="Selector de tiendas en la tablet de la cancha: la tienda del club y las tiendas vinculadas"
      />
    ),
  },
  {
    icon: CreditCard,
    eyebrow: 'Cobro',
    title: 'Paga desde la cancha: completo o dividido entre todos',
    description:
      'Al terminar, cada jugador ve su cuenta con el QR de pago móvil de quien cobra, reporta su referencia y listo — sin que nadie tenga que pasar por caja a hacer fila.',
    bullets: [
      'Pago completo o dividido entre los jugadores que llegaron',
      'El QR y el monto en Bs son de quien cobra esa cuenta: cancha o tienda',
      'El saldo baja solo al confirmar la referencia — nunca antes',
    ],
    mock: (
      <ScreenshotCard
        src="/images/canchas-cobro-captura.jpg"
        alt="Pantalla de pago desde la tablet de cancha, con el monto en bolívares y los datos de transferencia del cobrador"
      />
    ),
  },
  {
    icon: BarChart3,
    eyebrow: 'Panel administrativo',
    title: 'Ocupación, ingresos y quién debe, todo junto',
    description:
      'Ve qué tan llenas están tus canchas por hora, cuánto entró por cada método de pago y quién tiene cuenta pendiente, sin salir del panel.',
    bullets: [
      'Ocupación por cancha y por franja horaria',
      'Lista negra automática a quien falta sin avisar',
      'Fidelización: puntos por reserva, canjeables por el jugador',
    ],
    mock: (
      <ScreenshotCard
        src="/images/canchas-panel-captura.jpg"
        alt="Panel de Administración de QuickTap Canchas con los ingresos del día y las deudas de clientes"
      />
    ),
  },
];

const CLUB_SUPPORTING = [
  { icon: CalendarDays, title: 'Reserva en línea', text: 'El jugador reserva sin llamar, con confirmación por WhatsApp.' },
  { icon: QrCode, title: 'Acceso por QR', text: 'La reserva abre la cancha sola, en su horario, sin depender de recepción.' },
  { icon: Users, title: 'Torneos Americano/Mexicano', text: 'Se piden los nombres de los jugadores desde la reserva.' },
  { icon: ShoppingBag, title: 'Tiendas vinculadas', text: 'Hasta 4 negocios cobran su propio consumo, con su propio QR.' },
  { icon: Wallet, title: 'Pago dividido', text: 'Cada jugador paga su parte desde la tablet, con su referencia.' },
  { icon: Banknote, title: 'Tasa BCV automática', text: 'El monto en bolívares se calcula solo, actualizado varias veces al día.' },
  { icon: Bell, title: 'Lista negra automática', text: 'Bloquea sola a quien falta sin avisar, sin que nadie lo anote a mano.' },
  { icon: UserCog, title: 'Roles del equipo', text: 'Dueño, Administrador y Cajero — cada quien ve solo lo que le corresponde.' },
];

const CLUB_FAQ = [
  {
    q: '¿Qué deportes puedo gestionar?',
    a: 'Pádel, tenis, fútbol y cualquier cancha que se reserve por horario — tú defines tus canchas, horarios y precios.',
  },
  {
    q: '¿Cómo confirma el jugador su reserva?',
    a: 'Con un código que le llega por WhatsApp al número que escribió al reservar — sin esto, cualquiera podría reservar con el teléfono de otra persona.',
  },
  {
    q: '¿Qué pasa si el jugador pierde su QR de acceso?',
    a: 'Recepción tiene una llave maestra que abre cualquier cancha sin depender del QR del jugador.',
  },
  {
    q: '¿Puedo vincular la tienda del club a las canchas?',
    a: 'Sí, y también hasta 3 negocios más — cada uno cobra su propio consumo desde la misma tablet, con su propio método de pago.',
  },
  {
    q: '¿Puedo probarlo antes de pagar?',
    a: 'Sí — hay un club de demostración ("Canchas Demo") abierto para explorar todo el sistema en vivo, y un período de prueba gratis al crear tu cuenta.',
  },
];

export default function LandingPage() {
  const [showIntro, setShowIntro] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [demoOpen, setDemoOpen] = useState(false);
  const [enteringRole, setEnteringRole] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [vertical, setVertical] = useState<'restaurant' | 'shop' | 'club'>('restaurant');
  const { login } = useAuth();
  const navigate = useNavigate();

  // Título fijo aunque cambie el toggle Restaurantes / Locales / Canchas: la URL es la
  // misma (`/`), así que debe tener un solo título en buscadores.
  // Cluster G del plan SEO: la home es la única página que persigue "software para
  // restaurantes" — mantener en espejo con web/index.html.
  useDocumentMeta(
    'QuickTap — Software para restaurantes: menú QR, pedidos y delivery',
    'Software para gestionar tu restaurante: menú digital QR, pedidos que llegan directo a cocina, delivery por WhatsApp e inventario con recetas. También para locales comerciales y canchas. Prueba gratis 15 días.',
  );

  // Contenido de toda la página desde acá para abajo depende del toggle Restaurantes /
  // Locales Comerciales / Canchas — mismo componente, tres catálogos de contenido en paralelo.
  const isShop = vertical === 'shop';
  const isClub = vertical === 'club';
  const activeShowcases = isClub ? CLUB_SHOWCASES : isShop ? SHOP_SHOWCASES : SHOWCASES;
  const activeSupporting = isClub ? CLUB_SUPPORTING : isShop ? SHOP_SUPPORTING : SUPPORTING;
  const activeFaq = isClub ? CLUB_FAQ : isShop ? SHOP_FAQ : FAQ;
  const activeDemoRoles = isClub ? CLUB_DEMO_ROLES : isShop ? SHOP_DEMO_ROLES : DEMO_ROLES;
  const heroContent = isClub
    ? {
        eyebrow: 'QuickTap Canchas',
        title: 'De la reserva a la cancha libre. En un toque.',
        description:
          'QuickTap Canchas conecta tus reservas, el control de acceso por QR, el consumo en cancha y el cobro en un solo sistema — para clubes de pádel, tenis, fútbol y más.',
        cta: 'Ver cancha de demostración',
      }
    : isShop
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

  // Video ambiente del hero: ralentizado para que se sienta atmosférico, no un comercial.
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    if (heroVideoRef.current) heroVideoRef.current.playbackRate = 0.7;
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setShowIntro(false), 2100);
    return () => clearTimeout(t);
  }, []);

  async function enterDemoAs(demoRole: DemoRole) {
    setEnteringRole(demoRole.role);
    setDemoError(null);
    try {
      const password = isClub ? CLUB_DEMO_PASSWORD : isShop ? SHOP_DEMO_PASSWORD : RESTAURANT_DEMO_PASSWORD;
      const slug = isClub ? CLUB_DEMO_SLUG : isShop ? SHOP_DEMO_SLUG : RESTAURANT_DEMO_SLUG;
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
        {/* Hero estilo estudio creativo: video ambiente de fondo a sangre completa, nav
            integrada arriba, titular con acento serif itálico y contenido en la columna
            izquierda. Las máscaras de degradado garantizan legibilidad sin tapar el
            centro-derecha del video. */}
        <section className="relative min-h-screen overflow-hidden bg-[#F6F9FC]">
          {/* Video decorativo, ralentizado a 0.7x (ver useEffect) */}
          <video
            ref={heroVideoRef}
            autoPlay
            loop
            muted
            playsInline
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            src="https://strvid.nyc3.cdn.digitaloceanspaces.com/motionsite/creative_studio_video.mp4"
          />
          {/* Máscaras: columna izquierda legible, franjas arriba/abajo para nav y cierre */}
          <div className="absolute inset-y-0 left-0 w-[78%] sm:w-[42%] bg-gradient-to-r from-[#F6F9FC] via-[#F6F9FC]/90 to-transparent" />
          <div className="absolute top-0 inset-x-0 h-48 sm:h-56 lg:h-64 bg-gradient-to-b from-[#F6F9FC] via-[#F6F9FC]/60 to-transparent" />
          <div className="absolute bottom-0 inset-x-0 h-48 sm:h-56 lg:h-64 bg-gradient-to-t from-[#F6F9FC] via-[#F6F9FC]/60 to-transparent" />

          <div className="relative z-10 flex min-h-screen w-full flex-col justify-between px-6 py-6 sm:px-12 lg:px-16">
            {/* Nav integrada en el hero */}
            <nav aria-label="Principal" className="flex items-center justify-between gap-4">
              <Link to="/" className="flex items-center gap-2">
                <img src="/logo/icono.png" alt="" className="h-8 w-8" />
                <span className="text-lg font-bold tracking-tight text-brand-950">
                  quicktap<span className="text-brand-500">.</span>
                </span>
              </Link>
              <div className="hidden lg:flex items-center gap-8">
                {[
                  { label: 'Funciones', href: '#funciones' },
                  { label: 'Precios', to: '/precios' },
                  { label: 'Comparativa', to: '/comparativa' },
                  { label: 'Iniciar sesión', to: '/admin/login' },
                ].map((l) =>
                  l.to ? (
                    <Link key={l.label} to={l.to} className="group relative text-sm font-medium text-brand-950/70 transition-colors hover:text-brand-950">
                      {l.label}
                      <span className="absolute -bottom-1 left-0 h-px w-0 bg-brand-950 transition-all duration-300 group-hover:w-full" />
                    </Link>
                  ) : (
                    <a key={l.label} href={l.href} className="group relative text-sm font-medium text-brand-950/70 transition-colors hover:text-brand-950">
                      {l.label}
                      <span className="absolute -bottom-1 left-0 h-px w-0 bg-brand-950 transition-all duration-300 group-hover:w-full" />
                    </a>
                  ),
                )}
              </div>
              <div className="flex items-center gap-3">
                <Link
                  to="/empezar"
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-brand-950 px-5 py-2 text-sm font-semibold text-brand-950 transition-colors hover:bg-brand-950 hover:text-white"
                >
                  Regístrate <ArrowUpRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setNavOpen(true)}
                  aria-label="Abrir menú"
                  className="lg:hidden flex h-10 w-10 items-center justify-center rounded-full border border-brand-950/15 bg-white/70 backdrop-blur-sm"
                >
                  <Menu className="h-5 w-5 text-brand-950" />
                </button>
              </div>
            </nav>

            {/* Contenido principal — columna izquierda */}
            <div className="max-w-xl py-14">
              <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.25em] text-brand-500">
                • Menú QR • Comandas • Delivery
              </p>
              <h1 className="mt-5 text-4xl sm:text-6xl font-bold leading-[1.05] text-brand-950">
                Software para restaurantes,
                <span className="block font-display italic font-normal text-brand-500">en un toque.</span>
              </h1>
              <p className="mt-6 max-w-md text-[15px] sm:text-base font-light leading-relaxed text-brand-950/60">
                Tu carta digital, los pedidos de cada mesa, el delivery por WhatsApp y el inventario — en un solo
                sistema, desde cualquier navegador. También para locales comerciales y canchas.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => setDemoOpen(true)}
                  className="group inline-flex items-center gap-2 rounded-full bg-brand-950 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-900"
                >
                  Ver la demo
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
                <Link to="/precios" className="text-sm font-medium text-brand-950/70 underline underline-offset-4 hover:text-brand-950">
                  Ver precios y planes
                </Link>
              </div>

              {/* Prueba social: las tres verticales que ya operan con QuickTap */}
              <div className="mt-10 flex items-center gap-4">
                <div className="flex -space-x-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-950 ring-2 ring-[#F6F9FC]">
                    <UtensilsCrossed className="h-4 w-4 text-white" />
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 ring-2 ring-[#F6F9FC]">
                    <ShoppingBag className="h-4 w-4 text-white" />
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 ring-2 ring-[#F6F9FC]">
                    <Trophy className="h-4 w-4 text-white" />
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 ring-2 ring-[#F6F9FC]">
                    <Coffee className="h-4 w-4 text-white" />
                  </span>
                </div>
                <p className="max-w-[240px] text-[13px] font-light leading-snug text-brand-950/60">
                  Restaurantes, locales comerciales y canchas operan a diario con QuickTap.
                </p>
              </div>
            </div>

            {/* Invitación a seguir bajando */}
            <div className="flex justify-center pb-1">
              <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
                <ChevronDown className="h-6 w-6 text-brand-950/40" />
              </motion.div>
            </div>
          </div>
        </section>

        {/* Menú móvil del hero: panel deslizante desde la derecha */}
        <AnimatePresence>
          {navOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-brand-950/40 backdrop-blur-sm" onClick={() => setNavOpen(false)} />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="absolute right-0 top-0 flex h-full w-72 flex-col bg-white p-6 shadow-xl"
              >
                <div className="mb-6 flex items-center justify-between">
                  <img src="/logo/icono.png" alt="QuickTap" className="h-7 w-7" />
                  <button
                    type="button"
                    onClick={() => setNavOpen(false)}
                    aria-label="Cerrar menú"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-950/[0.06]"
                  >
                    <X className="h-4.5 w-4.5 text-brand-950" />
                  </button>
                </div>
                <a href="#funciones" onClick={() => setNavOpen(false)} className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-brand-950 hover:bg-brand-950/5">
                  Funciones
                </a>
                <Link to="/precios" className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-brand-950 hover:bg-brand-950/5">
                  Precios
                </Link>
                <Link to="/comparativa" className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-brand-950 hover:bg-brand-950/5">
                  Comparativa
                </Link>
                <Link to="/admin/login" className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-brand-950 hover:bg-brand-950/5">
                  Iniciar sesión
                </Link>
                <Link
                  to="/empezar"
                  className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Regístrate <ArrowUpRight className="h-4 w-4" />
                </Link>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hero secundario: presentación general (antes en /soluciones) */}
        <section id="funciones" className="relative bg-white min-h-screen flex items-center px-4 pt-24 pb-12">
          <Reveal className="relative z-10 max-w-3xl mx-auto text-center">
            {/* Toggle Restaurantes / Locales Comerciales / Canchas: todo el contenido de acá
                para abajo (vitrinas, features, FAQ y el demo) cambia según cuál esté activo. */}
            <div className="inline-flex items-center gap-1 rounded-full border border-brand-950/10 bg-brand-950/[0.03] p-1 mb-6">
              <button
                type="button"
                onClick={() => setVertical('restaurant')}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  !isShop && !isClub ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950/80'
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
              <button
                type="button"
                onClick={() => setVertical('club')}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  isClub ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950/80'
                }`}
              >
                Canchas
              </button>
            </div>
            <p className="text-xs font-medium text-brand-950/40 tracking-wide">{heroContent.eyebrow}</p>
            {/* h2, no h1: el h1 de la home vive en el hero de arriba (cluster G del plan SEO). */}
            <h2 className="mt-4 text-3xl sm:text-5xl font-bold text-brand-950">{heroContent.title}</h2>
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
            {/* Mismo contenido que se ve abajo, en el formato que Google necesita para
                mostrarlo como resultado enriquecido. Se emite el set del vertical activo
                para que siempre coincida con lo que hay en pantalla. */}
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  '@context': 'https://schema.org',
                  '@type': 'FAQPage',
                  mainEntity: activeFaq.map((item) => ({
                    '@type': 'Question',
                    name: item.q,
                    acceptedAnswer: { '@type': 'Answer', text: item.a },
                  })),
                }).replace(/</g, '\\u003c'),
              }}
            />
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
              <Link to="/precios" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto rounded-full border border-brand-950/15 text-brand-950 font-medium px-6 py-2.5 transition-colors hover:bg-brand-950/5 active:scale-[0.97]">
                  Ver precios y planes
                </button>
              </Link>
            </div>
          </Reveal>
        </section>

        {/* Footer */}
        <footer className="border-t border-brand-950/10 bg-white">
          {/* Mapa de enlaces SEO: la home es el hub del cluster genérico y desde aquí
              reparte hacia cada página de servicio y vertical (ver data/seoPages.ts). */}
          <nav aria-label="Funciones y tipos de negocio" className="max-w-5xl mx-auto px-4 pt-10 grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm">
            <div>
              <p className="font-semibold text-brand-950 mb-3">Funciones</p>
              <ul className="space-y-2">
                <li><Link to="/menu-digital-qr" className="text-brand-950/60 hover:text-brand-950">Menú digital QR</Link></li>
                <li><Link to="/autopedido-comandas" className="text-brand-950/60 hover:text-brand-950">Sistema de comandas</Link></li>
                <li><Link to="/pedidos-whatsapp" className="text-brand-950/60 hover:text-brand-950">Pedidos por WhatsApp</Link></li>
                <li><Link to="/software-delivery" className="text-brand-950/60 hover:text-brand-950">Delivery propio</Link></li>
                <li><Link to="/menu-pantalla-tv" className="text-brand-950/60 hover:text-brand-950">Menú en pantalla / TV</Link></li>
                <li><Link to="/inventario-costos" className="text-brand-950/60 hover:text-brand-950">Inventario y costos</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-brand-950 mb-3">Por tipo de negocio</p>
              <ul className="space-y-2">
                <li><Link to="/para/bares" className="text-brand-950/60 hover:text-brand-950">Para bares</Link></li>
                <li><Link to="/para/cafeterias" className="text-brand-950/60 hover:text-brand-950">Para cafeterías</Link></li>
                <li><Link to="/para/pizzerias" className="text-brand-950/60 hover:text-brand-950">Para pizzerías</Link></li>
                <li><Link to="/para/comida-rapida" className="text-brand-950/60 hover:text-brand-950">Para comida rápida</Link></li>
                <li><Link to="/para/food-trucks" className="text-brand-950/60 hover:text-brand-950">Para food trucks</Link></li>
                <li><Link to="/para/taquerias" className="text-brand-950/60 hover:text-brand-950">Para taquerías</Link></li>
                <li><Link to="/para/pollerias" className="text-brand-950/60 hover:text-brand-950">Para pollerías</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-brand-950 mb-3">Recursos</p>
              <ul className="space-y-2">
                <li><Link to="/precios" className="text-brand-950/60 hover:text-brand-950">Precios y planes</Link></li>
                <li><Link to="/comparativa" className="text-brand-950/60 hover:text-brand-950">Cómo elegir un software</Link></li>
                <li><Link to="/legal" className="text-brand-950/60 hover:text-brand-950">Legal</Link></li>
              </ul>
            </div>
          </nav>
          <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/logo/icono.png" alt="" className="h-7 w-7" />
              <p className="text-sm text-brand-950/60 font-light">
                © {new Date().getFullYear()} QuickTap.club — todo a un toque.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/legal" className="text-sm text-brand-950/70 hover:text-brand-950">
                Legal
              </Link>
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
          <p className="text-center text-[11px] text-brand-950/25 font-light pb-4">Isaías 41:20</p>
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
