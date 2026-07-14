import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (usa formato hex, ej: #FFFFFF).');

// Enlaces a redes sociales que se muestran en el banner del menú público.
export const restaurantSocialLinksSchema = z.object({
  instagram: z.string().max(300).optional(),
  facebook: z.string().max(300).optional(),
  tiktok: z.string().max(300).optional(),
  x: z.string().max(300).optional(),
});

// Apariencia del menú público. Todas las claves son opcionales para poder
// personalizar solo lo que el restaurante quiera y dejar el resto por defecto.
export const restaurantThemeSchema = z.object({
  background: hexColor.optional(),
  primary: hexColor.optional(),
  buttonText: hexColor.optional(),
  accent: hexColor.optional(),
  text: hexColor.optional(),
  bannerColor: hexColor.optional(),
  socialLinks: restaurantSocialLinksSchema.optional(),
});

export const updateRestaurantSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  logoUrl: z.string().min(1).optional(),
  whatsappPhone: z.string().min(7).max(30).optional(),
  // La "casilla de Tasa cambiaria": el restaurante elige en qué moneda
  // coloca sus precios. La conversión a Bs siempre usa la tasa BCV vigente.
  baseCurrency: z.enum(['USD', 'EUR']).optional(),
  theme: restaurantThemeSchema.optional(),

  // Cargos opcionales del checkout (10% de servicio, 16% de IVA).
  serviceChargeEnabled: z.boolean().optional(),
  ivaEnabled: z.boolean().optional(),

  // Si es false, el menú público queda solo para ver (sin carrito/checkout).
  orderingEnabled: z.boolean().optional(),

  // Modo Cartelera: imagen de pantalla completa en vez del menú.
  fullscreenImageEnabled: z.boolean().optional(),
  fullscreenImageUrl: z.string().min(1).optional(),
});

export type RestaurantTheme = z.infer<typeof restaurantThemeSchema>;
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
