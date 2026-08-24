import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { walletInboxService } from '../wallet/wallet-payments.service';
import { prisma } from '../../config/prisma';

const rechazarSchema = z.object({ motivo: z.string().min(3, 'Escribe por qué lo rechazas.') });

const altaSchema = z.object({
  name: z.string().min(2, 'Escribe el nombre del cliente.'),
  phone: z.string().min(7, 'Escribe el teléfono.'),
  idNumber: z.string().min(5, 'La cédula es obligatoria: es la clave con la que entra al portal.'),
  email: z.string().email('Correo inválido.').optional().or(z.literal('')),
});

/** Ventana "QuickTap Wallet" del panel del local. */
export const shopWalletController = {
  /** GET /shop/wallet/pending — abonos reportados esperando verificación. */
  pendientes: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await walletInboxService.pendientes(req.restaurantId!) });
  }),

  /**
   * GET /shop/wallet/account?phone= — la cuenta abierta de ESE cliente, o null.
   *
   * Aparte de /debtors (que trae la lista entera) porque el POS la consulta mientras el cajero
   * escribe el teléfono: traer todos los deudores en cada tecleo sería absurdo.
   */
  cuenta: asyncHandler(async (req: Request, res: Response) => {
    const phone = typeof req.query.phone === 'string' ? req.query.phone : '';
    res.json({ data: await walletInboxService.cuentaDe(req.restaurantId!, phone) });
  }),

  /** GET /shop/wallet/debtors — todos los clientes con deuda, de mayor a menor. */
  deudores: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await walletInboxService.deudores(req.restaurantId!) });
  }),

  /** POST /shop/wallet/:id/approve — el abono se vuelve real y suma al cliente. */
  aprobar: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await walletInboxService.aprobar(req.restaurantId!, req.params.id, req.auth?.userId) });
  }),

  /**
   * POST /shop/wallet/enroll — da de alta al cliente en QuickTap Wallet.
   *
   * La cédula es obligatoria porque es la clave con la que entra al portal; sin ella quedaría
   * registrado pero sin poder consultar nada.
   */
  alta: asyncHandler(async (req: Request, res: Response) => {
    const input = altaSchema.parse(req.body);
    const phone = input.phone.replace(/\D/g, '');
    const cliente = await prisma.customer.upsert({
      where: { restaurantId_phone: { restaurantId: req.restaurantId!, phone } },
      update: { name: input.name, idNumber: input.idNumber, ...(input.email ? { email: input.email } : {}) },
      create: {
        restaurantId: req.restaurantId!,
        name: input.name,
        phone,
        idNumber: input.idNumber,
        ...(input.email ? { email: input.email } : {}),
      },
    });
    res.status(201).json({ data: { id: cliente.id, name: cliente.name, phone: cliente.phone } });
  }),

  /** POST /shop/wallet/:id/reject — no se crea ningún pago; el cliente ve el motivo. */
  rechazar: asyncHandler(async (req: Request, res: Response) => {
    const { motivo } = rechazarSchema.parse(req.body);
    res.json({ data: await walletInboxService.rechazar(req.restaurantId!, req.params.id, motivo, req.auth?.userId) });
  }),
};
