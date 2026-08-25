import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { shopTicketsService } from './shop-tickets.service';

const verificarSchema = z.object({ accessToken: z.string().min(4).max(64) });

/** Entradas de eventos: la página pública del boleto y la puerta del local. */
export const shopTicketsController = {
  /** GET /public/tickets/:accessToken — el boleto que ve el asistente en su teléfono. */
  publico: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopTicketsService.porToken(req.params.accessToken) });
  }),

  /** GET /shop/tickets/events — eventos con entradas emitidas y cuántas van verificadas. */
  eventos: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopTicketsService.eventosConEntradas(req.restaurantId!) });
  }),

  /** GET /shop/tickets?productId= — lista de asistentes de ese evento. */
  lista: asyncHandler(async (req: Request, res: Response) => {
    const productId = typeof req.query.productId === 'string' ? req.query.productId : '';
    res.json({ data: await shopTicketsService.listar(req.restaurantId!, productId) });
  }),

  /**
   * POST /shop/tickets/check-in — marca la entrada al escanearla en la puerta.
   *
   * Responde 200 aunque la entrada esté repetida o no sea válida: el verificador necesita ver
   * el resultado en pantalla, no un error. El caso "repetida" es justamente lo que se busca
   * detectar (entradas duplicadas).
   */
  verificar: asyncHandler(async (req: Request, res: Response) => {
    const { accessToken } = verificarSchema.parse(req.body);
    res.json({ data: await shopTicketsService.verificar(req.restaurantId!, accessToken, req.auth?.userId) });
  }),

  /** DELETE /shop/tickets/:id — saca al asistente de la lista y devuelve su cupo. */
  eliminar: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopTicketsService.eliminar(req.restaurantId!, req.params.id) });
  }),

  /** POST /shop/tickets/:id/undo — deshacer una verificación hecha por error. */
  desmarcar: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopTicketsService.desmarcar(req.restaurantId!, req.params.id) });
  }),
};
