import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { fiscalInvoicingClient, UnidigitalApiError } from './fiscal-invoicing.client';
import { decryptFiscalPassword, encryptFiscalPassword } from './fiscal-invoicing.crypto';
import type { EnableFiscalInvoicingInput } from './fiscal-invoicing.dto';

type Environment = 'QA' | 'PRODUCTION';

/**
 * Reusa el JWT cacheado (dura 8h) si no venció; si no, se loguea de nuevo
 * contra Unidigital y persiste el token + la SerieStrongId de la Serie 0.
 */
async function getOrCreateToken(config: { id: string; environment: string; username: string; passwordEncrypted: string; accessToken: string | null; tokenExpiresAt: Date | null; serieStrongId: string | null }) {
  const environment = config.environment as Environment;
  if (config.accessToken && config.tokenExpiresAt && config.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    return { accessToken: config.accessToken, serieStrongId: config.serieStrongId };
  }

  const password = decryptFiscalPassword(config.passwordEncrypted);
  const login = await fiscalInvoicingClient.login(environment, config.username, password);
  const serieZero = login.series.find((s) => s.name === '0') ?? login.series[0];
  // El token dura 8h por defecto (documentado) — se cachea con margen de 5 min.
  const tokenExpiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000 - 5 * 60 * 1000);

  await prisma.fiscalInvoicingConfig.update({
    where: { id: config.id },
    data: {
      accessToken: login.accessToken,
      tokenExpiresAt,
      serieStrongId: serieZero?.strongId ?? config.serieStrongId,
    },
  });

  return { accessToken: login.accessToken, serieStrongId: serieZero?.strongId ?? config.serieStrongId };
}

/**
 * Traduce una Order de QuickTap (ya saldada) al JSON de Unidigital. Interpretación
 * asumida (no confirmada campo a campo contra la colección Postman real, ver
 * riesgos del plan): los montos principales van en la moneda del pedido
 * (order.currency, USD/EUR) con ConversionCurrency = 'VES' + ExchangeRate ya
 * congelado en la orden; los campos *VES son el equivalente en bolívares
 * (order.totalBs y proporciones del mismo exchangeRate) que exige el SENIAT
 * sin importar en qué moneda facture el restaurante.
 */
function mapOrderToDocument(
  order: {
    id: string;
    createdAt: Date;
    currency: string;
    subtotalBase: { toNumber: () => number };
    ivaBase: { toNumber: () => number };
    totalBase: { toNumber: () => number };
    tipBase: { toNumber: () => number };
    exchangeRate: { toNumber: () => number };
    totalBs: { toNumber: () => number };
    customerName: string | null;
    customerIdNumber: string | null;
    customerPhone: string | null;
    customerAddress: string | null;
    items: { productName: string; quantity: number; unitPrice: { toNumber: () => number }; lineTotal: { toNumber: () => number } }[];
  },
  restaurant: { name: string; rif: string | null },
  serieStrongId: string,
  documentNumber: number,
) {
  const exchangeRate = order.exchangeRate.toNumber();
  const subtotal = order.subtotalBase.toNumber();
  const taxAmount = order.ivaBase.toNumber();
  const total = order.totalBase.toNumber();
  const tip = order.tipBase.toNumber();
  const grandTotal = total + tip;

  return {
    SerieStrongId: serieStrongId,
    EmissionDateAndTime: order.createdAt.toISOString(),
    DocumentType: 'FA',
    Number: documentNumber,
    Currency: order.currency,
    PaymentType: 'Contado',
    SystemReference: order.id,

    Name: order.customerName?.trim() || 'CONSUMIDOR FINAL',
    // Sin cédula/RIF del cliente (walk-in), se usa el placeholder de "consumidor
    // final" hasta confirmar el estándar exacto que exige SENIAT/Unidigital
    // (ver riesgos del plan) — no bloquea la emisión mientras tanto.
    FiscalRegistryCode: 'V',
    FiscalRegistry: order.customerIdNumber?.trim() || '00000000',
    Address: order.customerAddress?.trim() || restaurant.name,
    Phone: order.customerPhone ?? undefined,

    ExemptAmount: 0,
    TaxBase: subtotal,
    Subtotal: subtotal,
    SubtotalPlusDiscount: subtotal,
    TaxAmount: taxAmount,
    Taxes: taxAmount,
    TaxPercent: 16,
    Total: total,
    Tip: tip,
    GrandTotal: grandTotal,

    ConversionCurrency: 'VES',
    ExchangeRate: exchangeRate,
    ExemptAmountVES: 0,
    TaxBaseVES: subtotal * exchangeRate,
    SubtotalVES: subtotal * exchangeRate,
    TaxAmountVES: taxAmount * exchangeRate,
    TotalVES: order.totalBs.toNumber(),

    Items: order.items.map((item) => ({
      Description: item.productName,
      Quantity: item.quantity,
      UnitPrice: item.unitPrice.toNumber(),
      Total: item.lineTotal.toNumber(),
    })),
  };
}

