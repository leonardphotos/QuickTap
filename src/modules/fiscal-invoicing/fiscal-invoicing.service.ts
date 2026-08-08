import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, notFound } from '../../utils/http-error';
import { fiscalInvoicingClient, UnidigitalApiError } from './fiscal-invoicing.client';
import { FiscalActor, SYSTEM_ACTOR, writeFiscalAudit } from './fiscal-invoicing.audit';
import { decryptFiscalPassword, encryptFiscalPassword } from './fiscal-invoicing.crypto';
import type { EnableFiscalInvoicingInput } from './fiscal-invoicing.dto';

type Environment = 'QA' | 'PRODUCTION';

const IVA_PERCENT = 16;

/** Reintentos de contingencia antes de dejar el documento en revisión manual. */
const MAX_ISSUE_ATTEMPTS = 8;

/**
 * Métodos que se liquidan en divisa/cripto y por tanto entran en la base del
 * IGTF. CASH_USD/ZELLE/BINANCE/PAYPAL son divisa; Pago Móvil, efectivo Bs,
 * punto de venta y transferencia local son bolívares y no aplican.
 */
const IGTF_APPLICABLE_METHODS = new Set(['CASH_USD', 'ZELLE', 'BINANCE', 'PAYPAL']);

/**
 * Identificación del consumidor final cuando la venta no capturó cédula/RIF.
 * OJO: este valor lo debe confirmar el contador del restaurante contra el
 * estándar que acepte la imprenta digital. Se centraliza aquí para que sea un
 * solo cambio y no quede disperso en el mapeo.
 */
const CONSUMIDOR_FINAL = { name: 'CONSUMIDOR FINAL', code: 'V', registry: '00000000' };

