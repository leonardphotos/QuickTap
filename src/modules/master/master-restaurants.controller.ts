import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { activateRestaurantSchema } from '../plan-requests/plan-request.dto';
import { planRequestService } from '../plan-requests/plan-request.service';
import {
  createAdditionalChargeSchema,
  createCustomizationSchema,
  updateCustomizationSchema,
  createBranchForRestaurantSchema,
  extendDaysSchema,
  setBillingPhoneSchema,
  setCustomMonthlyPriceSchema,
  setIvaEnabledSchema,
  sendInstallationNoticeSchema,
  setPeriodEndSchema,
  setSuspendedSchema,
  updateRestaurantUserSchema,
} from './master-restaurants.dto';
import { masterRestaurantsService } from './master-restaurants.service';

export const masterRestaurantsController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await masterRestaurantsService.list() });
  }),
  detail: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterRestaurantsService.detail(req.params.id) });
  }),
  /** Activación/extensión manual sin comprobante (ej: el restaurante pagó por otro medio). */
  activate: asyncHandler(async (req: Request, res: Response) => {
    const input = activateRestaurantSchema.parse(req.body);
    res.json({ data: await planRequestService.activateRestaurant(req.params.id, input) });
  }),
  /** Bloquear/desbloquear la cuenta manualmente. */
  setSuspended: asyncHandler(async (req: Request, res: Response) => {
    const { suspended } = setSuspendedSchema.parse(req.body);
    res.json({ data: await masterRestaurantsService.setSuspended(req.params.id, suspended) });
  }),
  /** Extender (o recortar) el vencimiento por una cantidad exacta de días. */
  extendDays: asyncHandler(async (req: Request, res: Response) => {
    const { days } = extendDaysSchema.parse(req.body);
    res.json({ data: await masterRestaurantsService.extendDays(req.params.id, days) });
  }),
  /** Fija el vencimiento a una fecha exacta (día/mes/año). */
  setPeriodEnd: asyncHandler(async (req: Request, res: Response) => {
    const { periodEnd } = setPeriodEndSchema.parse(req.body);
    res.json({ data: await masterRestaurantsService.setPeriodEnd(req.params.id, periodEnd) });
  }),
  /** Activa/desactiva el IVA (16%). Requiere que el restaurante ya tenga su RIF registrado. */
  setIvaEnabled: asyncHandler(async (req: Request, res: Response) => {
    const { ivaEnabled } = setIvaEnabledSchema.parse(req.body);
    res.json({ data: await masterRestaurantsService.setIvaEnabled(req.params.id, ivaEnabled) });
  }),
  /** Crea la primera sucursal de un restaurante desde el Dashboard maestro. */
  createBranch: asyncHandler(async (req: Request, res: Response) => {
    const input = createBranchForRestaurantSchema.parse(req.body);
    res.status(201).json({ data: await masterRestaurantsService.createBranch(req.params.id, input) });
  }),
  /** Fija/borra el precio mensual acordado manualmente (referencia interna, no oficial). */
  setCustomMonthlyPrice: asyncHandler(async (req: Request, res: Response) => {
    const { customMonthlyPriceUsd } = setCustomMonthlyPriceSchema.parse(req.body);
    res.json({ data: await masterRestaurantsService.setCustomMonthlyPrice(req.params.id, customMonthlyPriceUsd) });
  }),
  /** PATCH /master/restaurants/:id/billing-phone — número al que se le cobra la mensualidad. */
  setBillingPhone: asyncHandler(async (req: Request, res: Response) => {
    const { billingPhone } = setBillingPhoneSchema.parse(req.body);
    res.json({ data: await masterRestaurantsService.setBillingPhone(req.params.id, billingPhone) });
  }),
  /** POST /master/restaurants/:id/subscription-reminder — manda el cobro de la mensualidad ya. */
  sendSubscriptionReminder: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterRestaurantsService.sendSubscriptionReminder(req.params.id) });
  }),
  /** POST /master/restaurants/:id/subscription-reminder/preview — arma el cobro para copiarlo
   * y pegarlo a mano en WhatsApp, sin enviarlo. */
  previewSubscriptionReminder: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterRestaurantsService.previewSubscriptionReminder(req.params.id) });
  }),
  /** GET /master/restaurants/:id/additional-charges — cargos aparte de la mensualidad. */
  listAdditionalCharges: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterRestaurantsService.listAdditionalCharges(req.params.id) });
  }),
  /** POST /master/restaurants/:id/additional-charges — agrega un cargo puntual (monto + motivo). */
  createAdditionalCharge: asyncHandler(async (req: Request, res: Response) => {
    const input = createAdditionalChargeSchema.parse(req.body);
    res.status(201).json({ data: await masterRestaurantsService.createAdditionalCharge(req.params.id, input) });
  }),
  /** DELETE /master/restaurants/:id/additional-charges/:chargeId — solo si aún no se cobró. */
  removeAdditionalCharge: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterRestaurantsService.removeAdditionalCharge(req.params.id, req.params.chargeId) });
  }),
  /** GET /master/restaurants/:id/customizations — qué se le construyó a medida a este local. */
  listCustomizations: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterRestaurantsService.listCustomizations(req.params.id) });
  }),
  /** POST /master/restaurants/:id/customizations — registra una personalización. */
  createCustomization: asyncHandler(async (req: Request, res: Response) => {
    const input = createCustomizationSchema.parse(req.body);
    res.status(201).json({ data: await masterRestaurantsService.createCustomization(req.params.id, input) });
  }),
  /** PATCH /master/restaurants/:id/customizations/:customizationId — pasar a ENTREGADA genera el cargo. */
  updateCustomization: asyncHandler(async (req: Request, res: Response) => {
    const input = updateCustomizationSchema.parse(req.body);
    res.json({ data: await masterRestaurantsService.updateCustomization(req.params.id, req.params.customizationId, input) });
  }),
  /** DELETE /master/restaurants/:id/customizations/:customizationId — el cargo ya emitido se conserva. */
  removeCustomization: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterRestaurantsService.removeCustomization(req.params.id, req.params.customizationId) });
  }),
  /** Edita nombre/correo/contraseña de un usuario del restaurante. */
  updateUser: asyncHandler(async (req: Request, res: Response) => {
    const input = updateRestaurantUserSchema.parse(req.body);
    res.json({ data: await masterRestaurantsService.updateUser(req.params.id, req.params.userId, input) });
  }),
  /** POST /master/restaurants/:id/impersonate — "Entrar sin contraseña" al panel de ese restaurante. */
  impersonate: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterRestaurantsService.impersonate(req.params.id) });
  }),
  /** Elimina el restaurante y todos sus datos. No se puede deshacer. */
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterRestaurantsService.remove(req.params.id) });
  }),
  /** Botón "Avisar sistema listo": credenciales del equipo + monto de instalación por WhatsApp. */
  sendInstallationNotice: asyncHandler(async (req: Request, res: Response) => {
    const { amountUsd } = sendInstallationNoticeSchema.parse(req.body);
    res.json({ data: await masterRestaurantsService.sendInstallationNotice(req.params.id, amountUsd) });
  }),
  /** Botón "Marcar como pagado" en Cobro: el cargo se pagó por su cuenta, sin renovar el plan. */
  markAdditionalChargePaid: asyncHandler(async (req: Request, res: Response) => {
    res.json({
      data: await masterRestaurantsService.markAdditionalChargePaid(req.params.id, req.params.chargeId),
    });
  }),
};
