import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, setLockPinSchema, verifyLockPinSchema } from './auth.dto';
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

  /** No revela si el correo existe: la respuesta es siempre la misma. */
  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    const input = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(input);
    res.json({ data: { message: 'Si el correo existe, te enviamos un código.' } });
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const input = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(input);
    res.json({ data: { message: 'Contraseña actualizada.' } });
  }),

  /** Header Bearer normal, o `{ token }` en el body — navigator.sendBeacon (cierre de pestaña) no puede mandar headers. */
  logout: asyncHandler(async (req: Request, res: Response) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : req.body?.token;
    await authService.logout(token);
    res.json({ data: { ok: true } });
  }),

  setLockPin: asyncHandler(async (req: Request, res: Response) => {
    const { pin } = setLockPinSchema.parse(req.body);
    res.json({ data: await authService.setLockPin(req.auth!.userId, pin) });
  }),

  verifyLockPin: asyncHandler(async (req: Request, res: Response) => {
    const { pin } = verifyLockPinSchema.parse(req.body);
    res.json({ data: await authService.verifyLockPin(req.auth!.userId, pin) });
  }),
};
