/**
 * Páginas SEO fijas del sitio (arquitectura de keywords, ago-2026).
 *
 * Cada cluster de intención tiene UNA página y una keyword principal (KP); la home se
 * queda con el genérico "software para restaurantes" y ninguna página de servicio
 * compite por él. Reglas anti-canibalización: la página de menú QR no usa "comandas"
 * en title/H1, la de comandas no usa "menú", WhatsApp es el canal de entrada del
 * pedido y delivery es la gestión del reparto.
 *
 * El CONTENIDO de cada página vive en el frontend (web/src/data/seoPages.ts);
 * aquí solo está lo que el crawler necesita ver sin ejecutar JavaScript: título,
 * descripción y canónica, inyectados en el shell por renderShell (seo.service.ts).
 * Si cambias un título aquí, cambia el mismo título allá — están comentados en pares.
 */

export interface StaticSeoPage {
  /** Ruta exacta (sin dominio), también usada como canónica y en el sitemap. */
  path: string;
  title: string;
  description: string;
  /** Prioridad en el sitemap (la home va aparte con 1.0). */
  priority: string;
}

/** Cluster A–F: páginas de servicio. Cluster I: /precios y /comparativa. */
export const SERVICE_SEO_PAGES: StaticSeoPage[] = [
  {
    // Cluster A — KP: menú digital para restaurantes
    path: '/menu-digital-qr',
    title: 'Menú digital QR para restaurantes | QuickTap',
    description:
      'Crea el menú digital de tu restaurante con código QR: carta con fotos, precios en $ y Bs a tasa BCV, cambios al instante y placas QR/NFC para tus mesas.',
    priority: '0.9',
  },
  {
    // Cluster B — KP: sistema de comandas para restaurantes
    path: '/autopedido-comandas',
    title: 'Sistema de comandas para restaurantes | QuickTap',
    description:
      'Comandas electrónicas: el cliente pide desde la mesa y el pedido llega directo a cocina, con impresión automática por estación y llamada al mesero incluida.',
    priority: '0.9',
  },
  {
    // Cluster C — KP: recibir pedidos por whatsapp
    path: '/pedidos-whatsapp',
    title: 'Recibir pedidos por WhatsApp en tu restaurante | QuickTap',
    description:
      'Toma pedidos por WhatsApp sin transcribir nada: el cliente arma su pedido en línea y te llega completo a tu WhatsApp, con dirección, pago y total calculado.',
    priority: '0.9',
  },
  {
    // Cluster D — KP: sistema de delivery para restaurantes
    path: '/software-delivery',
    title: 'Sistema de delivery para restaurantes | QuickTap',
    description:
      'Gestiona tu delivery propio sin comisiones por pedido: zonas de reparto con tarifas por mapa, repartidores, estados del pedido y confirmación por WhatsApp.',
    priority: '0.9',
  },
  {
    // Cluster E — KP: pantallas menú digital para restaurantes
    path: '/menu-pantalla-tv',
    title: 'Pantallas de menú digital para restaurantes | QuickTap',
    description:
      'Convierte cualquier TV en la cartelera digital de tu negocio: precios siempre al día en $ y Bs, agotados que se ocultan solos y promociones destacadas.',
    priority: '0.9',
  },
  {
    // Cluster F — KP: sistema de inventario para restaurante
    path: '/inventario-costos',
    title: 'Sistema de inventario y costeo para restaurantes | QuickTap',
    description:
      'Control de inventario para restaurantes con recetas y escandallos: cada plato vendido descuenta sus ingredientes solo, costo por plato al día y alertas de agotados.',
    priority: '0.9',
  },
  {
    // Cluster I — precio
    path: '/precios',
    title: 'Software para restaurantes: precios y planes | QuickTap',
    description:
      'Planes de QuickTap para restaurantes, locales comerciales y canchas: precios claros en dólares, pago en bolívares a tasa BCV y prueba gratis de 15 días sin tarjeta.',
    priority: '0.8',
  },
  {
    // Cluster I — comparativo
    path: '/comparativa',
    title: 'Mejores software para restaurantes: cómo elegir | QuickTap',
    description:
      'Qué debe incluir un buen software para restaurantes, cuánto debería costar y cómo comparar opciones: menú QR, comandas, delivery, inventario y soporte.',
    priority: '0.7',
  },
];

/** Cluster H — verticales por tipo de negocio: misma oferta, reempaquetada. No
 * duplican el copy de los servicios, solo lo referencian (regla del plan SEO). */
export const VERTICAL_SEO_PAGES: StaticSeoPage[] = [
  {
    path: '/para/bares',
    title: 'Software para bares y restaurantes | QuickTap',
    description:
      'Sistema para bares: pedidos desde la mesa o la barra, cuentas abiertas por mesa, cobro dividido entre amigos e inventario de botellas e insumos.',
    priority: '0.6',
  },
  {
    path: '/para/cafeterias',
    title: 'Software para cafeterías | QuickTap',
    description:
      'Sistema para cafeterías: carta QR con fotos, pedidos que llegan directo a la barra, venta para llevar y control de insumos como café, leche y azúcar.',
    priority: '0.6',
  },
  {
    path: '/para/pizzerias',
    title: 'Software para pizzerías: pedidos y delivery | QuickTap',
    description:
      'Sistema para pizzerías: tamaños y extras por variante, pedidos por WhatsApp, delivery con zonas de reparto e ingredientes descontados por receta.',
    priority: '0.6',
  },
  {
    path: '/para/comida-rapida',
    title: 'Software para comida rápida | QuickTap',
    description:
      'Sistema para comida rápida: kiosco de autoservicio, pantalla de números para retirar, combos con modificadores y cola de cocina en tiempo real.',
    priority: '0.6',
  },
  {
    path: '/para/food-trucks',
    title: 'Software para food trucks | QuickTap',
    description:
      'Sistema para food trucks: menú QR sin imprimir nada, pedidos por WhatsApp, pantalla de números y todo desde un teléfono — sin equipos costosos.',
    priority: '0.6',
  },
  {
    path: '/para/taquerias',
    title: 'Software para taquerías | QuickTap',
    description:
      'Sistema para taquerías: órdenes con extras y salsas por modificador, servicio en mesa o para llevar y control de insumos por receta.',
    priority: '0.6',
  },
  {
    path: '/para/pollerias',
    title: 'Software para pollerías | QuickTap',
    description:
      'Sistema para pollerías: combos por ración, pedidos por WhatsApp con delivery por zonas y control de inventario de pollo, guarniciones y empaques.',
    priority: '0.6',
  },
];

const ALL_PAGES = [...SERVICE_SEO_PAGES, ...VERTICAL_SEO_PAGES];
const BY_PATH = new Map(ALL_PAGES.map((p) => [p.path, p]));

export function getStaticSeoPage(path: string): StaticSeoPage | undefined {
  return BY_PATH.get(path);
}

export function listStaticSeoPages(): StaticSeoPage[] {
  return ALL_PAGES;
}