/** Redondeo a 2 decimales sobre number, para los campos monetarios del payload. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Backoff exponencial con techo de 1h: 1, 2, 4, 8, 16, 32, 60, 60 min. */
function nextRetryDelayMs(attempts: number): number {
  return Math.min(2 ** attempts, 60) * 60 * 1000;
}

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
    serviceChargeBase: { toNumber: () => number };
    ivaBase: { toNumber: () => number };
    deliveryFeeBase: { toNumber: () => number };
    envaseFeeBase: { toNumber: () => number };
    totalBase: { toNumber: () => number };
    tipBase: { toNumber: () => number };
    exchangeRate: { toNumber: () => number };
    totalBs: { toNumber: () => number };
    customerName: string | null;
    customerIdNumber: string | null;
    customerPhone: string | null;
    customerAddress: string | null;
    payments: { method: string; amountBase: { toNumber: () => number } }[];
    items: { productName: string; quantity: number; unitPrice: { toNumber: () => number }; lineTotal: { toNumber: () => number } }[];
  },
  restaurant: { name: string; rif: string | null; ivaEnabled: boolean },
  config: { igtfEnabled: boolean; igtfRate: { toNumber: () => number } },
  serieStrongId: string,
  documentNumber: number,
) {
  const exchangeRate = order.exchangeRate.toNumber();
  const productsSubtotal = order.subtotalBase.toNumber();
  const serviceCharge = order.serviceChargeBase.toNumber();
  const deliveryFee = order.deliveryFeeBase.toNumber();
  const envaseFee = order.envaseFeeBase.toNumber();
  const taxAmount = order.ivaBase.toNumber();
  const total = order.totalBase.toNumber();
  const tip = order.tipBase.toNumber();

  // El cargo por servicio, el delivery y el envase SÍ forman parte del total
  // cobrado, así que tienen que viajar como líneas del documento. Antes se
  // omitían y el documento no cuadraba (Subtotal + IVA != Total), lo que el
  // validador de la imprenta rechaza y deja la contabilidad descuadrada.
  const extraLines: { Description: string; Quantity: number; UnitPrice: number; Total: number }[] = [];
  if (serviceCharge > 0) {
    extraLines.push({ Description: 'Cargo por servicio (10%)', Quantity: 1, UnitPrice: serviceCharge, Total: serviceCharge });
  }
  if (deliveryFee > 0) {
    extraLines.push({ Description: 'Servicio de delivery', Quantity: 1, UnitPrice: deliveryFee, Total: deliveryFee });
  }
  if (envaseFee > 0) {
    extraLines.push({ Description: 'Envase', Quantity: 1, UnitPrice: envaseFee, Total: envaseFee });
  }

  // Base imponible declarada = todo lo gravado que suma al total, sin el IVA.
  // Debe cumplir: TaxBase + TaxAmount + IGTF == GrandTotal - Tip.
  const taxBase = productsSubtotal + serviceCharge + deliveryFee + envaseFee;

  // IGTF: solo sobre la porción efectivamente pagada en divisa/cripto, y solo
  // si el contador del restaurante lo activó con su alícuota vigente.
  const igtfRate = config.igtfRate.toNumber();
  const foreignCurrencyPaid = config.igtfEnabled
    ? order.payments
        .filter((p) => IGTF_APPLICABLE_METHODS.has(p.method))
        .reduce((acc, p) => acc + p.amountBase.toNumber(), 0)
    : 0;
  const igtfAmount = round2(foreignCurrencyPaid * igtfRate);

  const grandTotal = round2(total + tip + igtfAmount);
  // La alícuota declarada tiene que ser coherente con el IVA realmente cobrado:
  // si el restaurante no tiene IVA activado, es 0, no 16.
  const taxPercent = restaurant.ivaEnabled ? IVA_PERCENT : 0;

  return {
    SerieStrongId: serieStrongId,
    EmissionDateAndTime: order.createdAt.toISOString(),
    DocumentType: 'FA',
    Number: documentNumber,
    Currency: order.currency,
    PaymentType: 'Contado',
    SystemReference: order.id,

    Name: order.customerName?.trim() || CONSUMIDOR_FINAL.name,
    // Consumidor final: el estándar de RIF/cédula genérica lo tiene que
    // confirmar el contador (ver CONSUMIDOR_FINAL) — no lo inventa el código.
    FiscalRegistryCode: order.customerIdNumber?.trim() ? 'V' : CONSUMIDOR_FINAL.code,
    FiscalRegistry: order.customerIdNumber?.trim() || CONSUMIDOR_FINAL.registry,
    Address: order.customerAddress?.trim() || restaurant.name,
    Phone: order.customerPhone ?? undefined,

    ExemptAmount: 0,
    TaxBase: round2(taxBase),
    Subtotal: round2(taxBase),
    SubtotalPlusDiscount: round2(taxBase),
    TaxAmount: round2(taxAmount),
    Taxes: round2(taxAmount),
    TaxPercent: taxPercent,
    Total: round2(total),
    Tip: tip,
    IgtfAmount: igtfAmount,
    IgtfBase: round2(foreignCurrencyPaid),
    GrandTotal: grandTotal,

    ConversionCurrency: 'VES',
    ExchangeRate: exchangeRate,
    ExemptAmountVES: 0,
    TaxBaseVES: round2(taxBase * exchangeRate),
    SubtotalVES: round2(taxBase * exchangeRate),
    TaxAmountVES: round2(taxAmount * exchangeRate),
    IgtfAmountVES: round2(igtfAmount * exchangeRate),
    TotalVES: order.totalBs.toNumber(),

    Items: [
      ...order.items.map((item) => ({
        Description: item.productName,
        Quantity: item.quantity,
        UnitPrice: item.unitPrice.toNumber(),
        Total: item.lineTotal.toNumber(),
      })),
      ...extraLines,
    ],
  };
}

/**
 * Reserva el siguiente correlativo de forma atómica. Usa SELECT ... FOR UPDATE
 * sobre la fila de config, de modo que dos cobros concurrentes se serializan y
 * es imposible que tomen el mismo Number.
 *
 * Por qué importa legalmente: la numeración de las facturas es correlativa y
 * única. Dos documentos con el mismo número, o un salto sin justificar, son un
 * hallazgo en una fiscalización.
 */
async function reserveDocumentNumber(configId: string, documentType: 'FA' | 'NC' | 'ND'): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ nextDocumentNumberByType: Record<string, number> }[]>`
      SELECT "nextDocumentNumberByType" FROM "fiscal_invoicing_configs" WHERE "id" = ${configId} FOR UPDATE
    `;
    const current = locked[0]?.nextDocumentNumberByType ?? {};
    const next = (current[documentType] ?? 0) + 1;
    await tx.fiscalInvoicingConfig.update({
      where: { id: configId },
      data: { nextDocumentNumberByType: { ...current, [documentType]: next } },
    });
    return next;
  });
}

/**
 * Envía el documento a Unidigital y registra el resultado sobre una fila de
 * FiscalInvoice que YA existe. Nunca borra ni recrea la fila: solo actualiza
 * estado, intentos y la respuesta cruda, para que el histórico de intentos
 * quede completo en la pista de auditoría.
 */
