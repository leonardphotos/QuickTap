import { IntroLoader } from '@/components/landing/IntroLoader';
import './LandingScreenshots.css';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { FeatureCard,type GridFeature } from '@/components/ui/grid-feature-cards';
import { ShaderBackground } from '@/components/ui/adisyon-shader';
import { TextureButton } from '@/components/ui/texture-button';
import { useAuth } from '@/context/AuthContext.shared';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { ArrowUpRight,Banknote,BarChart3,Bell,Bike,Bot,Boxes,Building2,CalendarDays,ChefHat,ChevronDown,ChevronRight,CreditCard,Crown,Download,Grid2x2,Hash,Menu,MessageCircle,Monitor,Palette,Printer,QrCode,ScanLine,ShieldCheck,ShoppingBag,Smartphone,SplitSquareHorizontal,Tablet,Tag,UserCog,Users,Wallet,Wallet as WalletIcon,X } from 'lucide-react';
import { AnimatePresence,motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useEffect,useRef,useState } from 'react';
import { Link,useNavigate } from 'react-router-dom';

/** Espejo en JS de --ease-out-strong (index.css): arranca rápido, se siente intencional. */
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

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

/** Carrusel de capacidades: usa scroll-snap nativo para conservar el gesto directo en móvil
 * y añade flechas como alternativa precisa en escritorio. */
