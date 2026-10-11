import { withoutCatalogDescriptions } from '../../utils/print-payload';
import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { tenantGuard } from '../../middlewares/auth.middleware';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { asyncHandler } from '../../middlewares/error.middleware';
import { notFound, conflict } from '../../utils/http-error';
const station = z.string().min(8).max(100);
export const printMonitorRoutes = Router();
printMonitorRoutes.use(tenantGuard);
printMonitorRoutes.post('/heartbeat', asyncHandler(async (req, res) => {
  const input = z.object({
    stationId: station, name: z.string().min(1).max(100), platform: z.string().max(100),
    socketOnline: z.boolean(), autoPrint: z.boolean(),
    printers: z.array(z.object({ key: z.string().min(1).max(200), name: z.string().min(1).max(160),
      driver: z.string().max(200).nullable(), kind: z.enum(['system', 'serial']),
      assignments: z.array(z.string().max(160)).max(50) })).max(50),
  }).parse(req.body);
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.restaurantId! + ':' + input.stationId}))`;
    const { printers, ...data } = input;
    const registry = await tx.printStationRegistry.upsert({
      where: { restaurantId_stationId: { restaurantId: req.restaurantId!, stationId: input.stationId } },
      create: { restaurantId: req.restaurantId!, ...data }, update: { ...data, lastSeenAt: new Date() },
    });
    await tx.registeredPrinter.updateMany({ where: { registryId: registry.id }, data: { configured: false } });
    for (const printer of printers) await tx.registeredPrinter.upsert({
      where: { registryId_key: { registryId: registry.id, key: printer.key } },
      create: { registryId: registry.id, ...printer }, update: { ...printer, configured: true, lastSeenAt: new Date() },
    });
  });
  res.json({ data: { ok: true } });
}));

printMonitorRoutes.get('/pending', asyncHandler(async (req, res) => {
  const stationId = station.parse(req.query.stationId);
  const registry = await prisma.printStationRegistry.findUnique({ where: { restaurantId_stationId: { restaurantId: req.restaurantId!, stationId } } });
  // Una estación nueva no imprime el historial de otra. Desde su registro, los trabajos
  // pendientes no caducan por una desconexión larga. Historial anterior: revisión manual.
  if (!registry) { res.json({ data: [] }); return; }
  const jobs = await prisma.$queryRaw<import('@prisma/client').RestaurantPrintJob[]>`
    SELECT j.* FROM "RestaurantPrintJob" j
    LEFT JOIN orders o ON o.id = j."orderId"
    WHERE j."restaurantId" = ${req.restaurantId!} AND j."createdAt" >= ${registry.recoverySince}
      AND (j."orderId" IS NULL OR o.status <> 'CANCELLED')
      AND NOT EXISTS (SELECT 1 FROM "RestaurantPrintDelivery" d WHERE d."jobId" = j.id AND d."stationId" = ${stationId})
    ORDER BY j."createdAt", j.id LIMIT 100`;
  res.json({ data: jobs.map(job => ({
    ...job, payload: job.kind === 'recibo' ? job.payload : withoutCatalogDescriptions(job.payload),
  })) });
}));
printMonitorRoutes.post('/:id/claim', asyncHandler(async (req, res) => {
  const { stationId, retry } = z.object({ stationId: station, retry: z.boolean().default(false) }).parse(req.body);
  const job = await prisma.restaurantPrintJob.findFirst({ where: { id: req.params.id, restaurantId: req.restaurantId! } });
  if (!job) throw notFound('Envío no encontrado.');
  const existing = await prisma.restaurantPrintDelivery.findUnique({ where: { jobId_stationId: { jobId: job.id, stationId } } });
  if (existing) {
    if (!retry || existing.status !== 'FAILED') throw conflict('Este envío ya fue recibido. Revisa su estado antes de reimprimir.');
    const claimed = await prisma.restaurantPrintDelivery.updateMany({ where: { id: existing.id, status: 'FAILED' }, data: { status: 'PROCESSING', error: null } });
    if (!claimed.count) throw conflict('El envío ya está en curso.');
    res.json({ data: existing }); return;
  }
  try { res.json({ data: await prisma.restaurantPrintDelivery.create({ data: { jobId: job.id, stationId } }) }); }
  catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('El envío ya está en curso.'); throw e; }
}));
printMonitorRoutes.post('/:id/report', asyncHandler(async (req, res) => {
  const input = z.object({ stationId: station, status: z.enum(['PROCESSING', 'ACCEPTED', 'FAILED', 'UNCONFIRMED']), results: z.record(z.object({ printer: z.string().max(160), kitchen: z.string().max(160), status: z.enum(['STARTED', 'ACCEPTED', 'FAILED', 'UNCONFIRMED']), error: z.string().max(500).optional() })).optional(), error: z.string().max(500).nullable().optional() }).parse(req.body);
  const job = await prisma.restaurantPrintJob.findFirst({ where: { id: req.params.id, restaurantId: req.restaurantId! } });
  if (!job) throw notFound('Envío no encontrado.');
  const result = await prisma.restaurantPrintDelivery.updateMany({ where: { jobId: job.id, stationId: input.stationId, status: 'PROCESSING' }, data: { status: input.status, results: input.results as Prisma.InputJsonValue, error: input.error } });
  if (!result.count) throw conflict('El envío no está en curso.');
  res.json({ data: { ok: true } });
}));
export const masterPrintMonitorRoutes = Router();
masterPrintMonitorRoutes.use(platformAuthGuard);
masterPrintMonitorRoutes.get('/stations', asyncHandler(async (req, res) => {
  const q = z.string().max(120).default('').parse(req.query.q);
  const restaurants = await prisma.restaurant.findMany({ where: q ? { name: { contains: q, mode: 'insensitive' } } : {}, select: { id: true, name: true } });
  const stations = await prisma.printStationRegistry.findMany({ where: { restaurantId: { in: restaurants.map(r => r.id) } },
    include: { printers: { orderBy: { name: 'asc' } } }, orderBy: { lastSeenAt: 'desc' }, take: 200 });
  res.json({ data: stations.map(s => ({ ...s, online: Date.now() - s.lastSeenAt.getTime() < 90000,
    restaurantName: restaurants.find(r => r.id === s.restaurantId)?.name })) });
}));

masterPrintMonitorRoutes.get('/', asyncHandler(async (req, res) => {
  const query = z.object({
    q: z.string().max(120).default(''),
    restaurantId: z.string().optional(),
    orderNumber: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(100)
  }).parse(req.query);
  const restaurants = await prisma.restaurant.findMany({
    where: {
      ...(query.restaurantId ? { id: query.restaurantId } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {})
    },
    select: { id: true, name: true }
  });
  const where = {
    restaurantId: { in: restaurants.map(r => r.id) },
    ...(query.orderNumber ? { orderNumber: query.orderNumber } : {})
  };
  const jobs = await prisma.restaurantPrintJob.findMany({
    where,
    include: { deliveries: true },
    orderBy: { createdAt: 'desc' },
    skip: (query.page - 1) * query.limit,
    take: query.limit
  });
  // No enviar direcciones, teléfonos ni otras notas personales al panel de monitoreo.
  res.json({
    data: jobs.map(({ payload, ...job }) => {
      const p = payload as any;
      const deliveries = job.deliveries.map(d => {
        const results = (d.results as Record<string, any>) || {};
        const printerEntries = Object.values(results);
        const printers = Array.from(new Set(printerEntries.map((r: any) => r.printer).filter(Boolean)));
        const isAccepted = d.status === 'ACCEPTED' || printerEntries.some((r: any) => r.status === 'ACCEPTED');
        const durationMs = Math.max(0, new Date(d.updatedAt).getTime() - new Date(job.createdAt).getTime());
        return {
          id: d.id,
          stationId: d.stationId,
          status: d.status,
          error: d.error,
          startedAt: d.startedAt,
          updatedAt: d.updatedAt,
          results,
          printers,
          isAccepted,
          durationMs,
          durationSeconds: Number((durationMs / 1000).toFixed(2))
        };
      });
      const primaryDelivery = deliveries[0];
      const allPrinters = Array.from(new Set(deliveries.flatMap(d => d.printers)));
      const isPrinted = deliveries.some(d => d.isAccepted);
      const durationMs = primaryDelivery ? primaryDelivery.durationMs : null;
      const durationSeconds = primaryDelivery ? primaryDelivery.durationSeconds : null;

      return {
        ...job,
        restaurantName: restaurants.find(r => r.id === job.restaurantId)?.name || 'Restaurante',
        tableName: p?.table ? `Mesa ${p.table.number}${p.table.zoneName ? ` (${p.table.zoneName})` : ''}` : (p?.tableName ?? null),
        channel: p?.channel ?? null,
        placedByUser: p?.placedByUser ?? null,
        customerName: p?.customerName ?? null,
        totalBase: p?.totalBase ?? null,
        totalBs: p?.totalBs ?? null,
        currency: p?.currency ?? 'EUR',
        isPrinted,
        durationMs,
        durationSeconds,
        printers: allPrinters,
        deliveries,
        items: ((p?.items ?? [])).map((i: any) => ({
          name: i.name,
          quantity: i.quantity,
          kitchenName: i.kitchenName || null,
          notes: i.note || i.notes || null,
          variantName: i.variantName || null,
          unitPrice: i.unitPrice ?? null,
          lineTotal: i.lineTotal ?? null,
          modifiers: Array.isArray(i.modifiers)
            ? i.modifiers.map((m: any) => typeof m === 'string' ? m : (m.name || m.optionName || ''))
            : []
        }))
      };
    })
  });
}));
