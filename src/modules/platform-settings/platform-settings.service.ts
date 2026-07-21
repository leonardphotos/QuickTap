import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { UpdatePaymentMethodsInput, UpdatePlanContentInput } from './platform-settings.dto';

const SINGLETON_ID = 'singleton';

export type PurchasablePlan = 'DELIVERY' | 'PRO' | 'SUCURSALES' | 'DELIVERY_SUCURSALES';
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
 * Valores por defecto (precios/descripción) de los 4 planes vigentes. Única
 * fuente de verdad para el precio de facturación (ver resolvePrice() en
 * plan-request.service.ts) — lo editable desde el Dashboard maestro se
 * fusiona sobre esto, así que un plan nunca queda a medio configurar.
 */
export const DEFAULT_PLAN_CONTENT: PlanContent = {
  DELIVERY: {
    name: 'Solo Delivery',
    subtitle: 'Cocinas fantasma o solo pedidos por WhatsApp',
    capacity: 'Sin mesas ni códigos QR — acceso directo a Cocina',
    features: ['Productos', 'Cocinas', 'Sección de Delivery', 'Pedidos ilimitados', 'Hasta 6 usuarios de tu equipo'],
    prices: { MONTHLY: 18.99, QUARTERLY: 16.99, SEMIANNUAL: 14.99 },
  },
  PRO: {
    name: 'Plan Pro',
    subtitle: 'Todos los beneficios de QuickTap',
    capacity: 'Mesas y pedidos ilimitados',
    features: [
      'Usuarios ilimitados',
      'Administración: historial de pedidos, propinas, Estadísticas y reportes de ventas',
      'Margen de utilidad por producto',
      'Inventario por receta: descuenta insumos automáticamente al vender',
      'Gastos: proveedores, categorías de egreso y balance',
      'Cuentas por pagar: cuentas abiertas pendientes de cobro',
    ],
    prices: { MONTHLY: 28.99, QUARTERLY: 24.99, SEMIANNUAL: 20.99 },
  },
  SUCURSALES: {
    name: 'Plan Sucursales',
    subtitle: 'Todos los beneficios de Pro, en hasta 5 sucursales',
    capacity: 'Hasta 5 sucursales, cada una con mesas y pedidos ilimitados',
    features: [
      'Todos los beneficios del Plan Pro en cada sucursal',
      'Cada sucursal con su propio catálogo, inventario, mesas y equipo',
      'Reporte consolidado de ventas: sede principal + cada sucursal',
      'Inventario por sucursal: qué falta reabastecer en cada una',
      'Productos más vendidos por sucursal',
      'Equipo de trabajo por sucursal',
    ],
    prices: { MONTHLY: 78.99, QUARTERLY: 64.99, SEMIANNUAL: 50.99 },
  },
  DELIVERY_SUCURSALES: {
    name: 'Delivery Sucursales',
    subtitle: 'Todos los beneficios de Solo Delivery, en hasta 5 sucursales',
    capacity: 'Hasta 5 sucursales — sin mesas ni códigos QR',
    features: [
      'Productos, Cocinas y Sección de Delivery en cada sucursal',
      'Cada sucursal con su propio catálogo, inventario y equipo',
      'Reporte consolidado de ventas: sede principal + cada sucursal',
      'Inventario por sucursal: qué falta reabastecer en cada una',
      'Productos más vendidos por sucursal',
    ],
    prices: { MONTHLY: 38.99, QUARTERLY: 32.99, SEMIANNUAL: 26.99 },
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
  async getPaymentMethods() {
    const row = await prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID } });
    return {
      ...((row?.paymentMethods as object) ?? {}),
      ramblayEnabled: row?.ramblayEnabled ?? true,
      manualPaymentEnabled: row?.manualPaymentEnabled ?? true,
    };
  },

  async updatePaymentMethods(input: UpdatePaymentMethodsInput) {
    const { ramblayEnabled, manualPaymentEnabled, ...methods } = input;
    const row = await prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, paymentMethods: methods, ramblayEnabled, manualPaymentEnabled },
      update: {
        paymentMethods: methods,
        ...(ramblayEnabled !== undefined ? { ramblayEnabled } : {}),
        ...(manualPaymentEnabled !== undefined ? { manualPaymentEnabled } : {}),
      },
    });
    return { ...((row.paymentMethods as object) ?? {}), ramblayEnabled: row.ramblayEnabled, manualPaymentEnabled: row.manualPaymentEnabled };
  },

  /** Único punto de verdad para saber si un método de pago está habilitado a nivel plataforma. */
  async getPaymentTogglesOrDefault() {
    const row = await prisma.platformSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { ramblayEnabled: true, manualPaymentEnabled: true },
    });
    return { ramblayEnabled: row?.ramblayEnabled ?? true, manualPaymentEnabled: row?.manualPaymentEnabled ?? true };
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
};
