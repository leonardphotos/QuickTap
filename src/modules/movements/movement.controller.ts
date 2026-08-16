import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { createMovementSchema, movementQuerySchema, updateMovementSchema } from './movement.dto';
import { movementService } from './movement.service';
import { movementExcelService } from './movement-excel.service';
import { fiscalExportService } from './fiscal-export.service';

/** Manda un workbook ya armado como descarga .xlsx. */
function sendWorkbook(res: Response, workbook: { xlsx: { write: (stream: Response) => Promise<void> } }, filename: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  return workbook.xlsx.write(res).then(() => res.end());
}

export const movementController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = movementQuerySchema.parse(req.query);
    res.json({ data: await movementService.list(req.restaurantId!, query) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createMovementSchema.parse(req.body);
    res.status(201).json({ data: await movementService.create(req.restaurantId!, req.auth?.userId, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateMovementSchema.parse(req.body);
    res.json({ data: await movementService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await movementService.remove(req.restaurantId!, req.params.id) });
  }),
  markCreditPaid: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await movementService.markCreditPaid(req.restaurantId!, req.params.id) });
  }),
  /** GET /api/v1/movements/export — libro de ingresos/egresos del período en Excel. */
  exportExcel: asyncHandler(async (req: Request, res: Response) => {
    const query = movementQuerySchema.parse(req.query);
    const workbook = await movementExcelService.exportMovements(req.restaurantId!, query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="contabilidad.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }),
  /**
   * GET /api/v1/movements/export/purchase-book y /export/sales-book — los libros fiscales del
   * período en Excel, completos (la pantalla pagina; el archivo no).
   */
  exportPurchaseBook: asyncHandler(async (req: Request, res: Response) => {
    const { range, date, from, to } = movementQuerySchema.parse(req.query);
    const { workbook, filename } = await fiscalExportService.buildPurchaseBookWorkbook(req.restaurantId!, { range, date, from, to });
    sendWorkbook(res, workbook, filename);
  }),

  exportSalesBook: asyncHandler(async (req: Request, res: Response) => {
    const { range, date, from, to } = movementQuerySchema.parse(req.query);
    // ?format=fiscal → solo las columnas del Libro de ventas SENIAT, en Bs.
    const format = req.query.format === 'fiscal' ? 'fiscal' : 'full';
    const { workbook, filename } = await fiscalExportService.buildSalesBookWorkbook(req.restaurantId!, { range, date, from, to }, format);
    sendWorkbook(res, workbook, filename);
  }),

  /** GET /api/v1/movements/import-template — plantilla para cargar el historial financiero. */
  downloadImportTemplate: asyncHandler(async (_req: Request, res: Response) => {
    const workbook = movementExcelService.buildImportTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-contabilidad.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }),
  /** POST /api/v1/movements/import — carga masiva del historial de ingresos/egresos. */
  importExcel: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    const result = await movementExcelService.importFromExcel(req.restaurantId!, req.auth?.userId, req.file.buffer);
    res.json({ data: result });
  }),
  /** POST /api/v1/movements/upload-receipt — foto de la factura/recibo del gasto. */
  uploadReceipt: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: `/uploads/expense-receipts/${req.file.filename}` } });
  }),
  /** POST /api/v1/movements/upload-quote — foto del presupuesto/cotización del gasto. */
  uploadQuote: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: `/uploads/expense-quotes/${req.file.filename}` } });
  }),
  /** POST /api/v1/movements/upload-payment-proof — foto del comprobante de pago del gasto. */
  uploadPaymentProof: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: `/uploads/expense-payment-proofs/${req.file.filename}` } });
  }),
};
