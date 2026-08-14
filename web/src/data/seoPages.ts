/**
 * Contenido de las páginas SEO por cluster de intención (arquitectura de keywords,
 * ago-2026). Una página por cluster, una keyword principal (KP) por página.
 *
 * El título y la descripción de cada página DEBEN coincidir con los del backend
 * (src/modules/seo/static-pages.ts), que es quien los inyecta en el HTML para los
 * crawlers; aquí se repiten para que la SPA los aplique al navegar internamente.
 *
 * Reglas anti-canibalización (no romperlas al editar copy):
 * - "menu-digital-qr" rankea por menú/carta y NO usa "comandas" en title/H1.
 * - "autopedido-comandas" rankea por comandas/pedidos y NO usa "menú" en title/H1.
 * - "pedidos-whatsapp" es el canal de ENTRADA del pedido; "software-delivery" es
 *   la gestión del REPARTO.
 * - "menu-digital-qr" es el QR en el teléfono del cliente; "menu-pantalla-tv" es
 *   la pantalla del local.
 * - Ninguna de estas páginas persigue "software para restaurantes": ese cluster es
 *   de la home. Las verticales (/para/*) no duplican el copy de los servicios.
 */

export interface SeoFaq {
  q: string;
  a: string;
}

export interface SeoLink {
  to: string;
  label: string;
}

export interface SeoServicePage {
  slug: string;
  /** Mismo title/description que static-pages.ts (backend). */
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  intro: string[];
  screenshot?: { src: string; alt: string };
  features: { title: string; text: string }[];
  /** Bloques absorbidos de páginas que no ameritaban URL propia (plan SEO §3). */
  sections?: { title: string; text: string }[];
  faq: SeoFaq[];
  related: SeoLink[];
}

