import { prisma } from '../../config/prisma';
import { UpdateRestaurantInput } from './restaurant.dto';

export const restaurantService = {
  async update(restaurantId: string, input: UpdateRestaurantInput) {
    return prisma.restaurant.update({
      where: { id: restaurantId },
      data: input,
    });
  },
};