function FeatureCarousel({ features }: { features: GridFeature[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  function updateActiveCard() {
    const track = trackRef.current;
    if (!track) return;
    const cards = Array.from(track.querySelectorAll<HTMLElement>('[data-feature-card]'));
    if (!cards.length) return;
    const current = cards.reduce((nearest, card, index) => (
      Math.abs(card.offsetLeft - track.scrollLeft) < Math.abs(cards[nearest].offsetLeft - track.scrollLeft) ? index : nearest
    ), 0);
    setActiveIndex(current);
  }

  function move(direction: -1 | 1) {
    const track = trackRef.current;
    if (!track) return;
    const cards = Array.from(track.querySelectorAll<HTMLElement>('[data-feature-card]'));
    const next = Math.max(0, Math.min(cards.length - 1, activeIndex + direction));
    cards[next]?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'start' });
  }

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={updateActiveCard}
        aria-label="Funciones de QuickTap"
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0"
      >
        {features.map((feature) => (
          <FeatureCard
            key={feature.title}
            feature={feature}
            data-feature-card
            className="h-[430px] w-[calc(100vw-3rem)] shrink-0 snap-start overflow-y-auto border border-dashed border-white/[.11] sm:w-[min(430px,calc(50vw-2rem))] lg:w-[380px]"
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="font-medium tracking-wide text-white/45 text-xs">
          {String(activeIndex + 1).padStart(2, '0')} <span className="mx-1 text-white/25">/</span> {String(features.length).padStart(2, '0')}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={activeIndex === 0}
            aria-label="Función anterior"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-lg text-white transition-[background-color,opacity,transform] duration-150 hover:bg-white/10 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-30"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={activeIndex === features.length - 1}
            aria-label="Siguiente función"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-lg text-white transition-[background-color,opacity,transform] duration-150 hover:bg-white/10 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-30"
          >
            →
          </button>
        </div>
      </div>
    </div>
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

/**
 * Enlace público de la app de iPhone (App Store o TestFlight).
 *
 * Va en `null` hasta que exista, y no por olvido: iOS no tiene equivalente a la APK — un .ipa
 * suelto no se instala en un iPhone ajeno, así que no hay archivo que ofrecer aquí. La única
 * vía es App Store o TestFlight, y ambas exigen el Apple Developer Program. Mientras tanto el
 * botón se muestra como "Próximamente", para no prometer una descarga que fallaría.
 *
 * Para activarlo basta con pegar la URL acá: el botón pasa solo a ser un enlace normal.
 */
const IOS_APP_URL: string | null = null;

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
  { icon: Bike, role: 'MOTORIZADO', email: 'motorizado.demo@quicktap.club', label: 'Motorizado', description: 'Mapa, ruta y cola móvil de pedidos para entregar.' },
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
    '¡Hola! 👋 Bienvenido a Bunzy Burgers, restaurante de demostración. Puedes ver el menú y pedir aquí: quicktap.club/r/demo',
    '💳 El total y los datos de pago del restaurante aparecen aquí.',
    '✅ Pago confirmado. Tu pedido de demostración ya está en proceso.',
  ];
  return (
    <div className="space-y-1.5 max-w-xs">
      {bubbles.map((b, i) => (
        <div key={i} className="rounded-2xl bg-[#dcf8c6]/60 px-3 py-2">
          <p className="text-brand-950/70 leading-snug text-xs">{b}</p>
        </div>
      ))}
    </div>
  );
}

/** Capturas actuales de la demo: móvil en teléfonos verticales y web en pantallas anchas
 * u horizontales. Picture descarga solo la variante adecuada y conserva su proporción. */
function PlatformScreenshot({ src, alt }: { src: string; alt: string }) {
  const name = src.split('/').pop()?.replace('-captura.jpg', '');
  const [expanded, setExpanded] = useState(false);
  const demoImage = name?.includes('inventario') || name?.includes('productos')
    ? '/images/restaurant-demo/productos.jpg'
    : name?.includes('administracion') || name?.includes('cobros') || name?.includes('sucursales') || name?.includes('cocina') || name?.includes('autoservicio')
      ? '/images/restaurant-demo/administracion.jpg'
      : '/images/restaurant-demo/menu.jpg';
  const restaurantCaption = 'Restaurante de demostración · QuickTap';
  return (
    <>
    <figure className="landing-platform-shot mx-auto overflow-hidden border-[5px] border-brand-950 bg-white shadow-[0_24px_50px_-20px_rgba(0,27,67,0.35)]">
      <button type="button" onClick={() => setExpanded(true)} aria-label={`Ampliar captura: ${alt}`} className="block h-full w-full cursor-zoom-in focus-visible:outline-4 focus-visible:outline-offset-[-4px] focus-visible:outline-brand-500">
      <picture>
        <img src={demoImage} alt={alt} loading="lazy" decoding="async" className="block h-full w-full object-contain object-top" />
      </picture>
      </button>
    </figure>
    {restaurantCaption && <p className="mt-3 text-center leading-relaxed text-brand-950/50 text-xs">{restaurantCaption}</p>}
    <Dialog open={expanded} onOpenChange={setExpanded}>
      <DialogContent aria-describedby={undefined} className="w-[95vw] max-w-[1440px] max-h-[95dvh] p-3 pt-12">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <picture>
          <img src={demoImage} alt={alt} decoding="async" className="mx-auto block h-auto max-h-[80dvh] w-full rounded-lg object-contain" />
        </picture>
      </DialogContent>
    </Dialog>
    </>
  );
}

const PhoneMockup = PlatformScreenshot;

/** Captura real de la pantalla de cobro por Pago Móvil de QuickTap Shop — con el QR que subió el
 * negocio, el monto en Bs y la tasa del día, todo en una sola pantalla. */
function ShopQrPaymentMock() {
  return <PhoneMockup src="/images/punto-pago-captura.jpg" alt="Pantalla de cobro por Pago Móvil de QuickTap Shop, con QR, monto en Bs y tasa del día" />;
}

/** Marco de tablet horizontal (CSS puro), para las capturas reales de la tablet de cancha —
 * mismo criterio que PhoneMockup, pero apaisado. */
const TabletMockup = PlatformScreenshot;

/** Tarjeta simple para una captura real que ya trae su propia forma (un diálogo, una pantalla
 * de escritorio) — sin bezel de dispositivo, solo el marco que usan el resto de vitrinas. */
const ScreenshotCard = PlatformScreenshot;

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
        alt="Menú público de un restaurante de demostración en QuickTap, con categorías y precios"
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
        alt="Panel administrativo de un restaurante de demostración en QuickTap"
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
        alt="Vista de gestión de QuickTap con datos de un restaurante de demostración"
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
        alt="Menú de un restaurante de demostración para pedidos y retiro"
      />
    ),
  },
  {
    icon: Bot,
    eyebrow: 'Chatbot de WhatsApp',
    title: 'Un chatbot que confirma por ti',
    description:
      'Conecta el WhatsApp del negocio para responder, enviar el cobro y confirmar pedidos desde la misma conversación.',
    bullets: [
      'Comparte el menú y los datos de pago automáticamente',
      'Reenvía el comprobante para una aprobación individual',
      'Al aprobar, el pedido pasa a cocina y el cliente recibe sus avisos',
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
        alt="Vista de autoservicio de QuickTap con datos de un restaurante de demostración"
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
        alt="Vista de inventario de QuickTap con datos de un restaurante de demostración"
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
        alt="Dashboard de QuickTap con datos de un restaurante de demostración"
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
        alt="Panel de sucursales de QuickTap con datos de demostración"
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
        alt="Vista actual de QuickTap Canchas, con disponibilidad, jugadores y tiempo de cada cancha"
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
        alt="Control de acceso actual de QuickTap Canchas"
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
        alt="Tienda actual del club de demostración de QuickTap Canchas"
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
        alt="Panel actual de cobros y deudas de QuickTap Canchas"
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
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [enteringRole, setEnteringRole] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  // La captación y la demo pública se enfocan temporalmente solo en restaurantes. Se conserva
  // el contenido de las demás verticales en el código para reactivarlo sin perderlo.
  const [vertical] = useState<'restaurant' | 'shop' | 'club'>('restaurant');
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

  const [navOpen, setNavOpen] = useState(false);

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
        {/* Hero con ondas WebGL de la identidad QuickTap. El shader se pausa fuera del
            viewport y se vuelve estático cuando el sistema solicita reducir movimiento. */}
        <section className="relative min-h-screen overflow-hidden bg-brand-950">
          <ShaderBackground className="absolute inset-0 h-full w-full" />
          {/* Velo óptico localizado: protege la lectura sin ocultar el movimiento del shader. */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,18,45,.76)_0%,rgba(0,24,58,.42)_42%,rgba(0,15,35,.06)_76%)] max-md:bg-[linear-gradient(180deg,rgba(0,18,45,.62)_0%,rgba(0,20,48,.28)_58%,rgba(0,10,24,.36)_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-brand-950/35 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-brand-950/55 to-transparent" />

          <div className="relative z-10 flex min-h-screen w-full flex-col justify-between px-6 py-6 sm:px-12 lg:px-16">
            {/* Nav integrada en el hero */}
            <nav aria-label="Principal" className="flex items-center justify-between gap-4">
              <Link to="/" aria-label="QuickTap" className="flex items-center">
                <img
                  src="/logo/QuickTap-Baja-blanco.png?v=20261002"
                  alt="QuickTap"
                  width="520"
                  height="123"
                  className="h-7 w-auto sm:h-8"
                />
              </Link>
              <div className="hidden lg:flex items-center gap-8">
                {[
                  { label: 'Funciones', href: '#funciones' },
                  { label: 'Precios', to: '/precios' },
                  { label: 'Comparativa', to: '/comparativa' },
                  { label: 'Tutoriales', to: '/tutoriales' },
                  { label: 'Iniciar sesión', to: '/admin/login' },
                ].map((l) =>
                  l.to ? (
                    <Link key={l.label} to={l.to} className="group relative text-sm font-medium text-white/75 transition-colors hover:text-white">
                      {l.label}
                      <span className="absolute -bottom-1 left-0 h-px w-0 bg-white transition-all duration-300 group-hover:w-full" />
                    </Link>
                  ) : (
                    <a key={l.label} href={l.href} className="group relative text-sm font-medium text-white/75 transition-colors hover:text-white">
                      {l.label}
                      <span className="absolute -bottom-1 left-0 h-px w-0 bg-white transition-all duration-300 group-hover:w-full" />
                    </a>
                  ),
                )}
                <button
                  type="button"
                  onClick={() => setDownloadsOpen(true)}
                  className="group relative text-sm font-medium text-white/75 transition-colors hover:text-white"
                >
                  Descargas
                  <span className="absolute -bottom-1 left-0 h-px w-0 bg-white transition-[width] duration-200 group-hover:w-full" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  to="/empezar"
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/55 bg-white/10 px-5 py-2 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white hover:text-brand-950"
                >
                  Regístrate <ArrowUpRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setNavOpen(true)}
                  aria-label="Abrir menú"
                  className="lg:hidden flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-brand-950/25 backdrop-blur-md"
                >
                  <Menu className="h-5 w-5 text-white" />
                </button>
              </div>
            </nav>

            {/* Contenido principal — columna izquierda */}
            <div className="max-w-xl py-14">
              <p className="font-bold uppercase tracking-[0.25em] text-sky-300 text-xs">
                • Menú QR • Comandas • Delivery
              </p>
              <h1 className="mt-5 text-4xl sm:text-6xl font-bold leading-[1.05] text-white drop-shadow-sm">
                Software para restaurantes,
                <span className="block font-display italic font-normal text-sky-300">en un toque.</span>
              </h1>
              <p className="mt-5 max-w-sm font-light leading-relaxed text-white/72 text-base">
                Lleva el control de tu negocio desde cualquier parte del mundo: ventas, pedidos, inventario y equipo,
                siempre contigo.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to="/menu-gratis"
                  className="group inline-flex items-center gap-2 rounded-full bg-brand-500 px-7 py-3.5 text-sm font-semibold text-white shadow-[0_14px_34px_-14px_rgba(0,159,255,.8)] transition-colors hover:bg-brand-500"
                >
                  Obtén tu menú gratis
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </div>
            </div>

            {/* Invitación a seguir bajando */}
            <div className="flex justify-center pb-1">
              <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
                <ChevronDown className="h-6 w-6 text-white/55" />
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
                  <img src="/logo/icono.png?v=20261002" alt="QuickTap" className="h-7 w-7" />
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
                <Link to="/tutoriales" className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-brand-950 hover:bg-brand-950/5">
                  Tutoriales
                </Link>
                <button
                  type="button"
                  onClick={() => { setNavOpen(false); setDownloadsOpen(true); }}
                  className="rounded-lg px-3 py-2.5 text-left text-[15px] font-medium text-brand-950 hover:bg-brand-950/5"
                >
                  Descargas
                </button>
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

        <div style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        {/* Desde aquí la landing adopta el ritmo editorial del SaaS Kit: tipografía de
            sistema, grandes titulares, aire generoso y demostraciones de producto. */}
        <section id="funciones" className="relative overflow-hidden bg-[#f8fafc] px-4 py-28 sm:py-36">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(5,151,242,.12),transparent_72%)]" />
          <Reveal className="relative z-10 mx-auto max-w-4xl text-center">
            <p className="font-bold uppercase tracking-[.18em] text-brand-500 text-xs">{heroContent.eyebrow}</p>
            {/* h2, no h1: el h1 de la home vive en el hero de arriba (cluster G del plan SEO). */}
            <h2 className="mt-5 text-4xl font-semibold leading-[.98] tracking-[-.05em] text-brand-950 sm:text-6xl lg:text-7xl">{heroContent.title}</h2>
            <p className="mx-auto mt-7 max-w-2xl leading-7 text-brand-950/60 sm:text-lg text-base">{heroContent.description}</p>
            <div className="mt-9 flex items-center justify-center">
              <TextureButton variant="brand" size="lg" className="sm:!w-auto" onClick={() => setDemoOpen(true)}>
                {heroContent.cta}
              </TextureButton>
            </div>
          </Reveal>
        </section>

        {/* Todas las capacidades viven en un carrusel textual compacto, sin mockups. */}
        <section className="relative overflow-hidden border-y border-white/[.07] bg-brand-950 px-4 py-24 sm:py-32">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_50%_0%,rgba(5,151,242,.18),transparent_68%)]" />
          <div className="mx-auto max-w-6xl">
            <Reveal className="relative mx-auto mb-14 max-w-3xl text-center">
              <p className="font-bold uppercase tracking-[.18em] text-sky-300 text-xs">Una sola plataforma</p>
              <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-.045em] text-white sm:text-6xl">Potencia. Orden. Control.</h2>
              <p className="mx-auto mt-5 max-w-2xl leading-7 text-white/58 text-base">Todas las funciones de QuickTap, explicadas de forma simple y reunidas en un solo lugar.</p>
            </Reveal>
            <Reveal className="relative">
              <FeatureCarousel
                key={vertical}
                features={[
                  ...activeShowcases.map((feature) => ({
                    title: feature.title,
                    icon: feature.icon,
                    description: feature.description,
                    eyebrow: feature.eyebrow,
                    details: feature.bullets,
                  })),
                  ...activeSupporting.map((feature) => ({ title: feature.title, icon: feature.icon, description: feature.text })),
                ]}
              />
            </Reveal>
          </div>
        </section>

        {/* FAQ en dos columnas: contexto fijo a la izquierda y respuestas a la derecha. */}
        <section className="bg-white px-4 py-24 sm:py-32">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[.75fr_1.25fr] lg:gap-20">
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
            <Reveal className="lg:sticky lg:top-24 lg:self-start">
              <p className="font-bold uppercase tracking-[.18em] text-brand-500 text-xs">Sin letra pequeña</p>
              <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-.04em] text-brand-950 sm:text-5xl">Preguntas frecuentes.</h2>
              <p className="mt-5 max-w-sm leading-7 text-brand-950/52 text-base">Todo lo importante antes de poner QuickTap a trabajar en tu negocio.</p>
            </Reveal>
            <div className="overflow-hidden rounded-[24px] border border-brand-950/[.08] bg-[#f8fafc]">
              {activeFaq.map((item, i) => {
                const open = openFaq === i;
                return (
                  <Reveal key={item.q} delay={(i % 5) * 0.04} className="border-b border-brand-950/[.07] last:border-b-0">
                    <button
                      onClick={() => setOpenFaq(open ? null : i)}
                      className="flex w-full items-center justify-between gap-5 px-6 py-5 text-left transition-colors duration-200 hover:bg-white active:bg-white/70 sm:px-7"
                    >
                      <span className="text-[15px] font-semibold text-brand-950">{item.q}</span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                        <ChevronDown className={`h-4 w-4 text-brand-500 transition-transform duration-200 ease-[cubic-bezier(.23,1,.32,1)] ${open ? 'rotate-180' : ''}`} />
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }} className="overflow-hidden">
                          <p className="px-6 pb-6 leading-6 text-brand-950/58 sm:px-7 text-base">{item.a}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA final dentro de un lienzo azul amplio, inspirado en el cierre del template. */}
        <section className="bg-white px-4 pb-8 pt-8 sm:pb-12">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[30px] bg-[radial-gradient(circle_at_78%_18%,rgba(93,211,255,.78),transparent_32%),linear-gradient(135deg,#3954e8_0%,#087fe8_55%,#29aef5_100%)] px-6 py-20 text-center shadow-[0_32px_80px_-42px_rgba(0,83,200,.6)] sm:rounded-[42px] sm:px-12 sm:py-28">
            <div className="pointer-events-none absolute -bottom-40 left-1/4 h-80 w-80 rounded-full bg-indigo-500/35 blur-3xl" />
            <div className="relative">
            <p className="font-bold uppercase tracking-[.18em] text-white/65 text-xs">Empieza hoy</p>
            <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[-.045em] text-white sm:text-6xl">Prueba QuickTap gratis.</h2>
            <p className="mx-auto mt-5 max-w-md leading-7 text-white/72 text-base">
              Crea tu cuenta, arma tu menú y genera el primer QR en minutos.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/empezar" className="w-full sm:w-auto">
                <button className="w-full rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-brand-950 shadow-[0_14px_32px_-18px_rgba(0,27,67,.65)] transition-transform duration-150 active:scale-[.97] sm:w-auto">Regístrate y comienza gratis hoy</button>
              </Link>
              <Link to="/precios" className="w-full sm:w-auto">
                <button className="w-full rounded-full border border-white/30 bg-white/10 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-[background-color,transform] duration-150 hover:bg-white/16 active:scale-[.97] sm:w-auto">
                  Ver precios y planes
                </button>
              </Link>
            </div>
            </div>
          </Reveal>
        </section>

        {/* Footer */}
        <footer className="border-t border-brand-950/10 bg-white">
          {/* Mapa de enlaces SEO: la home es el hub del cluster genérico y desde aquí
              reparte hacia cada página de servicio y vertical (ver data/seoPages.ts). */}
          <nav aria-label="Funciones y tipos de negocio" className="mx-auto grid max-w-6xl grid-cols-2 gap-10 px-4 pt-16 text-sm sm:grid-cols-3 sm:pt-20">
            <div>
              <p className="font-semibold text-brand-950 mb-3 text-base">Funciones</p>
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
              <p className="font-semibold text-brand-950 mb-3 text-base">Por tipo de negocio</p>
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
              <p className="font-semibold text-brand-950 mb-3 text-base">Recursos</p>
              <ul className="space-y-2">
                <li><Link to="/menu-gratis" className="text-brand-950/60 hover:text-brand-950">Menú gratis · Pedidos por WhatsApp</Link></li>
                <li><Link to="/precios" className="text-brand-950/60 hover:text-brand-950">Precios y planes</Link></li>
                <li><Link to="/comparativa" className="text-brand-950/60 hover:text-brand-950">Cómo elegir un software</Link></li>
                <li><button type="button" onClick={() => setDownloadsOpen(true)} className="text-brand-950/60 hover:text-brand-950">Descargas</button></li>
                <li><Link to="/legal" className="text-brand-950/60 hover:text-brand-950">Legal</Link></li>
              </ul>
            </div>
          </nav>
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-4 py-12 sm:flex-row">
            <div className="flex items-center gap-3">
              <img src="/logo/icono.png?v=20261002" alt="" className="h-7 w-7" />
              <p className="text-brand-950/60 font-light text-base">
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
          <p className="text-center text-brand-950/25 font-light pb-4 text-xs">Isaías 41:20</p>
        </footer>
        </div>

        {/* Centro de descargas: concentra cada instalador en un único punto de entrada. */}
        <Dialog open={downloadsOpen} onOpenChange={setDownloadsOpen}>
          <DialogContent className="max-w-2xl overflow-hidden p-0">
            <DialogHeader className="relative overflow-hidden bg-[radial-gradient(circle_at_84%_12%,rgba(96,212,255,.42),transparent_32%),linear-gradient(135deg,#063a75_0%,#087fe8_100%)] px-6 pb-7 pt-7 sm:px-8 sm:pb-8 sm:pt-8">
              <div className="pointer-events-none absolute -bottom-14 -right-12 h-40 w-40 rounded-full border border-white/20" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-white shadow-[0_12px_28px_-14px_rgba(0,27,67,.6)] backdrop-blur-sm">
                <Download className="h-6 w-6" />
              </div>
              <p className="relative mt-5 font-bold uppercase tracking-[.18em] text-sky-100/80 text-xs">QuickTap en tus dispositivos</p>
              <DialogTitle className="relative mt-2 text-2xl tracking-[-.035em] text-white sm:text-3xl">Centro de descargas</DialogTitle>
              <p className="relative mt-2 max-w-lg leading-6 text-white/75 text-base">Instala QuickTap donde trabajas. Todos los instaladores son gratuitos y no requieren iniciar sesión para descargarlos.</p>
            </DialogHeader>

            <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
              <a
                href="/descargas/QuickTap-Setup.exe"
                className="group rounded-2xl border border-brand-950/[.09] bg-[#f8fafc] p-5 transition-[border-color,background-color,transform] duration-200 ease-[cubic-bezier(.23,1,.32,1)] hover:-translate-y-0.5 hover:border-brand-500/35 hover:bg-sky-50 active:scale-[.98]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white shadow-[0_10px_20px_-12px_rgba(5,151,242,.9)]"><Monitor className="h-5 w-5" /></span>
                  <Download className="mt-1 h-4 w-4 text-brand-950/35 transition-transform duration-200 group-hover:translate-y-0.5 group-hover:text-brand-500" />
                </div>
                <p className="mt-5 font-semibold text-brand-950 text-base">QuickTap para Windows</p>
                <p className="mt-1 leading-5 text-brand-950/55 text-base">Panel, alertas de pedidos y acceso rápido desde tu computador.</p>
                <p className="mt-4 font-medium text-brand-500 text-xs">Instalador .exe</p>
              </a>
              <a
                href="/descargas/QuickTap.apk"
                className="group rounded-2xl border border-brand-950/[.09] bg-[#f8fafc] p-5 transition-[border-color,background-color,transform] duration-200 ease-[cubic-bezier(.23,1,.32,1)] hover:-translate-y-0.5 hover:border-brand-500/35 hover:bg-sky-50 active:scale-[.98]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white shadow-[0_10px_20px_-12px_rgba(5,151,242,.9)]"><Smartphone className="h-5 w-5" /></span>
                  <Download className="mt-1 h-4 w-4 text-brand-950/35 transition-transform duration-200 group-hover:translate-y-0.5 group-hover:text-brand-500" />
                </div>
                <p className="mt-5 font-semibold text-brand-950 text-base">QuickTap para Android</p>
                <p className="mt-1 leading-5 text-brand-950/55 text-base">Tu panel completo en el teléfono o tablet del restaurante.</p>
                <p className="mt-4 font-medium text-brand-500 text-xs">Archivo APK</p>
              </a>
              <a
                href="/descargas/QuickTap-Impresion-Setup-1.9.3.exe"
                className="group rounded-2xl border border-brand-950/[.09] bg-[#f8fafc] p-5 transition-[border-color,background-color,transform] duration-200 ease-[cubic-bezier(.23,1,.32,1)] hover:-translate-y-0.5 hover:border-brand-500/35 hover:bg-sky-50 active:scale-[.98]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-950 text-white shadow-[0_10px_20px_-12px_rgba(0,27,67,.75)]"><Printer className="h-5 w-5" /></span>
                  <Download className="mt-1 h-4 w-4 text-brand-950/35 transition-transform duration-200 group-hover:translate-y-0.5 group-hover:text-brand-500" />
                </div>
                <p className="mt-5 font-semibold text-brand-950 text-base">Estación de impresión</p>
                <p className="mt-1 leading-5 text-brand-950/55 text-base">Envía comandas y recibos a la impresora térmica del local.</p>
                <p className="mt-4 font-medium text-brand-500 text-xs">Instalador para Windows</p>
              </a>
              {IOS_APP_URL ? (
                <a
                  href={IOS_APP_URL}
                  className="group rounded-2xl border border-brand-950/[.09] bg-[#f8fafc] p-5 transition-[border-color,background-color,transform] duration-200 ease-[cubic-bezier(.23,1,.32,1)] hover:-translate-y-0.5 hover:border-brand-500/35 hover:bg-sky-50 active:scale-[.98]"
                >
                  <div className="flex items-start justify-between gap-4"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-950 text-white"><Smartphone className="h-5 w-5" /></span><Download className="mt-1 h-4 w-4 text-brand-950/35" /></div>
                  <p className="mt-5 font-semibold text-brand-950 text-base">QuickTap para iPhone</p>
                  <p className="mt-1 leading-5 text-brand-950/55 text-base">Instala la app desde App Store o TestFlight.</p>
                  <p className="mt-4 font-medium text-brand-500 text-xs">Disponible para iOS</p>
                </a>
              ) : (
                <div className="rounded-2xl border border-dashed border-brand-950/[.13] p-5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-950/[.06] text-brand-950/45"><Smartphone className="h-5 w-5" /></span>
                  <p className="mt-5 font-semibold text-brand-950/70 text-base">QuickTap para iPhone</p>
                  <p className="mt-1 leading-5 text-brand-950/45 text-base">Próximamente en App Store. Mientras tanto, abre QuickTap desde Safari y agrégalo a tu pantalla de inicio.</p>
                  <p className="mt-4 font-medium text-brand-950/35 text-xs">Próximamente</p>
                </div>
              )}
            </div>
            <p className="border-t border-brand-950/[.07] px-6 py-4 text-center leading-5 text-brand-950/45 text-xs">¿No sabes cuál instalar? Usa la app de Windows para administración, Android para el equipo en movimiento y la Estación de impresión para tus tickets.</p>
          </DialogContent>
        </Dialog>

        {/* Selector de rol para entrar al restaurante de demostración */}
        <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>¿Con qué rol quieres entrar?</DialogTitle>
              <p className="text-brand-950/50 font-light text-base">
                Cada rol ve una parte distinta de QuickTap — entra con el que quieras probar.
              </p>
            </DialogHeader>
            {demoError && <p className="text-red-600 text-base">{demoError}</p>}
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
                    <p className="font-semibold text-brand-950 text-base">{r.label}</p>
                    <p className="text-brand-950/50 font-light mt-0.5 text-xs">{r.description}</p>
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
