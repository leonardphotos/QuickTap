import { Currency, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { UpdateMessageTemplatesInput, UpdatePaymentMethodsInput, UpdatePlanContentInput } from './platform-settings.dto';

/** '$' para USD, '€' para EUR — el único par de símbolos que la mensualidad usa hoy. */
export function currencySymbolFor(currency: Currency): string {
  return currency === 'EUR' ? '€' : '$';
}

const SINGLETON_ID = 'singleton';

export interface MessageTemplates {
  reminderMessage: string;
  proofReceivedMessage: string;
  paymentApprovedMessage: string;
  paymentRejectedMessage: string;
  welcomeMessage: string;
  newSignupAlertMessage: string;
}

/**
 * Textos por defecto de cada mensaje que manda el bot del master (Dashboard maestro →
 * Chatbot → Mensajes). Editable parcialmente desde ahí; lo no editado sigue usando esto.
 * Placeholders disponibles por mensaje (se reemplazan con renderTemplate más abajo):
 * - reminderMessage: {{restaurantName}} {{periodEndLabel}} {{amountLine}} {{chargesBlock}} {{pagoMovilBlock}}
 * - paymentApprovedMessage: {{periodEndLabel}}
 * - welcomeMessage: {{ownerName}} {{restaurantName}}
 * - newSignupAlertMessage: {{restaurantName}} {{ownerName}} {{businessType}} {{slug}} — va al
 *   número verificador (Ajustes → WhatsApp), no al restaurante nuevo.
 * - proofReceivedMessage / paymentRejectedMessage: sin variables.
 */
export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplates = {
  reminderMessage: [
    '⏰ *Recordatorio de pago — QuickTap*',
    '',
    'Hola 👋 El plan de *{{restaurantName}}* vence el {{periodEndLabel}}.',
    '{{amountLine}}',
    '{{chargesBlock}}',
    '{{pagoMovilBlock}}',
    '📸 Responde este mensaje con la foto de tu comprobante de pago para renovar tu plan automáticamente.',
  ].join('\n'),
  proofReceivedMessage: '📥 Recibimos tu comprobante, estamos confirmando tu pago para renovar tu plan.',
  paymentApprovedMessage: '✅ *Pago confirmado*\n\nTu plan en QuickTap fue renovado hasta el {{periodEndLabel}}. ¡Gracias por seguir con nosotros! 🙌',
  paymentRejectedMessage: '⚠️ No pudimos confirmar tu pago. Por favor reenvía la foto de tu comprobante.',
  welcomeMessage: [
    '¡Hola {{ownerName}}! 👋 Bienvenido/a a *QuickTap.club* 🎉',
    '',
    'Tu cuenta para *{{restaurantName}}* ya está lista, con 15 días de prueba gratis y el plan más completo activado.',
    '',
    'Cualquier duda, escríbenos por este mismo chat. ¡Éxitos con tu negocio! 🚀',
  ].join('\n'),
  newSignupAlertMessage: [
    '🆕 Nuevo ingreso a QuickTap',
    '',
    '{{restaurantName}} ({{slug}})',
    'Dueño: {{ownerName}}',
    'Tipo: {{businessType}}',
  ].join('\n'),
};

/** Sustituye `{{variable}}` en una plantilla — variable ausente del mapa se reemplaza por
 * cadena vacía (así una línea condicional como {{pagoMovilBlock}} desaparece sola). */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
    .replace(/\n{3,}/g, '\n\n') // evita huecos de líneas en blanco cuando un placeholder queda vacío
    .trim();
}

export type PurchasablePlan = 'DELIVERY' | 'PRO' | 'ELITE' | 'SHOP' | 'ELITE_SHOP' | 'CLUB' | 'OFFICE';
export type PlanBillingCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

export interface PlanContentEntry {
  name: string;
  subtitle: string;
  capacity: string;
  features: string[];
  prices: Record<PlanBillingCycle, number>;
}

export type PlanContent = Record<PurchasablePlan, PlanContentEntry>;

/**
 * Valores por defecto (precios/descripción) de los 3 planes vigentes. Única
 * fuente de verdad para el precio de facturación (ver resolvePrice() en
 * plan-request.service.ts) — lo editable desde el Dashboard maestro se
 * fusiona sobre esto, así que un plan nunca queda a medio configurar. Los
 * tres incluyen sucursales ILIMITADAS (ver allowsBranches en subscription.ts).
 */
