import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { platformLoginSchema } from './platform-auth.dto';
import { platformAuthService } from './platform-auth.service';

export const platformAuthController = {
  login: asyncHandler(async (req: Request, res: Response) => {
    const input = platformLoginSchema.parse(req.body);
    res.json({ data: await platformAuthService.login(input) });
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await platformAuthService.me(req.platformAuth!.platformAdminId) });
  }),
};
