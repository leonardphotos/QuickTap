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
  primary: hexColor.optional(),
  buttonText: hexColor.optional(),
  accent: hexColor.optional(),
  text: hexColor.optional(),
  // Color de arranque del degradado del banner (siempre se desvanece hacia blanco).
  bannerColor: hexColor.optional(),
  // Foto de portada del banner; si está presente reemplaza el color sólido pero
  // conserva el mismo degradado hacia blanco por encima de la imagen.
  coverImageUrl: z.string().min(1).optional(),
  socialLinks: restaurantSocialLinksSchema.optional(),
});

// Métodos de pago que el restaurante ofrece a SUS clientes en el checkout de
// delivery/pickup. Cada uno se puede activar/desactivar y traer sus propios
// datos (cuenta, correo, etc.) para que el cliente sepa a dónde pagar.
const paymentMethodFieldsSchema = z.object({
  enabled: z.boolean().optional(),
  banco: z.string().max(80).optional(),
  telefono: z.string().max(30).optional(),
  cedula: z.string().max(30).optional(),
  titular: z.string().max(120).optional(),
  correo: z.string().max(120).optional(),
  id: z.string().max(80).optional(),
  cuenta: z.string().max(40).optional(),
  rif: z.string().max(30).optional(),
});

export const paymentMethodsConfigSchema = z.object({
  CASH: paymentMethodFieldsSchema.optional(),
  MOBILE_PAYMENT: paymentMethodFieldsSchema.optional(),
  ZELLE: paymentMethodFieldsSchema.optional(),
  BINANCE: paymentMethodFieldsSchema.optional(),
  PAYPAL: paymentMethodFieldsSchema.optional(),
  TRANSFER: paymentMethodFieldsSchema.optional(),
  CARD: paymentMethodFieldsSchema.optional(),
});

export const updateRestaurantSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  logoUrl: z.string().min(1).optional(),
  whatsappPhone: z.string().min(7).max(30).optional(),
  // Plantilla del mensaje de "Enviar vía WhatsApp" (comanda al cliente). Placeholders: {{header}}, {{items}}, {{totales}}.
  whatsappOrderMessageTemplate: z.string().max(2000).optional(),
  // La "casilla de Tasa cambiaria": el restaurante elige en qué moneda
  // coloca sus precios. La conversión a Bs siempre usa la tasa BCV vigente.
  baseCurrency: z.enum(['USD', 'EUR']).optional(),
  theme: restaurantThemeSchema.optional(),

  // Cargos opcionales del checkout (10% de servicio, 16% de IVA).
  serviceChargeEnabled: z.boolean().optional(),
  ivaEnabled: z.boolean().optional(),

  // Si es false, el menú público queda solo para ver (sin carrito/checkout).
  orderingEnabled: z.boolean().optional(),
  // Si es true, los pedidos de mesa (QR) quedan pendientes de aceptar por un mesero antes de ir a cocina.
  requireOrderConfirmation: z.boolean().optional(),

  // Precio de delivery: ubicación del local (origen) y cómo se calcula el envío.
  deliveryOriginLat: z.number().min(-90).max(90).optional(),
  deliveryOriginLng: z.number().min(-180).max(180).optional(),
  deliveryPricingMode: z.enum(['DISABLED', 'DISTANCE', 'ZONE']).optional(),
  deliveryBaseFee: z.coerce.number().nonnegative().optional(),
  deliveryPricePerKm: z.coerce.number().nonnegative().optional(),

  // Métodos de pago disponibles para los clientes del checkout de delivery/pickup.
  paymentMethodsConfig: paymentMethodsConfigSchema.optional(),

  // Modo Cartelera: imagen de pantalla completa en vez del menú.
  fullscreenImageEnabled: z.boolean().optional(),
  fullscreenImageUrl: z.string().min(1).optional(),
});

export type RestaurantTheme = z.infer<typeof restaurantThemeSchema>;
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