/**
 * Beneficios del chatbot de WhatsApp (ver whatsapp-bot.service.ts y
 * order-payment-verification.service.ts) — incluido en los 3 planes por
 * igual, así que se repite tal cual en cada `features`.
 */
const CHATBOT_FEATURES = [
  'Chatbot de WhatsApp vinculado a tu propio número, sin apps externas ni comisiones',
  'Responde solo con el menú apenas alguien te escribe por primera vez',
  'Manda los datos de pago y el monto exacto a cancelar apenas se crea el pedido',
  'Recibe la foto del comprobante, la verifica contigo y manda el pedido a cocina solo al aprobarla',
];

export const DEFAULT_PLAN_CONTENT: PlanContent = {
  DELIVERY: {
    name: 'Solo Delivery',
    subtitle: 'Cocinas fantasma o solo pedidos por WhatsApp',
    capacity: 'Sucursales ilimitadas — sin mesas ni códigos QR',
    features: [
      'Productos, Cocinas y Sección de Delivery en cada sucursal',
      'Pedidos ilimitados',
      'Hasta 6 usuarios de tu equipo',
      ...CHATBOT_FEATURES,
    ],
    prices: { MONTHLY: 24.99, QUARTERLY: 22.74, SEMIANNUAL: 20.49, ANNUAL: 17.5 },
  },
  PRO: {
    name: 'Plan Pro',
    subtitle: 'La operación completa de tu restaurante',
    capacity: 'Mesas y pedidos ilimitados',
    features: [
      'Usuarios ilimitados',
      'Administración: resumen, estadísticas, productos, delivery y métodos de pago',
      'Inventario por stock: existencias, compras y alertas de agotados',
      'Registro de gastos',
      ...CHATBOT_FEATURES,
    ],
    prices: { MONTHLY: 29.99, QUARTERLY: 26.99, SEMIANNUAL: 23.99, ANNUAL: 20.8333 },
  },
  ELITE: {
    name: 'Plan Elite',
    subtitle: 'Todo lo del Plan Pro + administración completa, sin límite de sucursales',
    capacity: 'Sucursales ilimitadas, cada una con mesas y pedidos ilimitados',
    features: [
      'Todo el Plan Pro en cada sucursal',
      'Administración completa: contabilidad con Excel, cuentas bancarias, proveedores, libros fiscales y órdenes de pago',
      'CRM: clientes por segmento y promociones con código canjeable',
      'Historial de pedidos, margen de utilidad y cuentas por cobrar',
      'Inventario por receta y producción',
      'Catálogo, inventario y equipo por sucursal',
      'Reporte consolidado de ventas entre sucursales',
      'Productos más vendidos por sucursal',
      'Soporte prioritario 24/7 por WhatsApp',
      'Gerente de cuenta dedicado',
      'Onboarding y migración de catálogo sin costo',
      'Acceso anticipado a nuevas funcionalidades',
      ...CHATBOT_FEATURES,
    ],
    prices: { MONTHLY: 59.99, QUARTERLY: 45.49, SEMIANNUAL: 40.99, ANNUAL: 37.5 },
  },
  SHOP: {
    name: 'QuickTap Shop',
    subtitle: 'La operación diaria de tu local: tiendas, ropa, calzado, ferreterías, farmacias y más',
    capacity: 'Un solo local, ventas ilimitadas',
    features: [
      'Punto Pago: sube tu QR de Pago Móvil una sola vez y cóbralo con el monto en Bs y la tasa del día en una sola pantalla',
      'Inventario con foto obligatoria, variantes de talla/color o stock básico',
      'Punto de venta con escaneo por cámara o lector, y carrito flotante con el total en $ y Bs',
      'Acepta Efectivo Bs/$, Pago Móvil, Zelle, Binance y ventas fiadas (completas o con abono)',
      'Caja: apertura, cierre y arqueo con historial de informes',
      'Cuentas por cobrar de ventas fiadas',
      'CRM: clientes por segmento y promociones con código canjeable',
      'Ingresos por método de pago, gastos y productos más vendidos',
      'Alertas de stock bajo y productos próximos a vencer',
      'Roles de equipo (Dueño, Administrador, Cajero)',
    ],
    prices: { MONTHLY: 20, QUARTERLY: 18, SEMIANNUAL: 16, ANNUAL: 14.1667 },
  },
  ELITE_SHOP: {
    name: 'Elite Shop',
    subtitle: 'Todo lo de QuickTap Shop + administración completa y sucursales',
    capacity: 'Sucursales ilimitadas, cada una con su propio inventario y caja',
    features: [
      'Todo QuickTap Shop en cada sucursal',
      'Contabilidad completa: libro de ingresos y egresos con exportación e importación en Excel',
      'Cuentas bancarias por método de pago con saldo automático y transferencias',
      'Proveedores con relación de cuenta y órdenes de pago con retenciones',
      'Libros de compras y ventas',
      'Margen de utilidad y punto de equilibrio',
      'Sucursales: catálogo copiado, inventario y caja por sede, y ventas consolidadas',
      'Soporte prioritario por WhatsApp',
    ],
    prices: { MONTHLY: 50, QUARTERLY: 45, SEMIANNUAL: 40, ANNUAL: 35 },
  },
  OFFICE: {
    name: 'QuickTap Administración',
    subtitle: 'Contabilidad y administración de una o varias empresas, desde una sola cuenta',
    capacity: 'Empresas ilimitadas, cada una con sus propios libros',
    features: [
      'Varias empresas en la misma cuenta, con su propia moneda y ejercicio fiscal',
      'Plan de cuentas jerárquico, listo para usar desde el primer día',
      'Libro diario con partida doble: el asiento no se guarda si no cuadra',
      'Anulación con contra-asiento: nada se borra, todo queda trazable',
      'Balance de comprobación, estado de resultados y balance general',
      'Clientes, proveedores y empleados por empresa',
      'Soporte por WhatsApp',
    ],
    prices: { MONTHLY: 29.99, QUARTERLY: 26.99, SEMIANNUAL: 23.99, ANNUAL: 20.8333 },
  },
  CLUB: {
    name: 'QuickTap Club',
    subtitle: 'Todos los beneficios de QuickTap para canchas y clubes deportivos',
    capacity: 'Un solo plan, con todo incluido',
    features: [
      'Calendario de canchas en vivo, con reservas y bloqueos por mantenimiento/clases/torneos',
      'Acceso por QR/código: el jugador entra a su reserva sin pasar por recepción',
      'Tablet de cancha: pedidos a la tienda del club y cobro con el monto en Bs y la tasa del día',
      'Hasta 4 tiendas vinculadas, cada una cobrando lo suyo con su propio método de pago',
      'Academia: programas, horarios y lista de espera',
      'Caja: apertura, cierre y arqueo con historial de informes',
      'Directorio de jugadores y roles de equipo (Dueño, Administrador, Cajero, Cancha)',
    ],
    prices: { MONTHLY: 50, QUARTERLY: 45, SEMIANNUAL: 40, ANNUAL: 35 },
  },
};

