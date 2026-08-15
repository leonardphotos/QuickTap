import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { branchReportQuerySchema, createBranchSchema } from './branch.dto';
import { branchService } from './branch.service';

export const branchController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await branchService.list(req.restaurantId!) });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createBranchSchema.parse(req.body);
    res.status(201).json({ data: await branchService.create(req.restaurantId!, req.auth!.userId, input) });
  }),

  switchToBranch: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await branchService.switchToBranch(req.restaurantId!, req.auth!.userId, req.params.id) });
  }),

  switchToParent: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await branchService.switchToParent(req.restaurantId!, req.auth!.userId) });
  }),

  consolidatedSummary: asyncHandler(async (req: Request, res: Response) => {
    const { range, date } = branchReportQuerySchema.parse(req.query);
    res.json({ data: await branchService.getConsolidatedSummary(req.restaurantId!, range, date) });
  }),

  branchComparison: asyncHandler(async (req: Request, res: Response) => {
    const { range, date, from, to } = branchReportQuerySchema.parse(req.query);
    res.json({ data: await branchService.getBranchComparison(req.restaurantId!, range, date, from, to) });
  }),

  salesByBranch: asyncHandler(async (req: Request, res: Response) => {
    const { range, date } = branchReportQuerySchema.parse(req.query);
    res.json({ data: await branchService.getSalesByBranch(req.restaurantId!, range, date) });
  }),

  branchSalesDetail: asyncHandler(async (req: Request, res: Response) => {
    const { range, date } = branchReportQuerySchema.parse(req.query);
    res.json({ data: await branchService.getBranchSalesDetail(req.restaurantId!, req.params.branchId, range, date) });
  }),

  inventoryByBranch: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await branchService.getInventoryByBranch(req.restaurantId!) });
  }),

  topProductsByBranch: asyncHandler(async (req: Request, res: Response) => {
    const { range, date } = branchReportQuerySchema.parse(req.query);
    res.json({ data: await branchService.getTopProductsByBranch(req.restaurantId!, range, date) });
  }),

  employeesByBranch: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await branchService.getEmployeesByBranch(req.restaurantId!) });
  }),
};