async function sendAndRecord(
  invoiceId: string,
  restaurantId: string,
  orderId: string,
  config: { environment: string },
  accessToken: string,
  document: Record<string, unknown>,
  previousAttempts: number,
  actor: FiscalActor,
) {
  const environment: Environment = config.environment === 'PRODUCTION' ? 'PRODUCTION' : 'QA';
  const attempts = previousAttempts + 1;

  try {
    const response = await fiscalInvoicingClient.createAndApprove(environment, accessToken, document);
    await prisma.fiscalInvoice.update({
      where: { id: invoiceId },
      data: {
        // PENDING = aceptada por la imprenta, esperando número de control
        // (tarda 1-5 min y lo asigna pollControlNumbers).
        status: 'PENDING',
        attempts,
        nextRetryAt: null,
        errorMessage: null,
        unidigitalStrongId: response?.strongId,
        rawResponseJson: (response as object | null) ?? Prisma.JsonNull,
      },
    });
    await writeFiscalAudit({
      restaurantId,
      invoiceId,
      orderId,
      event: 'ISSUED',
      actor,
      detail: { attempts, unidigitalStrongId: response?.strongId ?? null },
    });
  } catch (err) {
    const isApiError = err instanceof UnidigitalApiError;
    const message = isApiError ? `${err.status} — ${err.message}` : 'Error de red o desconocido al emitir.';
    // Un 4xx de validación (400) no se arregla reintentando el mismo payload:
    // se agota de una vez para que quede en revisión manual en vez de golpear
    // el API 8 veces con datos que siempre va a rechazar. 401/429/5xx sí se
    // reintentan (token vencido, rate limit, caída temporal).
    const permanent = isApiError && err.status === 400;
    const exhausted = permanent || attempts >= MAX_ISSUE_ATTEMPTS;

    await prisma.fiscalInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'FAILED',
        attempts,
        nextRetryAt: exhausted ? null : new Date(Date.now() + nextRetryDelayMs(attempts)),
        errorMessage: message,
      },
    });
    await writeFiscalAudit({
      restaurantId,
      invoiceId,
      orderId,
      event: 'ISSUE_FAILED',
      actor,
      detail: { attempts, message, permanent, exhausted },
    });
  }
}

