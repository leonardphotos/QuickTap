import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { loginSchema, registerSchema } from './auth.dto';
import { authService } from './auth.service';

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input);
    res.status(201).json({ data: result });
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
    res.json({ data: result });
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.me(req.restaurantId!, req.auth!.userId);
    res.json({ data: result });
  }),
};
