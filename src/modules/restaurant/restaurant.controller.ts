import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { updateRestaurantSchema } from './restaurant.dto';
import { restaurantService } from './restaurant.service';

export const restaurantController = {
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateRestaurantSchema.parse(req.body);
    const restaurant = await restaurantService.update(req.restaurantId!, input);
    res.json({ data: restaurant });
  }),
};
