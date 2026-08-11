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
}

/**
 * Textos por defecto de cada mensaje que manda el bot del master (Dashboard maestro →
 * Chatbot → Mensajes). Editable parcialmente desde ahí; lo no editado sigue usando esto.
 * Placeholders disponibles por mensaje (se reemplazan con renderTemplate más abajo):
 * - reminderMessage: {{restaurantName}} {{periodEndLabel}} {{amountLine}} {{chargesBlock}} {{pagoMovilBlock}}
 * - paymentApprovedMessage: {{periodEndLabel}}
 * - welcomeMessage: {{ownerName}} {{restaurantName}}
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
};

/** Sustituye `{{variable}}` en una plantilla — variable ausente del mapa se reemplaza por
 * cadena vacía (así una línea condicional como {{pagoMovilBlock}} desaparece sola). */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
    .replace(/\n{3,}/g, '\n\n') // evita huecos de líneas en blanco cuando un placeholder queda vacío
    .trim();
}

export type PurchasablePlan = 'DELIVERY' | 'PRO' | 'ELITE';
export type PlanBillingCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL';

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
    prices: { MONTHLY: 24.99, QUARTERLY: 22.74, SEMIANNUAL: 20.49 },
  },
  PRO: {
    name: 'Plan Pro',
    subtitle: 'Todos los beneficios de QuickTap',
    capacity: 'Mesas, pedidos y sucursales ilimitadas',
    features: [
      'Usuarios ilimitados',
      'Administración, propinas y reportes de ventas',
      'Margen de utilidad por producto',
      'Inventario por receta: descuenta insumos automáticamente al vender',
      'Gastos y cuentas por pagar',
      ...CHATBOT_FEATURES,
    ],
    prices: { MONTHLY: 29.99, QUARTERLY: 26.99, SEMIANNUAL: 23.99 },
  },
  ELITE: {
    name: 'Plan Elite',
    subtitle: 'Todo lo del Plan Pro + beneficios exclusivos, sin límite de sucursales',
    capacity: 'Sucursales ilimitadas, cada una con mesas y pedidos ilimitados',
    features: [
      'Todo el Plan Pro en cada sucursal',
      'Catálogo, inventario y equipo por sucursal',
      'Reporte consolidado de ventas entre sucursales',
      'Productos más vendidos por sucursal',
      'Soporte prioritario 24/7 por WhatsApp',
      'Gerente de cuenta dedicado',
      'Onboarding y migración de catálogo sin costo',
      'Acceso anticipado a nuevas funcionalidades',
      ...CHATBOT_FEATURES,
    ],
    prices: { MONTHLY: 39.99, QUARTERLY: 35.49, SEMIANNUAL: 30.99 },
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