function mergePlanContent(stored: Partial<PlanContent> | null | undefined): PlanContent {
  const result = {} as PlanContent;
  for (const plan of Object.keys(DEFAULT_PLAN_CONTENT) as PurchasablePlan[]) {
    const base = DEFAULT_PLAN_CONTENT[plan];
    const override = stored?.[plan];
    result[plan] = {
      name: override?.name ?? base.name,
      subtitle: override?.subtitle ?? base.subtitle,
      capacity: override?.capacity ?? base.capacity,
      features: override?.features ?? base.features,
      prices: { ...base.prices, ...override?.prices },
    };
  }
  return result;
}

export const platformSettingsService = {
  /**
   * Datos de pago mostrados en la pasarela (landing + billing autenticado),
   * más los interruptores globales de Ramblay/pago manual. Público: sin secretos.
   */
  /** Moneda de cobro de la mensualidad (Dashboard maestro → Planes). Default USD si nunca se
   * tocó — mismo default que el campo en el schema, por si la fila del singleton no existe aún. */
  async getSubscriptionCurrency(): Promise<Currency> {
    const row = await prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID }, select: { subscriptionCurrency: true } });
    return row?.subscriptionCurrency ?? 'USD';
  },

  /** Cambia la moneda de cobro. No recalcula ningún precio ya cargado — ver el comentario en
   * el campo del schema: solo cambia con qué símbolo se muestran y se cobran de ahí en adelante. */
  async setSubscriptionCurrency(currency: Currency): Promise<Currency> {
    const row = await prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, subscriptionCurrency: currency },
      update: { subscriptionCurrency: currency },
      select: { subscriptionCurrency: true },
    });
    return row.subscriptionCurrency;
  },

  /** Número verificador de pagos de suscripción (Dashboard maestro → WhatsApp) — a quien se le
   * reenvía el comprobante de un pago único para que lo apruebe. Null si nunca se configuró. */
  async getSubscriptionVerifierPhone(): Promise<string | null> {
    const row = await prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID }, select: { subscriptionVerifierPhone: true } });
    return row?.subscriptionVerifierPhone ?? null;
  },

  async getPaymentMethods() {
    const row = await prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID } });
    return {
      ...((row?.paymentMethods as object) ?? {}),
      ramblayEnabled: row?.ramblayEnabled ?? true,
      manualPaymentEnabled: row?.manualPaymentEnabled ?? true,
      aiPhotoEnabled: row?.aiPhotoEnabled ?? true,
    };
  },

  async updatePaymentMethods(input: UpdatePaymentMethodsInput) {
    const { ramblayEnabled, manualPaymentEnabled, aiPhotoEnabled, ...methods } = input;
    const row = await prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, paymentMethods: methods, ramblayEnabled, manualPaymentEnabled, aiPhotoEnabled },
      update: {
        paymentMethods: methods,
        ...(ramblayEnabled !== undefined ? { ramblayEnabled } : {}),
        ...(manualPaymentEnabled !== undefined ? { manualPaymentEnabled } : {}),
        ...(aiPhotoEnabled !== undefined ? { aiPhotoEnabled } : {}),
      },
    });
    return {
      ...((row.paymentMethods as object) ?? {}),
      ramblayEnabled: row.ramblayEnabled,
      manualPaymentEnabled: row.manualPaymentEnabled,
      aiPhotoEnabled: row.aiPhotoEnabled,
    };
  },

  /** Único punto de verdad para saber si un método de pago está habilitado a nivel plataforma. */
  async getPaymentTogglesOrDefault() {
    const row = await prisma.platformSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { ramblayEnabled: true, manualPaymentEnabled: true },
    });
    return { ramblayEnabled: row?.ramblayEnabled ?? true, manualPaymentEnabled: row?.manualPaymentEnabled ?? true };
  },

  /** Único punto de verdad para saber si los botones de IA de fotos (ai-photo-service)
   * están habilitados a nivel plataforma — ver ai-photo.service.ts. */
  async getAiPhotoEnabledOrDefault(): Promise<boolean> {
    const row = await prisma.platformSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { aiPhotoEnabled: true },
    });
    return row?.aiPhotoEnabled ?? true;
  },

  /** Precios/descripción de los 4 planes: defaults fusionados con lo editado desde el master. */
  async getPlanContent(): Promise<PlanContent> {
    const row = await prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID }, select: { planContent: true } });
    return mergePlanContent(row?.planContent as Partial<PlanContent> | null);
  },

  /** Único punto de verdad para el precio de facturación (nunca confiar en lo que envía el cliente). */
  async getPlanPrice(plan: PurchasablePlan, billingCycle: PlanBillingCycle): Promise<number> {
    const content = await platformSettingsService.getPlanContent();
    return content[plan].prices[billingCycle];
  },

  async updatePlanContent(input: UpdatePlanContentInput): Promise<PlanContent> {
    const row = await prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID }, select: { planContent: true } });
    const current = mergePlanContent(row?.planContent as Partial<PlanContent> | null);
    const merged: PlanContent = { ...current };
    for (const plan of Object.keys(input) as PurchasablePlan[]) {
      const entry = input[plan];
      if (!entry) continue;
      merged[plan] = {
        name: entry.name ?? current[plan].name,
        subtitle: entry.subtitle ?? current[plan].subtitle,
        capacity: entry.capacity ?? current[plan].capacity,
        features: entry.features ?? current[plan].features,
        prices: { ...current[plan].prices, ...entry.prices },
      };
    }
    const mergedJson = merged as unknown as Prisma.InputJsonValue;
    await prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, planContent: mergedJson },
      update: { planContent: mergedJson },
    });
    return merged;
  },

  /** Mensajes del chatbot del master: defaults fusionados con lo editado desde el Dashboard maestro. */
  async getMessageTemplates(): Promise<MessageTemplates> {
    const row = await prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID }, select: { messageTemplates: true } });
    return { ...DEFAULT_MESSAGE_TEMPLATES, ...((row?.messageTemplates as Partial<MessageTemplates> | null) ?? {}) };
  },

  async updateMessageTemplates(input: UpdateMessageTemplatesInput): Promise<MessageTemplates> {
    const current = await platformSettingsService.getMessageTemplates();
    const merged: MessageTemplates = { ...current, ...input };
    const mergedJson = merged as unknown as Prisma.InputJsonValue;
    await prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, messageTemplates: mergedJson },
      update: { messageTemplates: mergedJson },
    });
    return merged;
  },
};
