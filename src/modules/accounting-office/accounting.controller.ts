import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { accountingService } from './accounting.service';
import { accountingImportService } from './accounting-import.service';
import { badRequest } from '../../utils/http-error';
import {
  createAccountSchema,
  createCompanySchema,
  createContactSchema,
  createEntrySchema,
  updateCompanySchema,
} from './accounting.dto';

const rango = z.object({ desde: z.string().optional(), hasta: z.string().optional() });

export const accountingController = {
  listCompanies: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await accountingService.listCompanies(req.restaurantId!) });
  }),
  createCompany: asyncHandler(async (req: Request, res: Response) => {
    const input = createCompanySchema.parse(req.body);
    res.status(201).json({ data: await accountingService.createCompany(req.restaurantId!, input) });
  }),
  updateCompany: asyncHandler(async (req: Request, res: Response) => {
    const input = updateCompanySchema.parse(req.body);
    res.json({ data: await accountingService.updateCompany(req.restaurantId!, req.params.companyId, input) });
  }),

  listAccounts: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await accountingService.listAccounts(req.restaurantId!, req.params.companyId) });
  }),
  createAccount: asyncHandler(async (req: Request, res: Response) => {
    const input = createAccountSchema.parse(req.body);
    res.status(201).json({ data: await accountingService.createAccount(req.restaurantId!, req.params.companyId, input) });
  }),

  listEntries: asyncHandler(async (req: Request, res: Response) => {
    const q = rango.extend({ buscar: z.string().optional() }).parse(req.query);
    res.json({ data: await accountingService.listEntries(req.restaurantId!, req.params.companyId, q) });
  }),
  createEntry: asyncHandler(async (req: Request, res: Response) => {
    const input = createEntrySchema.parse(req.body);
    res.status(201).json({
      data: await accountingService.createEntry(req.restaurantId!, req.params.companyId, req.auth!.userId, input),
    });
  }),
  voidEntry: asyncHandler(async (req: Request, res: Response) => {
    const { reason } = z.object({ reason: z.string().min(1, 'Explica por qué se anula.').max(240) }).parse(req.body);
    res.json({
      data: await accountingService.voidEntry(req.restaurantId!, req.params.companyId, req.params.entryId, req.auth!.userId, reason),
    });
  }),

  listContacts: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await accountingService.listContacts(req.restaurantId!, req.params.companyId) });
  }),
  createContact: asyncHandler(async (req: Request, res: Response) => {
    const input = createContactSchema.parse(req.body);
    res.status(201).json({ data: await accountingService.createContact(req.restaurantId!, req.params.companyId, input) });
  }),

  reports: asyncHandler(async (req: Request, res: Response) => {
    const q = rango.parse(req.query);
    res.json({ data: await accountingService.reports(req.restaurantId!, req.params.companyId, q.desde, q.hasta) });
  }),
  dashboard: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await accountingService.dashboard(req.restaurantId!, req.params.companyId) });
  }),

  /** GET /office/companies/:companyId/import-template — plantilla ya llena con lo cargado. */
  downloadImportTemplate: asyncHandler(async (req: Request, res: Response) => {
    const workbook = await accountingImportService.buildTemplate(req.restaurantId!, req.params.companyId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-administracion.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }),

  /** POST /office/companies/:companyId/import — carga cuentas, contactos y asientos de una sola vez. */
  importExcel: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    const data = await accountingImportService.importFromExcel(
      req.restaurantId!,
      req.params.companyId,
      req.auth?.userId,
      req.file.buffer,
    );
    res.json({ data });
  }),
};
