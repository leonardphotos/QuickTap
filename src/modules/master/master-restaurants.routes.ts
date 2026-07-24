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
router.patch('/:id/users/:userId', masterRestaurantsController.updateUser);
router.delete('/:id', masterRestaurantsController.remove);

export default router;
