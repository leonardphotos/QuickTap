import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import {
  adjustSchema,
  bankTransactionQuerySchema,
  createBankAccountSchema,
  transferSchema,
  updateBankAccountSchema,
} from './bank-account.dto';
import { bankAccountService } from './bank-account.service';

export const bankAccountController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await bankAccountService.list(req.restaurantId!) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createBankAccountSchema.parse(req.body);
    res.status(201).json({ data: await bankAccountService.create(req.restaurantId!, req.auth?.userId, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateBankAccountSchema.parse(req.body);
    res.json({ data: await bankAccountService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await bankAccountService.remove(req.restaurantId!, req.params.id) });
  }),
  transactions: asyncHandler(async (req: Request, res: Response) => {
    const query = bankTransactionQuerySchema.parse(req.query);
    res.json({ data: await bankAccountService.transactions(req.restaurantId!, req.params.id, query) });
  }),
  transfer: asyncHandler(async (req: Request, res: Response) => {
    const input = transferSchema.parse(req.body);
    res.json({ data: await bankAccountService.transfer(req.restaurantId!, req.auth?.userId, input) });
  }),
  adjust: asyncHandler(async (req: Request, res: Response) => {
    const input = adjustSchema.parse(req.body);
    res.json({ data: await bankAccountService.adjust(req.restaurantId!, req.auth?.userId, req.params.id, input) });
  }),
};
