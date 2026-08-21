import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { masterRestaurantsController } from './master-restaurants.controller';

/** Base: /api/v1/master/restaurants */
const router = Router();
router.use(platformAuthGuard);

router.get('/', masterRestaurantsController.list);
router.get('/:id', masterRestaurantsController.detail);
router.post('/:id/activate', masterRestaurantsController.activate);
router.patch('/:id/suspend', masterRestaurantsController.setSuspended);
router.patch('/:id/extend', masterRestaurantsController.extendDays);
router.patch('/:id/period-end', masterRestaurantsController.setPeriodEnd);
router.patch('/:id/iva', masterRestaurantsController.setIvaEnabled);
router.post('/:id/branches', masterRestaurantsController.createBranch);
router.post('/:id/impersonate', masterRestaurantsController.impersonate);
router.patch('/:id/custom-price', masterRestaurantsController.setCustomMonthlyPrice);
router.patch('/:id/billing-phone', masterRestaurantsController.setBillingPhone);
router.post('/:id/subscription-reminder', masterRestaurantsController.sendSubscriptionReminder);
router.post('/:id/subscription-reminder/preview', masterRestaurantsController.previewSubscriptionReminder);
router.get('/:id/additional-charges', masterRestaurantsController.listAdditionalCharges);
router.post('/:id/additional-charges', masterRestaurantsController.createAdditionalCharge);
router.delete('/:id/additional-charges/:chargeId', masterRestaurantsController.removeAdditionalCharge);
router.patch('/:id/additional-charges/:chargeId/mark-paid', masterRestaurantsController.markAdditionalChargePaid);

// Personalizaciones por local (ver modelo Customization): el registro de lo hecho a medida,
// y el cargo que se genera al entregarlo.
router.get('/:id/customizations', masterRestaurantsController.listCustomizations);
router.post('/:id/customizations', masterRestaurantsController.createCustomization);
router.patch('/:id/customizations/:customizationId', masterRestaurantsController.updateCustomization);
router.delete('/:id/customizations/:customizationId', masterRestaurantsController.removeCustomization);
router.patch('/:id/users/:userId', masterRestaurantsController.updateUser);
router.post('/:id/installation-notice', masterRestaurantsController.sendInstallationNotice);
router.delete('/:id', masterRestaurantsController.remove);

export default router;
