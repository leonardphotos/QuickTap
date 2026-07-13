import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { moveTableSessionSchema } from './table-session.dto';
import { tableSessionService } from './table-session.service';

export const tableSessionController = {
  close: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await tableSessionService.close(req.restaurantId!, req.params.id) });
  }),
  move: asyncHandler(async (req: Request, res: Response) => {
    const input = moveTableSessionSchema.parse(req.body);
    res.json({ data: await tableSessionService.move(req.restaurantId!, req.params.id, input.tableId) });
  }),
};
