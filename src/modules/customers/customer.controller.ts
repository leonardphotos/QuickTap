import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { forbidden } from '../../utils/http-error';
import { PARTNER_MANAGER_ROLES } from '../../utils/roles';
import { createCustomerSchema, customerQuerySchema, updateCustomerSchema } from './customer.dto';
import { customerService } from './customer.service';

/**
 * `isPartner` no se valida con requireRole en la ruta porque crear un cliente normal sí lo
 * puede hacer cualquiera que tome pedidos (CustomerPicker da de alta al vuelo). El permiso
 * cuelga del CAMPO, no del endpoint: un mesero puede crear clientes, pero no socios.
 */
function assertPuedeMarcarSocio(req: Request, isPartner: boolean | undefined) {
  if (isPartner === undefined) return;
  if (!PARTNER_MANAGER_ROLES.includes(req.auth!.role as (typeof PARTNER_MANAGER_ROLES)[number])) {
    throw forbidden('Solo un dueño o administrador puede marcar a un cliente como socio.');
  }
}

export const customerController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = customerQuerySchema.parse(req.query);
    res.json({ data: await customerService.list(req.restaurantId!, query) });
  }),
  /** GET /customers/:id — la ficha del CRM: datos, historial, promos y canjes. */
  profile: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await customerService.profile(req.restaurantId!, req.params.id) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createCustomerSchema.parse(req.body);
    assertPuedeMarcarSocio(req, input.isPartner);
    res.status(201).json({ data: await customerService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateCustomerSchema.parse(req.body);
    assertPuedeMarcarSocio(req, input.isPartner);
    res.json({ data: await customerService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await customerService.remove(req.restaurantId!, req.params.id) });
  }),
};
