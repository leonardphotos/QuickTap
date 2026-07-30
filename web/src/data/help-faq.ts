import type { UserRole } from '../types';

export type HelpFaqCategory = 'productos' | 'delivery' | 'equipo' | 'mesas' | 'cobros' | 'ajustes' | 'inventario';

export const HELP_CATEGORY_LABELS: Record<HelpFaqCategory, string> = {
  productos: 'Productos y menú',
  delivery: 'Delivery',
  equipo: 'Equipo y empleados',
  mesas: 'Mesas, pedidos y reservas',
  cobros: 'Cobros y caja',
  ajustes: 'Ajustes',
  inventario: 'Inventario',
};

export interface HelpFaqEntry {
  id: string;
  /** Agrupa la pregunta en el menú de temas — así el chat no muestra las ~20 preguntas de una vez. */
  category: HelpFaqCategory;
  question: string;
  /** Términos extra que deben encontrar esta respuesta aunque no aparezcan en `question`. */
  keywords: string[];
  /** Quién puede ver esta pregunta. Sin esto, un Mesero vería pasos de pantallas que no puede abrir. */
  roles: UserRole[];
  /** Puede tener varias líneas (se muestran como párrafos/pasos separados). */
  answer: string;
}

// Base fija de preguntas frecuentes para el asistente de Ayuda del panel — sin IA,
// búsqueda por palabras clave. Pensada para quien recién está aprendiendo a usar
// QuickTap (Dueño, Administrador, Cajero, Mesero). Ver HelpChatWidget.tsx.
export const HELP_FAQ: HelpFaqEntry[] = [
  {
    id: 'delivery-price',
    category: 'delivery',
    question: '¿Cómo pongo el precio del delivery?',
    keywords: ['delivery', 'envio', 'envío', 'costo de envio', 'tarifa', 'flete', 'zona', 'zonas', 'distancia', 'km'],
    roles: ['OWNER', 'ADMIN'],
    answer:
      'Ve a Ajustes → Delivery.\n\nAhí eliges cómo se cobra el envío:\n1. "Por distancia": una tarifa base + un precio por km desde la ubicación de tu local.\n2. "Por zona": dibujas zonas en un mapa y le pones un precio fijo a cada una (Ajustes → Delivery → Zonas).\n\nSi el envío queda en 0 o no aparece, revisa que hayas guardado la ubicación de tu local en esa misma pantalla.',
  },
  {
    id: 'create-employee',
    category: 'equipo',
    question: '¿Cómo creo el perfil de un empleado?',
    keywords: ['empleado', 'trabajador', 'usuario', 'cuenta', 'equipo', 'agregar mesero', 'agregar cajero', 'nuevo usuario', 'personal', 'staff'],
    roles: ['OWNER', 'ADMIN'],
    answer:
      'Ve a Ajustes → Equipo → "Agregar miembro".\n\nCompleta su nombre, usuario y contraseña, y elige el rol (Dueño, Administrador, Cajero, Mesero, Cocina, Pantalla, Comanda o Numero) — el rol define qué pantallas puede abrir y qué puede hacer.\n\nA un Mesero también le puedes asignar mesas específicas desde esa misma pantalla, tocando su nombre.',
  },
  {
    id: 'change-employee-role',
    category: 'equipo',
    question: '¿Cómo cambio el rol o borro a un empleado?',
    keywords: ['cambiar rol', 'editar empleado', 'eliminar empleado', 'borrar usuario', 'quitar acceso', 'contraseña empleado'],
    roles: ['OWNER', 'ADMIN'],
    answer:
      'Ve a Ajustes → Equipo, toca el nombre del empleado. Ahí puedes cambiar su rol, reiniciar su contraseña, o borrarlo del equipo.\n\nBorrar a alguien no borra los pedidos ni ventas que ya hizo, solo le quita el acceso.',
  },
  {
    id: 'add-product',
    category: 'productos',
    question: '¿Cómo agrego un producto nuevo?',
    keywords: ['producto', 'plato', 'crear producto', 'nuevo plato', 'menu', 'menú', 'catalogo', 'catálogo'],
    roles: ['OWNER', 'ADMIN', 'CASHIER'],
    answer:
      'Ve a Productos → "Nuevo producto".\n\nCompleta nombre, precio, categoría y foto. Si el plato tiene tamaños (ej. Personal/Mediana/Familiar) o extras (ej. queso, tocineta), actívalos con "Precio(s): Variantes" y "Agregar modificadores" dentro del mismo formulario.',
  },
  {
    id: 'add-category',
    category: 'productos',
    question: '¿Cómo creo una categoría de productos?',
    keywords: ['categoria', 'categoría', 'seccion del menu', 'sección del menú', 'organizar productos'],
    roles: ['OWNER', 'ADMIN', 'CASHIER'],
    answer:
      'Ve a Productos → "Nueva categoría" y ponle un nombre (ej. "Entradas", "Bebidas", "Postres"). Luego, al crear o editar un producto, lo asignas a esa categoría.',
  },
  {
    id: 'product-out-of-stock',
    category: 'productos',
    question: '¿Cómo marco un producto como agotado?',
    keywords: ['agotado', 'sin stock', 'pausar producto', 'ocultar producto', 'disponible'],
    roles: ['OWNER', 'ADMIN', 'CASHIER'],
    answer:
      'En Productos, toca el botón "Disponible" junto al producto — cambia a "Agotado" y desaparece del menú de tus clientes hasta que lo vuelvas a activar.\n\nSi tienes Inventario activado y el producto está vinculado a un insumo, se marca agotado solo cuando el insumo se acaba.',
  },
  {
    id: 'create-table-qr',
    category: 'mesas',
    question: '¿Cómo creo una mesa y su código QR?',
    keywords: ['mesa', 'qr', 'codigo qr', 'código qr', 'zona', 'imprimir qr'],
    roles: ['OWNER', 'ADMIN', 'CASHIER'],
    answer:
      'Ve a Mesas / QR → "Nueva mesa" (antes crea una Zona si quieres agruparlas, ej. "Terraza", "Salón").\n\nCada mesa genera su propio código QR — tócala para verlo grande o descargarlo e imprimirlo. Cuando un cliente lo escanea, sus pedidos entran directo a esa mesa.',
  },
  {
    id: 'open-close-cash-session',
    category: 'cobros',
    question: '¿Cómo abro y cierro caja?',
    keywords: ['caja', 'abrir caja', 'cerrar caja', 'turno', 'arqueo', 'cuadre'],
    roles: ['OWNER', 'ADMIN', 'CASHIER'],
    answer:
      'Al entrar al panel como Cajero (o desde Administración si eres Dueño/Admin) verás "Abrir caja" — ingresa el monto con el que arrancas.\n\nPara cerrarla, busca "Cerrar caja": te muestra un resumen de ventas del turno para comparar contra lo que tienes físicamente, y queda guardado el resumen para revisarlo después.',
  },
  {
    id: 'add-expense',
    category: 'cobros',
    question: '¿Cómo registro un gasto?',
    keywords: ['gasto', 'egreso', 'compra', 'pago a proveedor', 'salida de dinero'],
    roles: ['OWNER', 'ADMIN', 'CASHIER'],
    answer:
      'Ve a Administración y toca "Añadir egreso" (también puedes hacerlo desde Gastos). Elige la categoría del gasto, si fue en efectivo o Bs/$, y opcionalmente el proveedor.',
  },
  {
    id: 'take-table-order',
    category: 'mesas',
    question: '¿Cómo tomo un pedido en una mesa?',
    keywords: ['tomar pedido', 'nuevo pedido', 'pedido en mesa', 'agregar productos a mesa', 'anadir producto'],
    roles: ['OWNER', 'ADMIN', 'CASHIER', 'WAITER'],
    answer:
      'Ve a Órdenes de Mesa (o la pestaña "Mesas" si eres Mesero) y toca la mesa. Si está libre, se abre el formulario para elegir productos; si ya tiene un pedido abierto, puedes "Añadir producto" para sumar más a la misma cuenta.',
  },
  {
    id: 'print-comanda',
    category: 'cobros',
    question: '¿Cómo imprimo la comanda o el recibo?',
    keywords: ['imprimir', 'comanda', 'ticket', 'recibo', 'factura', 'impresora'],
    roles: ['OWNER', 'ADMIN', 'CASHIER', 'WAITER'],
    answer:
      'Dentro del pedido (o al cobrar), toca "Imprimir" — se manda a la Estación de Impresión conectada en la caja/cocina. También puedes "Descargar" el recibo como imagen si no tienes impresora a mano.',
  },
  {
    id: 'charge-order',
    category: 'cobros',
    question: '¿Cómo cobro un pedido?',
    keywords: ['cobrar', 'pago', 'pagar', 'metodo de pago', 'método de pago', 'dividir cuenta', 'fraccionado'],
    roles: ['OWNER', 'ADMIN', 'CASHIER', 'WAITER'],
    answer:
      'Abre el pedido y toca "Pagar". Puedes cobrar el total completo, dividirlo entre varias personas ("Fraccionado"), o cobrar por ítems específicos. Elige el método de pago (efectivo, pago móvil, tarjeta, etc.) y confirma.',
  },
  {
    id: 'lock-screen',
    category: 'ajustes',
    question: '¿Cómo funciona la clave de pantalla?',
    keywords: ['pin', 'clave', 'bloqueo', 'pantalla de bloqueo', 'desactivar clave'],
    roles: ['OWNER', 'ADMIN', 'CASHIER', 'WAITER'],
    answer:
      'Cada quien crea su propio PIN de 4 dígitos en Ajustes → Pantalla de bloqueo. Pasados unos minutos sin usar el panel, te lo vuelve a pedir — así nadie más usa tu sesión en una tablet compartida.\n\nSolo el Dueño o un Administrador puede desactivar esta función por completo, o cambiar cuántos minutos tarda en pedir el PIN de nuevo, desde esa misma pantalla.',
  },
  {
    id: 'whatsapp-order-message',
    category: 'ajustes',
    question: '¿Cómo cambio el mensaje que se envía por WhatsApp?',
    keywords: ['whatsapp', 'mensaje', 'plantilla', 'enviar pedido'],
    roles: ['OWNER', 'ADMIN'],
    answer:
      'Ve a Ajustes → Mensaje de WhatsApp. Puedes editar la plantilla usando los espacios {{header}}, {{items}} y {{totales}} — se rellenan automáticamente con los datos de cada pedido.',
  },
  {
    id: 'accept-order',
    category: 'mesas',
    question: '¿Por qué un pedido queda esperando y no pasa a cocina?',
    keywords: ['pedido pendiente', 'aceptar pedido', 'no pasa a cocina', 'confirmar pedido'],
    roles: ['OWNER', 'ADMIN', 'CASHIER', 'WAITER'],
    answer:
      'Si activaste "Requiere confirmación" en Ajustes, todo pedido de mesa (QR) queda pendiente hasta que alguien del equipo lo toque y presione "Aceptar". Búscalo en Órdenes de Mesa o en el aviso que aparece arriba de la pantalla.',
  },
  {
    id: 'inventory-low-stock',
    category: 'inventario',
    question: '¿Cómo configuro el aviso de que se está agotando un insumo?',
    keywords: ['inventario', 'insumo', 'stock minimo', 'stock mínimo', 'agotandose', 'agotándose'],
    roles: ['OWNER', 'ADMIN', 'CASHIER'],
    answer:
      'Ve a Inventario, edita el insumo y define su "Stock mínimo". Cuando la cantidad disponible baje de ese número, verás un aviso arriba de la pantalla y una barra roja junto al insumo.',
  },
  {
    id: 'change-plan',
    category: 'ajustes',
    question: '¿Cómo cambio o pago mi plan?',
    keywords: ['plan', 'suscripcion', 'suscripción', 'pagar', 'facturacion', 'facturación', 'precio quicktap'],
    roles: ['OWNER', 'ADMIN'],
    answer:
      'Ve a Ajustes → Facturación. Ahí ves tu plan actual y puedes solicitar un cambio o registrar tu pago — el equipo de QuickTap lo activa manualmente al confirmarlo.',
  },
  {
    id: 'reservations',
    category: 'mesas',
    question: '¿Cómo administro las reservas?',
    keywords: ['reserva', 'reservas', 'aceptar reserva', 'horario', 'agenda'],
    roles: ['OWNER', 'ADMIN', 'CASHIER'],
    answer:
      'Ve a Reservas para ver las que están pendientes de confirmar. El horario en que tus clientes pueden reservar se configura en Ajustes → Horario.',
  },
  {
    id: 'move-order-another-table',
    category: 'mesas',
    question: '¿Cómo cambio un pedido de una mesa a otra?',
    keywords: ['rodar mesa', 'mover mesa', 'cambiar de mesa', 'trasladar pedido'],
    roles: ['OWNER', 'ADMIN', 'CASHIER', 'WAITER'],
    answer:
      'Abre el pedido de la mesa actual y busca el botón "Rodar" — te deja elegir la mesa destino y mueve todo el pedido para allá sin perder lo que ya se pidió.',
  },
];