export const fiscalInvoicingService = {
  /** GET /fiscal-invoicing/status — estado sin secretos, para el propio restaurante. */
  async getStatus(restaurantId: string) {
    const config = await prisma.fiscalInvoicingConfig.findUnique({ where: { restaurantId } });
    if (!config) return { enabled: false, environment: null };
    return { enabled: config.enabled, environment: config.environment, username: config.username };
  },

  async getInvoiceForOrder(restaurantId: string, orderId: string) {
    const invoices = await prisma.fiscalInvoice.findMany({
      where: { orderId, restaurantId },
      orderBy: { createdAt: 'asc' },
    });
    if (invoices.length === 0) throw notFound('Este pedido no tiene un documento fiscal asociado.');
    return invoices;
  },

  /**
   * ¿Este pedido ya tiene un documento fiscal vivo? Lo usan los guards de
   * order.service para impedir que se borre o se edite un pedido ya facturado.
   *
   * Base legal: una factura emitida es inalterable. Si hay que corregirla, se
   * emite una Nota de Crédito (total o parcial) que la referencia — jamás se
   * modifica ni se elimina el documento original ni el pedido que lo respalda.
   */
  async hasLiveFiscalDocument(orderId: string): Promise<boolean> {
    const count = await prisma.fiscalInvoice.count({
      where: { orderId, status: { in: ['PENDING', 'ISSUED'] } },
    });
    return count > 0;
  },

  /**
   * Anulación correcta: NO borra ni "desactiva" la factura. Marca la original
   * como VOIDED (dejando la fila intacta) y deja registrada la intención de
   * emitir la Nota de Crédito que la reversa, manteniendo su propio correlativo
   * de la serie NC.
   *
   * IMPORTANTE: el envío efectivo de la NC a Unidigital queda pendiente de
   * confirmar el payload exacto de nota de crédito contra la colección Postman
   * real. Hasta entonces la NC se crea en estado FAILED/pendiente de reintento y
   * NO se reporta como emitida — es preferible una NC en cola visible que un
   * "ya está anulado" que el SENIAT no vería.
   */
  async voidByCreditNote(
    restaurantId: string,
    orderId: string,
    reason: string,
    actor: FiscalActor,
  ) {
    const original = await prisma.fiscalInvoice.findUnique({
      where: { orderId_documentType: { orderId, documentType: 'FA' } },
    });
    if (!original || original.restaurantId !== restaurantId) {
      throw notFound('Este pedido no tiene una factura fiscal que anular.');
    }
    if (original.status === 'VOIDED') throw conflict('Esta factura ya fue anulada.');
    if (original.status !== 'ISSUED' && original.status !== 'PENDING') {
      throw badRequest('Solo se puede anular una factura que llegó a emitirse.');
    }
    const existingNc = await prisma.fiscalInvoice.findUnique({
      where: { orderId_documentType: { orderId, documentType: 'NC' } },
    });
    if (existingNc) throw conflict('Ya existe una nota de crédito para este pedido.');

    const config = await prisma.fiscalInvoicingConfig.findUnique({ where: { restaurantId } });
    if (!config) throw badRequest('Este restaurante no tiene facturación fiscal configurada.');

    await writeFiscalAudit({
      restaurantId,
      invoiceId: original.id,
      orderId,
      event: 'VOID_REQUESTED',
      actor,
      detail: { reason, originalNumber: original.documentNumber },
    });

    const ncNumber = await reserveDocumentNumber(config.id, 'NC');

    const [, creditNote] = await prisma.$transaction([
      prisma.fiscalInvoice.update({
        where: { id: original.id },
        data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason },
      }),
      prisma.fiscalInvoice.create({
        data: {
          orderId,
          restaurantId,
          documentType: 'NC',
          documentNumber: ncNumber,
          replacesInvoiceId: original.id,
          status: 'FAILED',
          attempts: 0,
          nextRetryAt: new Date(),
          errorMessage: 'Nota de crédito pendiente de emisión.',
          // Se reusa el payload original como base de la reversa: mismos montos,
          // mismo receptor. El tipo y el número cambian.
          rawRequestJson: {
            ...(original.rawRequestJson as object),
            DocumentType: 'NC',
            Number: ncNumber,
            AffectedDocumentNumber: original.documentNumber,
            AffectedDocumentControlNumber: original.controlNumber ?? undefined,
            VoidReason: reason,
          },
        },
      }),
    ]);

    await writeFiscalAudit({
      restaurantId,
      invoiceId: creditNote.id,
      orderId,
      event: 'VOIDED',
      actor,
      detail: { creditNoteNumber: ncNumber, originalNumber: original.documentNumber, reason },
    });

    return { original: original.documentNumber, creditNote: ncNumber, status: creditNote.status };
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
      ...(input.igtfEnabled !== undefined ? { igtfEnabled: input.igtfEnabled } : {}),
      ...(input.igtfRate !== undefined ? { igtfRate: new Prisma.Decimal(input.igtfRate) } : {}),
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
  async issueForOrder(restaurantId: string, orderId: string, actor: FiscalActor = SYSTEM_ACTOR) {
    try {
      const config = await prisma.fiscalInvoicingConfig.findUnique({ where: { restaurantId } });
      if (!config || !config.enabled) return;

      const [order, restaurant] = await Promise.all([
        prisma.order.findFirst({
          where: { id: orderId, restaurantId },
          include: { items: true, payments: true },
        }),
        prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true, rif: true, ivaEnabled: true } }),
      ]);
      if (!order || !restaurant) return;

      const alreadyIssued = await prisma.fiscalInvoice.findUnique({
        where: { orderId_documentType: { orderId, documentType: 'FA' } },
      });
      // Ya emitida o ya en cola de reintentos: no se duplica ni se pisa. El
      // reintento lo maneja retryPendingIssues() con la fila que ya existe.
      if (alreadyIssued) return;

      const { accessToken, serieStrongId } = await getOrCreateToken(config);
      if (!serieStrongId) throw new Error('No se pudo determinar la Serie del restaurante en Unidigital.');

      // Correlativo ATÓMICO: se reserva dentro de una transacción que relee la
      // config con lock de fila, para que dos cobros simultáneos no puedan
      // tomar el mismo Number. La correlatividad es requisito del SENIAT y un
      // número repetido invalida el documento.
      const documentNumber = await reserveDocumentNumber(config.id, 'FA');

      const document = mapOrderToDocument(order, restaurant, config, serieStrongId, documentNumber);

      await writeFiscalAudit({
        restaurantId,
        orderId,
        event: 'ISSUE_ATTEMPT',
        actor,
        detail: { documentType: 'FA', documentNumber, total: document.GrandTotal },
      });

      // La fila se crea ANTES de la llamada HTTP: si el proceso muere durante la
      // llamada, el correlativo reservado no queda huérfano y el barrido de
      // contingencia lo encuentra y lo reintenta.
      const invoice = await prisma.fiscalInvoice.create({
        data: {
          orderId,
          restaurantId,
          documentType: 'FA',
          documentNumber,
          status: 'FAILED',
          attempts: 0,
          nextRetryAt: new Date(),
          errorMessage: 'Emisión en curso.',
          rawRequestJson: document,
        },
      });

      await sendAndRecord(invoice.id, restaurantId, orderId, config, accessToken!, document, 0, actor);
    } catch (err) {
      // Red de seguridad final: un fallo hacia Unidigital no puede revertir ni
      // bloquear un cobro ya confirmado. Pero se deja rastro — un fallo silencioso
      // en facturación fiscal es exactamente lo que no se puede permitir.
      // eslint-disable-next-line no-console
      console.error('[fiscal] issueForOrder falló para el pedido', orderId, err);
      await writeFiscalAudit({
        restaurantId,
        orderId,
        event: 'ISSUE_FAILED',
        actor,
        detail: { reason: err instanceof Error ? err.message : 'Error desconocido' },
      });
    }
  },

  /**
   * Cola de contingencia (requisito de continuidad operativa): reintenta las
   * facturas que quedaron FAILED por caídas de internet o del API de la
   * imprenta. Corre en el mismo job periódico que pollControlNumbers().
   */
  async retryPendingIssues() {
    const due = await prisma.fiscalInvoice.findMany({
      where: {
        status: 'FAILED',
        attempts: { lt: MAX_ISSUE_ATTEMPTS },
        nextRetryAt: { lte: new Date() },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: 25,
    });

    for (const invoice of due) {
      try {
        const config = await prisma.fiscalInvoicingConfig.findUnique({ where: { restaurantId: invoice.restaurantId } });
        if (!config || !config.enabled) continue;

        const { accessToken } = await getOrCreateToken(config);
        // Se reenvía EL MISMO payload con EL MISMO Number: un reintento no puede
        // consumir un correlativo nuevo, o dejaría huecos en la numeración.
        const document = invoice.rawRequestJson as Record<string, unknown> | null;
        if (!document) continue;

        await sendAndRecord(
          invoice.id,
          invoice.restaurantId,
          invoice.orderId,
          config,
          accessToken!,
          document,
          invoice.attempts,
          SYSTEM_ACTOR,
        );
      } catch {
        // El siguiente barrido lo vuelve a tomar — no interrumpe el lote.
      }
    }
  },

  /**
   * Segunda red de contingencia: pedidos totalmente cobrados que NO tienen
   * ninguna fila de FiscalInvoice. Pasa si el proceso murió entre el cobro y la
   * creación de la factura, o si la facturación se activó después del cobro.
   */
  async reconcileMissingInvoices(restaurantId: string, sinceHours = 72) {
    const config = await prisma.fiscalInvoicingConfig.findUnique({ where: { restaurantId } });
    if (!config || !config.enabled) return { queued: 0 };

    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    const candidates = await prisma.order.findMany({
      where: {
        restaurantId,
        status: { notIn: ['CANCELLED'] },
        createdAt: { gte: since },
        fiscalInvoices: { none: {} },
        payments: { some: {} },
      },
      select: { id: true },
      take: 100,
    });

    let queued = 0;
    for (const order of candidates) {
      await fiscalInvoicingService.issueForOrder(restaurantId, order.id, SYSTEM_ACTOR);
      queued += 1;
    }
    return { queued };
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
          // El número de control lo asigna la imprenta autorizada: es el dato que
          // convierte el documento en fiscalmente válido, así que su asignación
          // tiene que quedar en la pista de auditoría con fecha y hora.
          await writeFiscalAudit({
            restaurantId: invoice.restaurantId,
            invoiceId: invoice.id,
            orderId: invoice.orderId,
            event: 'CONTROL_NUMBER_ASSIGNED',
            actor: SYSTEM_ACTOR,
            detail: { controlNumber: result.controlNumber, documentNumber: invoice.documentNumber },
          });
        }
      } catch {
        // Se reintenta en el próximo barrido — no interrumpe el resto del lote.
      }
    }
  },
};
