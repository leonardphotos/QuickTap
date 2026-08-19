import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { registerDeviceTokenSchema } from './push-token.dto';
import { pushTokenService } from './push-token.service';

export const pushTokenController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth?.userId) throw badRequest('Sesión inválida.');
    const input = registerDeviceTokenSchema.parse(req.body);
    res.status(201).json({ data: await pushTokenService.register(req.restaurantId!, req.auth.userId, input) });
  }),
  unregister: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth?.userId) throw badRequest('Sesión inválida.');
    res.json({ data: await pushTokenService.unregister(req.auth.userId, req.params.token) });
  }),
};