export const SEO_SERVICES: SeoServicePage[] = [
  {
    // Cluster A — KP: menú digital para restaurantes
    slug: 'menu-digital-qr',
    title: 'Menú digital QR para restaurantes | QuickTap',
    description:
      'Crea el menú digital de tu restaurante con código QR: carta con fotos, precios en $ y Bs a tasa BCV, cambios al instante y placas QR/NFC para tus mesas.',
    eyebrow: 'Menú digital QR',
    h1: 'Menú digital con código QR para tu restaurante',
    intro: [
      'Crea tu menú digital en minutos y olvídate de reimprimir la carta cada vez que cambia un precio. Tu cliente escanea el código QR de la mesa con su teléfono y ve tu carta digital con fotos, descripciones y precios siempre al día — sin descargar ninguna app.',
      'Los precios se muestran en bolívares calculados con la tasa BCV del día (y en dólares como referencia), así que un menú que armaste hace meses sigue cobrando bien hoy. Cambias un plato, una foto o un precio desde tu panel y el menú se actualiza al instante en todos los teléfonos.',
    ],
    screenshot: {
      // Menú real de un cliente (All Grill Chirikayen) — mejor prueba social que el demo.
      src: '/images/restaurant-menu-allgrill-captura.jpg',
      alt: 'Menú digital QR de All Grill Chirikayen visto desde el teléfono del cliente, con fotos de los platos y precios en bolívares y euros',
    },
    features: [
      { title: 'Carta con fotos y categorías', text: 'Productos estrella, promociones y especiales de la casa destacados; agotados que se ocultan solos.' },
      { title: 'Precios en $ y Bs a tasa BCV', text: 'La conversión se actualiza sola varias veces al día — nunca más una carta con precios viejos.' },
      { title: 'Tu marca, tus colores', text: 'Logo, banner, colores y redes sociales: el menú se ve como tu restaurante, no como una plantilla.' },
      { title: 'Variantes y extras por plato', text: 'Tamaños, términos de la carne, salsas y toppings — cada plato con sus opciones.' },
      { title: 'Sin apps ni cuentas', text: 'El cliente escanea y ve la carta en su navegador. Nada que instalar, nada que registrar.' },
      { title: 'Cambios ilimitados', text: 'Edita tu menú digital cuantas veces quieras desde el panel, desde cualquier dispositivo.' },
    ],
    sections: [
      {
        title: 'Placas QR y NFC para tus mesas',
        text: 'Además del código QR para imprimir, QuickTap ofrece placas físicas QR/NFC para las mesas: el cliente acerca su teléfono y la carta se abre sola. Se solicitan desde el panel y llegan listas para usar, con el diseño de tu marca.',
      },
      {
        title: 'Un enlace para todo',
        text: 'Tu menú vive en un enlace propio (quicktap.club/r/tu-restaurante) que sirve igual en el QR de la mesa, en tu bio de Instagram o compartido por WhatsApp. Un solo lugar que mantener.',
      },
    ],
    faq: [
      {
        q: '¿Necesito saber diseño para crear mi menú digital?',
        a: 'No. Cargas tus categorías, platos, fotos y precios desde el panel y el menú queda armado con el diseño de QuickTap y tus colores. Si ya tienes carta en otra plataforma, el equipo te ayuda a migrarla.',
      },
      {
        q: '¿El cliente necesita instalar una app para ver la carta?',
        a: 'No. El menú digital abre en el navegador del teléfono al escanear el QR — funciona en cualquier iPhone o Android sin instalar nada.',
      },
      {
        q: '¿Puedo usar el menú digital solo para mostrar, sin recibir pedidos?',
        a: 'Sí. Puedes activar la carta solo como catálogo y, cuando quieras, encender los pedidos desde la mesa o por WhatsApp — el mismo QR sirve para todo.',
      },
      {
        q: '¿Qué pasa si cambia la tasa del dólar?',
        a: 'Nada que hacer de tu lado: QuickTap actualiza la tasa BCV automáticamente varias veces al día y recalcula los precios en bolívares de toda la carta.',
      },
    ],
    related: [
      { to: '/autopedido-comandas', label: 'Pedidos desde la mesa que llegan a cocina' },
      { to: '/pedidos-whatsapp', label: 'Recibir pedidos por WhatsApp' },
      { to: '/menu-pantalla-tv', label: 'Tu carta en la pantalla del local' },
    ],
  },
  {
    // Cluster B — KP: sistema de comandas para restaurantes
    slug: 'autopedido-comandas',
    title: 'Sistema de comandas para restaurantes | QuickTap',
    description:
      'Comandas electrónicas: el cliente pide desde la mesa y el pedido llega directo a cocina, con impresión automática por estación y llamada al mesero incluida.',
    eyebrow: 'Autopedido y comandas',
    h1: 'Sistema de comandas: el pedido va de la mesa a la cocina, solo',
    intro: [
      'Con el sistema de comandas de QuickTap, el cliente arma su pedido desde la mesa con su propio teléfono y la comanda llega directo a la cola de cocina en tiempo real — sin mesero transcribiendo, sin papelitos, sin gritos a la cocina.',
      'Cada mesa mantiene su cuenta abierta: los pedidos se van acumulando en la misma sesión hasta que el cliente pide la cuenta. El equipo ve todo en vivo — qué mesa pidió, qué está en preparación y qué está listo para servir.',
    ],
    screenshot: {
      src: '/images/restaurant-cocina-captura.jpg',
      alt: 'Cola de cocina del sistema de comandas de QuickTap con los pedidos de cada mesa en tiempo real',
    },
    features: [
      { title: 'Comanda electrónica en tiempo real', text: 'El pedido de la mesa aparece en la pantalla de cocina en el mismo segundo, vía conexión en vivo.' },
      { title: 'Impresión automática por estación', text: 'Parrilla, barra, postres: cada comanda se imprime sola en la impresora térmica de su estación (58 u 80 mm).' },
      { title: 'Cuenta abierta por mesa', text: 'Todos los pedidos de la mesa se acumulan en una sola cuenta, con PIN opcional para que nadie pida en la mesa de otro.' },
      { title: 'Llamada al mesero y pedir la cuenta', text: 'El cliente toca un botón y al equipo le llega el aviso — con confirmación de que fue atendido.' },
      { title: 'Cobro flexible al cerrar', text: 'Cuenta completa, dividida entre varios o por consumo de cada quien — el pago se registra con su método y referencia.' },
      { title: 'Kiosco de autoservicio', text: 'Para barra o comida rápida: el cliente ordena y paga en un kiosco, y retira cuando su número aparece en pantalla.' },
    ],
    sections: [
      {
        title: 'Impresión de comandas sin computadora dedicada',
        text: 'La estación de impresión de QuickTap corre en cualquier navegador: inicia sesión en la computadora de caja, conecta tus impresoras térmicas y cada pedido nuevo se imprime solo donde corresponde. Sin instalar programas ni drivers especiales.',
      },
      {
        title: 'También con mesero, si así trabajas',
        text: 'Si prefieres que el pedido lo tome tu equipo, el rol Mesero tiene su propio panel simplificado para cargar la orden de la mesa en segundos — y la comanda viaja a cocina igual.',
      },
    ],
    faq: [
      {
        q: '¿Cómo evita que alguien pida en la mesa equivocada?',
        a: 'Cada mesa tiene su QR único y, tras el primer pedido, la mesa puede fijar un PIN de 4 dígitos: nadie más ordena en esa cuenta sin conocerlo.',
      },
      {
        q: '¿Qué impresoras funcionan para las comandas?',
        a: 'Cualquier impresora térmica de tickets de 58 u 80 mm instalada en la computadora de caja. La estación de impresión reparte cada comanda a su estación (cocina, barra, postres).',
      },
      {
        q: '¿Sirve si mi equipo toma los pedidos con tablet?',
        a: 'Sí. El panel funciona en tablet y teléfono, con un modo específico para meseros — y en tablets horizontales, una vista de punto de toma de pedido optimizada.',
      },
      {
        q: '¿Puedo exigir confirmación antes de que el pedido entre a cocina?',
        a: 'Sí. Puedes activar la confirmación manual: el pedido del cliente queda en espera hasta que caja o administración lo acepta, y recién ahí entra a la cola de cocina.',
      },
    ],
    related: [
      { to: '/menu-digital-qr', label: 'La carta QR que el cliente escanea' },
      { to: '/inventario-costos', label: 'Inventario que se descuenta con cada plato' },
      { to: '/pedidos-whatsapp', label: 'Pedidos que llegan de fuera del local' },
    ],
  },
  {
    // Cluster C — KP: recibir pedidos por whatsapp
    slug: 'pedidos-whatsapp',
    title: 'Recibir pedidos por WhatsApp en tu restaurante | QuickTap',
    description:
      'Toma pedidos por WhatsApp sin transcribir nada: el cliente arma su pedido en línea y te llega completo a tu WhatsApp, con dirección, pago y total calculado.',
    eyebrow: 'Pedidos por WhatsApp',
    h1: 'Recibe pedidos por WhatsApp, ya armados y con el total calculado',
    intro: [
      'Tomar pedidos por WhatsApp a mano es un cuello de botella: audios, mensajes incompletos, totales mal sumados. Con QuickTap, el cliente arma su pedido en tu catálogo en línea y te llega a tu WhatsApp como un mensaje completo: productos, cantidades, extras, dirección, método de pago y total en bolívares a tasa del día.',
      'Tú solo confirmas. El pedido queda también registrado en tu panel, así que no vives copiando mensajes a un cuaderno — la venta entra al sistema sola, con su cliente y su historial.',
    ],
    screenshot: {
      // Checkout real de un cliente (All Grill Chirikayen), con envío por zona calculado.
      src: '/images/restaurant-delivery-captura.jpg',
      alt: 'Pedido de delivery de All Grill Chirikayen listo para enviarse por WhatsApp, con el envío calculado por zona y el total en bolívares',
    },
    features: [
      { title: 'Pedido completo, no un audio', text: 'Productos, variantes, extras, notas, dirección y pago — todo en un solo mensaje ordenado.' },
      { title: 'Total calculado en $ y Bs', text: 'Sin sumar a mano ni discutir la tasa: el total llega calculado con la tasa BCV del día.' },
      { title: 'A domicilio o para retirar', text: 'El cliente elige delivery o pickup; si es a domicilio, marca su ubicación en el mapa.' },
      { title: 'Chatbot de WhatsApp opcional', text: 'Un bot puede dar la bienvenida, confirmar el pedido recibido y avisar cuando está listo — sin que tú escribas.' },
      { title: 'Clientes que se guardan solos', text: 'Cada pedido registra al cliente por su teléfono: la próxima vez ya conoces su historial.' },
      { title: 'Sin comisiones por pedido', text: 'Es tu canal y tu WhatsApp: nadie te cobra un porcentaje por cada venta que entra.' },
    ],
    faq: [
      {
        q: '¿Necesito WhatsApp Business para recibir los pedidos?',
        a: 'Funciona con tu WhatsApp de siempre o con WhatsApp Business: el pedido llega como un mensaje normal al número que configures.',
      },
      {
        q: '¿El cliente tiene que descargar algo para hacer su pedido?',
        a: 'No. Abre tu enlace (o escanea tu QR), arma el pedido en el navegador y lo envía por WhatsApp con un toque.',
      },
      {
        q: '¿Cómo cobro los pedidos que recibo por WhatsApp?',
        a: 'El cliente indica su método al pedir: pago móvil, transferencia, Zelle o efectivo, según los que actives. El comprobante te lo comparte por el mismo chat y el pago queda registrado en tu panel.',
      },
      {
        q: '¿Sirve para una pizzería o solo para restaurantes de mesa?',
        a: 'Sirve para cualquier negocio de comida: pizzerías, comida rápida, taquerías, dark kitchens. Si no tienes salón, tu canal de venta completo puede ser WhatsApp.',
      },
    ],
    related: [
      { to: '/software-delivery', label: 'Gestionar el reparto de esos pedidos' },
      { to: '/menu-digital-qr', label: 'El catálogo en línea que arma el pedido' },
      { to: '/autopedido-comandas', label: 'Pedidos dentro del local' },
    ],
  },
  {
    // Cluster D — KP: sistema de delivery para restaurantes
    slug: 'software-delivery',
    title: 'Sistema de delivery para restaurantes | QuickTap',
    description:
      'Gestiona tu delivery propio sin comisiones por pedido: zonas de reparto con tarifas por mapa, repartidores, estados del pedido y confirmación por WhatsApp.',
    eyebrow: 'Delivery propio',
    h1: 'Sistema de delivery para tu restaurante, sin comisiones por pedido',
    intro: [
      'Las apps de reparto te cobran un porcentaje de cada venta y se quedan con los datos de tus clientes. Con el sistema de delivery de QuickTap gestionas tu reparto propio: los pedidos entran por tu canal, tus repartidores los llevan y el cliente es tuyo.',
      'Defines tus zonas de reparto dibujándolas en un mapa, cada una con su tarifa — el costo del envío se calcula solo según dónde está el cliente. Los pedidos avanzan por estados (recibido, en cocina, despachado) y puedes asignar cada entrega a un repartidor de tu equipo.',
    ],
    features: [
      { title: 'Zonas y tarifas por mapa', text: 'Dibuja tus zonas de reparto en el mapa y asígnale precio a cada una: el envío se cobra según la ubicación real del cliente.' },
      { title: 'Repartidores propios', text: 'Registra a tus repartidores y asigna cada pedido; queda trazado quién llevó qué y cuándo salió.' },
      { title: 'Estados del pedido en vivo', text: 'Recibido, en preparación, despachado — todo el equipo ve el tablero de delivery en tiempo real.' },
      { title: 'Entrada por WhatsApp', text: 'El pedido llega armado por tu canal de WhatsApp, con dirección y punto en el mapa incluidos.' },
      { title: 'Asignación automática opcional', text: 'Si lo prefieres, el pedido pagado se asigna o se despacha solo, según tu configuración.' },
      { title: 'Dark kitchens y pizzerías', text: 'Sin salón no hay problema: el flujo completo — pedido, cocina, reparto — funciona sin una sola mesa.' },
    ],
    faq: [
      {
        q: '¿Cómo se calcula el costo de envío de cada pedido?',
        a: 'Por zona: dibujas tus zonas de reparto en un mapa y le pones tarifa a cada una. También puedes cobrar por distancia desde tu local o fijar el envío a mano, pedido por pedido.',
      },
      {
        q: '¿QuickTap pone los repartidores?',
        a: 'No — y esa es la ventaja: es tu delivery propio, con tu gente y sin comisiones por pedido. QuickTap organiza el flujo: pedidos, zonas, asignación y estados.',
      },
      {
        q: '¿Sirve si también uso apps de reparto de terceros?',
        a: 'Sí. Muchos locales mantienen las apps para descubrimiento y usan QuickTap como canal directo, donde el margen es mejor y el cliente queda registrado como tuyo.',
      },
      {
        q: '¿Qué pasa si el cliente está fuera de mis zonas de reparto?',
        a: 'El sistema se lo indica al armar el pedido, antes de que tú pierdas tiempo: puede elegir retirar en el local o consultar por WhatsApp.',
      },
    ],
    related: [
      { to: '/pedidos-whatsapp', label: 'El canal por donde entra el pedido' },
      { to: '/inventario-costos', label: 'Insumos descontados con cada venta' },
      { to: '/precios', label: 'Planes y precios' },
    ],
  },
  {
    // Cluster E — KP: pantallas menú digital para restaurantes
    slug: 'menu-pantalla-tv',
    title: 'Pantallas de menú digital para restaurantes | QuickTap',
    description:
      'Convierte cualquier TV en la cartelera digital de tu negocio: precios siempre al día en $ y Bs, agotados que se ocultan solos y promociones destacadas.',
    eyebrow: 'Menú en pantalla',
    h1: 'Pantallas de menú digital: tu carta en la TV del local',
    intro: [
      'Convierte cualquier televisor o pantalla en la cartelera digital de tu negocio. La pantalla rota tus productos con nombre y precio, siempre sincronizada con tu catálogo: cambias un precio en el panel y la TV lo muestra al segundo.',
      'No necesitas equipos especiales: abres QuickTap en el navegador de una smart TV, un mini-PC o cualquier computadora conectada a la pantalla, con un rol de solo lectura pensado para eso. Los productos agotados desaparecen solos de la pantalla, así nadie pide lo que no hay.',
    ],
    features: [
      { title: 'Cualquier TV sirve', text: 'Smart TV, mini-PC o computadora vieja: si abre un navegador, es tu pantalla de menú.' },
      { title: 'Precios en $ y Bs al día', text: 'La tasa BCV se actualiza sola: la pantalla nunca muestra un precio viejo.' },
      { title: 'Agotados fuera, solos', text: 'Lo que se marca agotado en el panel desaparece de la pantalla sin tocar nada.' },
      { title: 'Eliges qué se muestra', text: 'Todo el catálogo, ciertas categorías o productos puntuales — con ritmo de rotación configurable.' },
      { title: 'Pantalla de números', text: 'Para retiro en barra: el cliente ve su número en pantalla cuando su pedido está listo.' },
      { title: 'Modo cartelera', text: 'Una imagen de portada a pantalla completa para promos o ambiente, cuando no quieres mostrar la carta.' },
    ],
    faq: [
      {
        q: '¿Qué necesito para poner mi menú en una pantalla?',
        a: 'Un televisor con navegador (o conectado a cualquier computadora) e internet. Inicias sesión con el rol Pantalla y listo — no hay que instalar nada ni comprar hardware especial.',
      },
      {
        q: '¿La pantalla se actualiza sola cuando cambio un precio?',
        a: 'Sí. La pantalla lee tu catálogo en vivo: precios nuevos, productos nuevos y agotados se reflejan sin tocar la TV.',
      },
      {
        q: '¿Puedo mostrar solo las promociones en la pantalla?',
        a: 'Sí. Eliges si rota todo el menú, categorías específicas o una selección de productos — por ejemplo, solo tus promos del día.',
      },
    ],
    related: [
      { to: '/menu-digital-qr', label: 'La carta QR en el teléfono del cliente' },
      { to: '/autopedido-comandas', label: 'Kiosco de autoservicio y números' },
      { to: '/precios', label: 'Planes y precios' },
    ],
  },
  {
    // Cluster F — KP: sistema de inventario para restaurante
    slug: 'inventario-costos',
    title: 'Sistema de inventario y costeo para restaurantes | QuickTap',
    description:
      'Control de inventario para restaurantes con recetas y escandallos: cada plato vendido descuenta sus ingredientes solo, costo por plato al día y alertas de agotados.',
    eyebrow: 'Inventario y costos',
    h1: 'Sistema de inventario y costeo para tu restaurante',
    intro: [
      'El control de inventario de un restaurante no es contar cajas: es saber cuánto cuesta cada plato y cuánto insumo se va con cada venta. En QuickTap defines la receta de cada plato — su escandallo o ficha técnica — y cada vez que un plato se sirve, sus ingredientes se descuentan solos del inventario.',
      'El costo de cada plato se calcula en vivo desde el precio de sus insumos: si el queso sube, ves al momento cómo queda tu margen. Y cuando un insumo se está agotando, el sistema te avisa antes de que la cocina se entere a mitad de servicio.',
    ],
    screenshot: {
      src: '/images/restaurant-inventario-captura.jpg',
      alt: 'Alertas de inventario de un restaurante con los insumos agotados y por agotarse',
    },
    features: [
      { title: 'Recetas y escandallos por plato', text: 'Cada plato con sus ingredientes y cantidades: la ficha técnica que descuenta stock con cada venta.' },
      { title: 'Descuento automático al servir', text: 'Se sirvió el plato, se descontaron sus insumos. Sin conteos a mano después del turno.' },
      { title: 'Costo por plato en vivo', text: 'El costo se recalcula con el precio actual de los insumos — margen real, no el de hace tres meses.' },
      { title: 'Alertas de agotados y por agotarse', text: 'Stock mínimo por insumo y un tablero de alertas para comprar a tiempo.' },
      { title: 'Compras y proveedores', text: 'Registra compras con su proveedor y reabastece el inventario en el mismo movimiento.' },
      { title: 'Gastos del negocio', text: 'Los gastos operativos se registran con su categoría y proveedor, y alimentan el balance del panel de administración.' },
    ],
    faq: [
      {
        q: '¿Qué es el escandallo de un plato y para qué sirve?',
        a: 'Es la ficha técnica: los ingredientes y cantidades exactas que lleva un plato. Con el escandallo cargado, QuickTap calcula el costo real del plato y descuenta el inventario automáticamente con cada venta.',
      },
      {
        q: '¿Puedo llevar inventario sin cargar recetas?',
        a: 'Sí. Puedes llevar el costo de cada producto a mano y usar el inventario para insumos sueltos; las recetas son el siguiente nivel, disponible en los planes superiores.',
      },
      {
        q: '¿El inventario sirve para varias sucursales?',
        a: 'Sí. Con el plan de sucursales, cada sede lleva su propio inventario y la casa matriz ve el consolidado, incluyendo traslados de insumos entre sedes.',
      },
      {
        q: '¿Cómo sé cuánto gané realmente en el mes?',
        a: 'El panel de administración cruza ventas, costos y gastos: balance, ingresos y egresos del período, con cada movimiento trazado.',
      },
    ],
    related: [
      { to: '/autopedido-comandas', label: 'Las ventas que descuentan el inventario' },
      { to: '/precios', label: 'Qué plan incluye recetas' },
      { to: '/comparativa', label: 'Cómo comparar sistemas para tu restaurante' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Cluster H — verticales por tipo de negocio: la misma oferta reempaquetada.
// No repiten el copy de los servicios: lo referencian (regla del plan SEO).
// ---------------------------------------------------------------------------

export interface SeoVerticalPage {
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: string[];
  /** Qué resuelve QuickTap para este negocio, enlazando al servicio que lo explica. */
  points: { title: string; text: string; to: string }[];
  faq: SeoFaq[];
}

export const SEO_VERTICALS: SeoVerticalPage[] = [
  {
    slug: 'bares',
    title: 'Software para bares y restaurantes | QuickTap',
    description:
      'Sistema para bares: pedidos desde la mesa o la barra, cuentas abiertas por mesa, cobro dividido entre amigos e inventario de botellas e insumos.',
    h1: 'Software para bares y restaurantes',
    intro: [
      'En un bar la cuenta vive abierta toda la noche y el cobro casi nunca es de una sola persona. QuickTap está hecho para ese ritmo: cada mesa acumula sus rondas en una sola cuenta, y al cierre se paga completa, dividida en partes iguales o por el consumo de cada quien.',
      'Las rondas pedidas desde el teléfono llegan directo a la barra, y el inventario de botellas e insumos se descuenta con cada venta.',
    ],
    points: [
      { title: 'Rondas sin mesero de por medio', text: 'El cliente pide desde la mesa y la orden cae en la barra al instante.', to: '/autopedido-comandas' },
      { title: 'Carta QR con precios al día', text: 'Cócteles y botellas en $ y Bs a tasa BCV, sin reimprimir nada.', to: '/menu-digital-qr' },
      { title: 'Inventario de botellas', text: 'Cada trago descuenta su receta; las botellas por agotarse avisan solas.', to: '/inventario-costos' },
    ],
    faq: [
      {
        q: '¿Se puede dividir la cuenta de una mesa entre varios?',
        a: 'Sí: cuenta completa, partes iguales o cada quien lo suyo — cada pago con su método y su referencia, en la misma cuenta de la mesa.',
      },
      {
        q: '¿Cómo evito que una mesa pida a nombre de otra?',
        a: 'Cada mesa tiene su QR único y puede fijar un PIN tras el primer pedido: solo quien lo conoce agrega rondas a esa cuenta.',
      },
    ],
  },
  {
    slug: 'cafeterias',
    title: 'Software para cafeterías | QuickTap',
    description:
      'Sistema para cafeterías: carta QR con fotos, pedidos que llegan directo a la barra, venta para llevar y control de insumos como café, leche y azúcar.',
    h1: 'Software para cafeterías',
    intro: [
      'El volumen de una cafetería está en la rapidez: mucha rotación, tickets pequeños y clientes que quieren su bebida ya. QuickTap agiliza el mostrador con pedidos que llegan directo a la barra y un kiosco de autoservicio para las horas pico.',
      'Los insumos que más duelen — café, leche, vasos — se descuentan por receta con cada bebida vendida, así sabes tu costo real por taza.',
    ],
    points: [
      { title: 'Pedido en mesa o para llevar', text: 'El cliente escanea, pide y retira cuando su número aparece en pantalla.', to: '/autopedido-comandas' },
      { title: 'Carta visual con fotos', text: 'Bebidas y postres con foto, en el teléfono del cliente, siempre actualizada.', to: '/menu-digital-qr' },
      { title: 'Costo real por taza', text: 'Recetas por bebida: cada venta descuenta café, leche y demás insumos.', to: '/inventario-costos' },
    ],
    faq: [
      {
        q: '¿Funciona para el mostrador de "pide y retira"?',
        a: 'Sí: el kiosco de autoservicio toma el pedido y la pantalla de números avisa cuándo retirar — sin nadie gritando nombres.',
      },
      {
        q: '¿Puedo mostrar la carta en una pantalla detrás de la barra?',
        a: 'Sí, cualquier TV con navegador sirve como pantalla de menú, sincronizada con tus precios del día.',
      },
    ],
  },
  {
    slug: 'pizzerias',
    title: 'Software para pizzerías: pedidos y delivery | QuickTap',
    description:
      'Sistema para pizzerías: tamaños y extras por variante, pedidos por WhatsApp, delivery con zonas de reparto e ingredientes descontados por receta.',
    h1: 'Software para pizzerías',
    intro: [
      'Una pizza nunca es un solo producto: es tamaño, masa, borde y extras. En QuickTap cada pizza se configura con sus variantes y modificadores, y el precio se arma solo según lo que el cliente elige.',
      'La mayor parte de la venta de una pizzería sale por delivery — y ahí QuickTap junta las dos piezas: el pedido entra armado por WhatsApp y el reparto se gestiona con zonas y repartidores propios, sin pagar comisión por pedido.',
    ],
    points: [
      { title: 'Pedidos por WhatsApp completos', text: 'Tamaño, extras, dirección y total calculado — nada que transcribir.', to: '/pedidos-whatsapp' },
      { title: 'Delivery con zonas por mapa', text: 'Cada zona con su tarifa; tus repartidores, tus márgenes.', to: '/software-delivery' },
      { title: 'Ingredientes por receta', text: 'Queso, masa y toppings se descuentan con cada pizza vendida.', to: '/inventario-costos' },
    ],
    faq: [
      {
        q: '¿Puedo cobrar distinto según el tamaño y los extras?',
        a: 'Sí: variantes (personal, mediana, familiar) y modificadores (extras, bordes) con su precio cada uno — el total se calcula solo.',
      },
      {
        q: '¿Sirve para una pizzería solo-delivery, sin mesas?',
        a: 'Sí. Sin salón, tu canal completo es el catálogo en línea + WhatsApp + el tablero de reparto. Ninguna mesa es obligatoria.',
      },
    ],
  },
  {
    slug: 'comida-rapida',
    title: 'Software para comida rápida | QuickTap',
    description:
      'Sistema para comida rápida: kiosco de autoservicio, pantalla de números para retirar, combos con modificadores y cola de cocina en tiempo real.',
    h1: 'Software para comida rápida',
    intro: [
      'En comida rápida la fila es el enemigo. QuickTap la ataca por los dos lados: un kiosco de autoservicio donde el cliente ordena sin esperar a que lo atiendan, y una pantalla de números que avisa cuándo retirar — el mostrador queda libre para entregar, no para anotar.',
      'Los combos se arman con modificadores (término, salsas, acompañantes) y cada orden entra a la cola de cocina en tiempo real.',
    ],
    points: [
      { title: 'Kiosco de autoservicio', text: 'El cliente ordena y paga en el kiosco; su orden entra directo a cocina.', to: '/autopedido-comandas' },
      { title: 'Pedidos por WhatsApp', text: 'Para llevar o a domicilio, el pedido llega armado y con total.', to: '/pedidos-whatsapp' },
      { title: 'Menú en la pantalla del local', text: 'Combos y promos en la TV, con precios que se actualizan solos.', to: '/menu-pantalla-tv' },
    ],
    faq: [
      {
        q: '¿Qué necesito para montar el kiosco de autoservicio?',
        a: 'Una tablet o computadora con navegador en modo kiosco. Se inicia sesión con el rol Comanda y queda a pantalla completa, con tus colores.',
      },
      {
        q: '¿Cómo sabe el cliente que su orden está lista?',
        a: 'Su número aparece en la pantalla de retiro en cuanto cocina marca la orden como lista — sin gritar nombres ni repartir timbres.',
      },
    ],
  },
  {
    slug: 'food-trucks',
    title: 'Software para food trucks | QuickTap',
    description:
      'Sistema para food trucks: menú QR sin imprimir nada, pedidos por WhatsApp, pantalla de números y todo desde un teléfono — sin equipos costosos.',
    h1: 'Software para food trucks',
    intro: [
      'Un food truck no tiene espacio para cajas registradoras ni carpetas de menús. QuickTap corre entero desde un teléfono: tu carta es un QR pegado en el camión, los pedidos entran solos y tú cocinas.',
      'Si cambias de punto, tu negocio se muda contigo — el mismo QR, el mismo enlace, los mismos clientes.',
    ],
    points: [
      { title: 'Carta QR sin imprimir menús', text: 'Un QR en el camión y la carta vive en el teléfono del cliente.', to: '/menu-digital-qr' },
      { title: 'Pedidos por WhatsApp', text: 'Encargos y ventas para retirar, armados y con total calculado.', to: '/pedidos-whatsapp' },
      { title: 'Retiro por número', text: 'El cliente ve su número en una pantalla o tablet cuando su orden está lista.', to: '/autopedido-comandas' },
    ],
    faq: [
      {
        q: '¿Necesito comprar algún equipo especial?',
        a: 'No. Con tu teléfono alcanza para empezar; una tablet para la cola de cocina o los números es opcional.',
      },
      {
        q: '¿Sirve sin punto fijo?',
        a: 'Sí: tu enlace y tu QR no dependen de la ubicación. Publicas dónde estarás y el resto sigue igual.',
      },
    ],
  },
  {
    slug: 'taquerias',
    title: 'Software para taquerías | QuickTap',
    description:
      'Sistema para taquerías: órdenes con extras y salsas por modificador, servicio en mesa o para llevar y control de insumos por receta.',
    h1: 'Software para taquerías',
    intro: [
      'Una orden de tacos se personaliza taco por taco: con todo, sin cebolla, salsa aparte. QuickTap maneja esa variedad con modificadores por producto, para que la orden llegue a la plancha exactamente como el cliente la pidió.',
      'En mesa o para llevar, la orden entra sola a la cola de cocina, y los insumos — tortillas, proteína, salsas — se descuentan por receta.',
    ],
    points: [
      { title: 'Órdenes con extras y salsas', text: 'Modificadores por taco: la comanda llega a la plancha sin malentendidos.', to: '/autopedido-comandas' },
      { title: 'Carta QR en la mesa', text: 'El cliente pide desde su teléfono, la orden cae en cocina.', to: '/menu-digital-qr' },
      { title: 'Insumos por receta', text: 'Tortillas y proteína descontadas con cada orden vendida.', to: '/inventario-costos' },
    ],
    faq: [
      {
        q: '¿Puedo cobrar los extras de cada taco por separado?',
        a: 'Sí: cada modificador puede tener precio propio (extra queso, doble proteína) y se suma solo al total.',
      },
      {
        q: '¿Funciona para el mostrador de para llevar?',
        a: 'Sí: pedidos para retirar por WhatsApp o en un kiosco de autoservicio, con aviso por número cuando la orden está lista.',
      },
    ],
  },
  {
    slug: 'pollerias',
    title: 'Software para pollerías | QuickTap',
    description:
      'Sistema para pollerías: combos por ración, pedidos por WhatsApp con delivery por zonas y control de inventario de pollo, guarniciones y empaques.',
    h1: 'Software para pollerías',
    intro: [
      'La pollería vive de raciones y combos: pollo entero, medio, cuarto, con sus guarniciones. En QuickTap cada combo se arma con variantes y acompañantes, y el precio del combo se calcula solo.',
      'El grueso de la venta sale a domicilio: el pedido entra armado por WhatsApp y el reparto se organiza por zonas con tarifas propias — sin comisiones de apps de terceros.',
    ],
    points: [
      { title: 'Combos por ración', text: 'Entero, medio o cuarto, con guarniciones como modificadores.', to: '/menu-digital-qr' },
      { title: 'Pedidos por WhatsApp', text: 'El encargo llega completo, con dirección y total en Bs a tasa del día.', to: '/pedidos-whatsapp' },
      { title: 'Delivery por zonas', text: 'Tarifas por zona en el mapa y repartidores propios.', to: '/software-delivery' },
    ],
    faq: [
      {
        q: '¿Puedo controlar cuántos pollos me quedan?',
        a: 'Sí: con recetas por ración, cada venta descuenta su parte del inventario — pollo, guarniciones y hasta los empaques del delivery.',
      },
      {
        q: '¿El cliente puede pedir para una hora específica?',
        a: 'Puede indicarlo en la nota del pedido; el encargo queda registrado en el panel y visible para cocina con su detalle completo.',
      },
    ],
  },
];

export function getSeoService(slug: string): SeoServicePage | undefined {
  return SEO_SERVICES.find((s) => s.slug === slug);
}

export function getSeoVertical(slug: string): SeoVerticalPage | undefined {
  return SEO_VERTICALS.find((v) => v.slug === slug);
}