export const fiscalInvoicingService = {
  /** GET /fiscal-invoicing/status — estado sin secretos, para el propio restaurante. */
  async getStatus(restaurantId: string) {
    const config = await prisma.fiscalInvoicingConfig.findUnique({ where: { restaurantId } });
    if (!config) return { enabled: false, environment: null };
    return { enabled: config.enabled, environment: config.environment, username: config.username };
  },

  async getInvoiceForOrder(restaurantId: string, orderId: string) {
    const invoice = await prisma.fiscalInvoice.findFirst({ where: { orderId, restaurantId } });
    if (!invoice) throw notFound('Este pedido no tiene un documento fiscal asociado.');
    return invoice;
  },

  /** PATCH /master/restaurants/:id/fiscal-invoicing — solo el equipo QuickTap. */
  async enableForRestaurant(restaurantId: string, input: EnableFiscalInvoicingInput) {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true, rif: true } });
    if (!restaurant) throw notFound('Restaurante no encontrado.');

    const existing = await prisma.fiscalInvoicingConfig.findUnique({ where: { restaurantId } });

    if (input.enabled) {
      if (!restaurant.rif?.trim()) {
        throw badRequest('Este restaurante no tiene RIF registrado. Pídele que lo agregue en Ajustes antes de activar la facturación fiscal.');
      }
      if (!existing && (!input.username || !input.password)) {
        throw badRequest('Usuario y contraseña de Unidigital son obligatorios la primera vez que se activa.');
      }
    }

    const username = input.username ?? existing?.username;
    if (!username) throw badRequest('Falta el usuario de Unidigital.');

    // Valida las credenciales contra Unidigital ANTES de guardarlas como
    // activas, para no marcar enabled:true con algo que nunca va a poder emitir.
    if (input.enabled && input.password) {
      try {
        await fiscalInvoicingClient.login(input.environment, username, input.password);
      } catch (err) {
        if (err instanceof UnidigitalApiError) {
          throw badRequest(`No se pudo validar la conexión con Unidigital: ${err.message}`);
        }
        throw badRequest('No se pudo conectar con Unidigital. Intenta de nuevo.');
      }
    }

    const data = {
      enabled: input.enabled,
      environment: input.environment,
      username,
      ...(input.password ? { passwordEncrypted: encryptFiscalPassword(input.password) } : {}),
      // Credenciales nuevas invalidan el token/serie cacheados del ambiente anterior.
      ...(input.password || (existing && existing.environment !== input.environment)
        ? { accessToken: null, tokenExpiresAt: null, serieStrongId: null }
        : {}),
    };

    return prisma.fiscalInvoicingConfig.upsert({
      where: { restaurantId },
      create: { restaurantId, passwordEncrypted: input.password ? encryptFiscalPassword(input.password) : '', ...data },
      update: data,
      select: { id: true, enabled: true, environment: true, username: true, updatedAt: true },
    });
  },

  /**
   * Se dispara desde order.service.ts -> addPayment cuando un pedido queda
   * completamente saldado. Nunca lanza hacia el llamador: un fallo de red o
   * de credenciales hacia Unidigital no puede revertir ni bloquear un cobro
   * que ya se confirmó — queda registrado en FiscalInvoice.errorMessage.
   */
  async issueForOrder(restaurantId: string, orderId: string) {
    try {
      const config = await prisma.fiscalInvoicingConfig.findUnique({ where: { restaurantId } });
      if (!config || !config.enabled) return;

      const [order, restaurant] = await Promise.all([
        prisma.order.findFirst({ where: { id: orderId, restaurantId }, include: { items: true } }),
        prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true, rif: true } }),
      ]);
      if (!order || !restaurant) return;

      const alreadyIssued = await prisma.fiscalInvoice.findUnique({ where: { orderId } });
      if (alreadyIssued) return; // Ya se intentó/emitió para este pedido — no duplicar.

      const { accessToken, serieStrongId } = await getOrCreateToken(config);
      if (!serieStrongId) throw new Error('No se pudo determinar la Serie del restaurante en Unidigital.');

      const numbersByType = (config.nextDocumentNumberByType as Record<string, number>) ?? {};
      const documentNumber = (numbersByType.FA ?? 0) + 1;

      const document = mapOrderToDocument(order, restaurant, serieStrongId, documentNumber);

      let response: unknown;
      let status: 'PENDING' | 'FAILED' = 'PENDING';
      let errorMessage: string | null = null;
      try {
        response = await fiscalInvoicingClient.createAndApprove('QA' === config.environment ? 'QA' : 'PRODUCTION', accessToken!, document);
      } catch (err) {
        status = 'FAILED';
        errorMessage = err instanceof UnidigitalApiError ? err.message : 'Error desconocido al emitir el documento.';
        response = null;
      }

      await prisma.$transaction([
        prisma.fiscalInvoice.create({
          data: {
            orderId,
            restaurantId,
            documentType: 'FA',
            documentNumber,
            unidigitalStrongId: (response as { strongId?: string } | null)?.strongId,
            status,
            errorMessage,
            rawRequestJson: document,
            rawResponseJson: (response as object | null) ?? Prisma.JsonNull,
          },
        }),
        // El correlativo solo avanza si sí se envió (nunca se "reintenta" el mismo número).
        prisma.fiscalInvoicingConfig.update({
          where: { id: config.id },
          data: { nextDocumentNumberByType: { ...numbersByType, FA: documentNumber } },
        }),
      ]);
    } catch {
      // Red de seguridad final: cualquier error no capturado arriba tampoco debe
      // propagarse — issueForOrder() siempre resuelve, nunca rechaza.
    }
  },

  /**
   * Job periódico (mismo patrón que exchangeRateService.refreshAll en
   * src/server.ts): busca facturas PENDING con más de unos minutos de
   * antigüedad y consulta si Unidigital ya les asignó número de control.
   */
  async pollControlNumbers() {
    const pending = await prisma.fiscalInvoice.findMany({
      where: { status: 'PENDING', updatedAt: { lt: new Date(Date.now() - 2 * 60 * 1000) } },
      take: 50,
    });
    if (pending.length === 0) return;

    const configsByRestaurant = new Map<string, Awaited<ReturnType<typeof prisma.fiscalInvoicingConfig.findUnique>>>();
    for (const invoice of pending) {
      if (!invoice.unidigitalStrongId) continue;
      try {
        let config = configsByRestaurant.get(invoice.restaurantId);
        if (config === undefined) {
          config = await prisma.fiscalInvoicingConfig.findUnique({ where: { restaurantId: invoice.restaurantId } });
          configsByRestaurant.set(invoice.restaurantId, config);
        }
        if (!config || !config.enabled) continue;

        const { accessToken } = await getOrCreateToken(config);
        const result = (await fiscalInvoicingClient.getControlNumberByCycle(
          config.environment as Environment,
          accessToken!,
          invoice.unidigitalStrongId,
        )) as { controlNumber?: number } | null;

        if (result?.controlNumber) {
          await prisma.fiscalInvoice.update({
            where: { id: invoice.id },
            data: { status: 'ISSUED', controlNumber: result.controlNumber },
          });
        }
      } catch {
        // Se reintenta en el próximo barrido — no interrumpe el resto del lote.
      }
    }
  },
};
