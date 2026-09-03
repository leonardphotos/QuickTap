import { z } from 'zod';
import { LOCK_SCREEN_ROLES } from '../../utils/roles';

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
  // Color del texto de la biografía (descripción) en el banner. Sin definir =
  // blanco semitransparente (el valor de siempre).
  bioColor: hexColor.optional(),
  // Difumina la foto de portada del banner (no aplica si no hay foto). Default: apagado.
  bannerBlurEnabled: z.boolean().optional(),
  // "gradient" (de siempre, se desvanece hacia blanco) o "solid" (color/foto sin desvanecer).
  bannerStyle: z.enum(['gradient', 'solid']).optional(),
  socialLinks: restaurantSocialLinksSchema.optional(),
});

// Métodos de pago que el restaurante ofrece a SUS clientes en el checkout de
// delivery/pickup. Cada uno se puede activar/desactivar y traer sus propios
// datos (cuenta, correo, etc.) para que el cliente sepa a dónde pagar.

// Una cuenta receptora ADICIONAL de un método (el segundo Zelle, el segundo Pago
// Móvil…). Mismos campos que la cuenta principal, más `key` (id estable para la UI)
// y `label` (cómo distinguirla al elegir en caja: "Zelle Chase", "PM Banesco").
const paymentMethodExtraAccountSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().max(60).optional(),
  banco: z.string().max(80).optional(),
  telefono: z.string().max(30).optional(),
  cedula: z.string().max(30).optional(),
  titular: z.string().max(120).optional(),
  correo: z.string().max(120).optional(),
  id: z.string().max(80).optional(),
  cuenta: z.string().max(40).optional(),
  rif: z.string().max(30).optional(),
  // Cadena vacía = se quitó el QR: la UI mandaba '' y el `min(1)` hacía fallar TODO el
  // guardado de métodos de pago con "Datos de entrada inválidos".
  qrImageUrl: z.string().nullish().transform((v) => (v ? v : undefined)),
  // Vínculo con una cuenta bancaria registrada (Administración → Cuentas bancarias):
  // el cobro que entre por esta cuenta suma su saldo allá. null = sin vincular.
  bankAccountId: z.string().max(60).nullish(),
});

const paymentMethodFieldsSchema = z.object({
  enabled: z.boolean().optional(),
  label: z.string().max(60).optional(),
  banco: z.string().max(80).optional(),
  telefono: z.string().max(30).optional(),
  cedula: z.string().max(30).optional(),
  titular: z.string().max(120).optional(),
  correo: z.string().max(120).optional(),
  id: z.string().max(80).optional(),
  cuenta: z.string().max(40).optional(),
  rif: z.string().max(30).optional(),
  // QR que se muestra al cliente en pantalla al cobrar, para que lo escanee: Pago Móvil
  // (banco/Suiche 7B), Zelle y Binance. Los demás métodos no lo usan.
  // Cadena vacía = se quitó el QR: la UI mandaba '' y el `min(1)` hacía fallar TODO el
  // guardado de métodos de pago con "Datos de entrada inválidos".
  qrImageUrl: z.string().nullish().transform((v) => (v ? v : undefined)),
  // Cuenta bancaria vinculada a la cuenta principal del método (ver arriba).
  bankAccountId: z.string().max(60).nullish(),
  // Cuentas adicionales del mismo método: varios Zelle, varios Pago Móvil…
  extraAccounts: z.array(paymentMethodExtraAccountSchema).max(10).optional(),
});

export const paymentMethodsConfigSchema = z.object({
  CASH: paymentMethodFieldsSchema.optional(),
  // La UI ofrece "Efectivo $" desde siempre; sin esta llave, z.object la
  // recortaba en silencio al guardar y el interruptor nunca persistía.
  CASH_USD: paymentMethodFieldsSchema.optional(),
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

  // Doble precio (Local Comercial): tasa propia para Pago Móvil/Transferencia en el POS de Shop.
  // null limpia la tasa (vuelve a usar la de referencia para esos métodos).
  shopBsSaleRate: z.coerce.number().positive().nullable().optional(),

  // Cargo opcional del checkout (10% de servicio). El IVA (16%) NO va aquí — solo lo activa
  // el equipo QuickTap desde el Master Dashboard (ver master-restaurants.dto.ts), y solo si
  // el restaurante ya tiene su RIF registrado.
  serviceChargeEnabled: z.boolean().optional(),
  // Interruptor del vínculo modificador -> insumo (botón en Inventario).
  modifierInventoryLinkEnabled: z.boolean().optional(),
  // Bloquear pedidos cuando no queda stock (ver assertHayStock en order.service.ts).
  blockOrdersWithoutStock: z.boolean().optional(),
  // RIF fiscal del restaurante, informativo — condición para que QuickTap pueda activarle el IVA.
  rif: z.string().max(30).optional(),

  // Si es false, el menú público queda solo para ver (sin carrito/checkout).
  orderingEnabled: z.boolean().optional(),
  // Tarifa plana de envío de la tienda virtual del Local Comercial (ver Restaurant.shopDeliveryFee).
  shopDeliveryFee: z.coerce.number().min(0).max(100000).optional(),
  // Si es true, los pedidos de mesa (QR) quedan pendientes de aceptar por un mesero antes de ir a cocina.
  requireOrderConfirmation: z.boolean().optional(),
  // CRM: exigir nombre y teléfono del cliente en toda venta (POS del Local, delivery).
  requireCustomerData: z.boolean().optional(),
  // Si es false, la tablet de la cancha deja de ofrecer "Pagar" (solo detalle de cuenta).
  clubTabletPaymentsEnabled: z.boolean().optional(),

  // Precio de delivery: ubicación del local (origen) y cómo se calcula el envío.
  deliveryOriginLat: z.number().min(-90).max(90).optional(),
  deliveryOriginLng: z.number().min(-180).max(180).optional(),
  deliveryPricingMode: z.enum(['DISABLED', 'DISTANCE', 'ZONE']).optional(),
  deliveryBaseFee: z.coerce.number().nonnegative().optional(),
  deliveryPricePerKm: z.coerce.number().nonnegative().optional(),
  // Despacho al terminar de cobrar: abrir la ventana de repartidores, o
  // elegir repartidor automáticamente (ver Restaurant en schema.prisma).
  deliveryAutoOpenOnPaid: z.boolean().optional(),
  deliveryAutoAssignOnPaid: z.boolean().optional(),
  // Elige repartidor automáticamente apenas se acepta el pedido, sin esperar el cobro.
  deliveryAutoAssignOnAccept: z.boolean().optional(),

  // Métodos de pago disponibles para los clientes del checkout de delivery/pickup.
  paymentMethodsConfig: paymentMethodsConfigSchema.optional(),

  // Modo Cartelera: imagen de pantalla completa en vez del menú.
  fullscreenImageEnabled: z.boolean().optional(),
  fullscreenImageUrl: z.string().min(1).optional(),

  // Ajustes -> Pantalla: qué muestra el carrusel del rol SCREEN (ver ScreenPage.tsx).
  screenDisplayMode: z.enum(['ALL', 'CATEGORIES', 'PRODUCTS']).optional(),
  screenCategoryIds: z.array(z.string()).optional(),
  screenProductIds: z.array(z.string()).optional(),
  screenPageIntervalSec: z.union([z.literal(3), z.literal(6), z.literal(10), z.literal(20)]).optional(),
  screenItemsPerPage: z.union([z.literal(2), z.literal(4), z.literal(6)]).optional(),

  // Plan Sucursales: inventario por sede (de siempre) o compartido entre todas las sedes
  // del grupo, y ventana opcional de Casa Matriz. Solo se aplican desde la sede principal
  // (ver restaurant.service.ts update()).
  inventoryMode: z.enum(['PER_BRANCH', 'SHARED']).optional(),
  casaMatrizEnabled: z.boolean().optional(),
});

export type RestaurantTheme = z.infer<typeof restaurantThemeSchema>;
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (usa HH:mm).');

// Una fila por día de la semana (0=domingo..6=sábado). El frontend siempre
// manda las 7 a la vez (Ajustes → Horario), así que se reemplaza completo.
export const scheduleDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  isClosed: z.boolean().optional().default(false),
  openTime: timeString.optional(),
  closeTime: timeString.optional(),
});

export const updateScheduleSchema = z.array(scheduleDaySchema).length(7, 'Debes enviar las 7 filas (Lunes a Domingo).');

export type ScheduleDayInput = z.infer<typeof scheduleDaySchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;

// Ajustes → código de 6 dígitos que el Mesero debe ingresar para eliminar una comanda.
export const setDeleteOrderPinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos.'),
});
export type SetDeleteOrderPinInput = z.infer<typeof setDeleteOrderPinSchema>;

// Entorno Demo Efímero → Ajustes → "Modo administrador": código fijo de 4 dígitos
// que exime al restaurante demo del reset automático (ver demo-reset.service.ts).
export const demoAdminUnlockSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'El código debe tener 4 dígitos.'),
});
export type DemoAdminUnlockInput = z.infer<typeof demoAdminUnlockSchema>;

// Ajustes → Pantalla de bloqueo: minutos de inactividad antes de re-pedir el PIN, por rol.
// Solo Dueño/Admin lo editan. Las claves son un subconjunto de LOCK_SCREEN_ROLES —
// un rol omitido simplemente conserva el valor por defecto (ver DEFAULT_LOCK_SCREEN_MINUTES).
export const updateLockScreenIntervalsSchema = z.record(
  z.enum(LOCK_SCREEN_ROLES),
  z.union([z.literal(1), z.literal(5), z.literal(10)]),
);
export type UpdateLockScreenIntervalsInput = z.infer<typeof updateLockScreenIntervalsSchema>;

// Ajustes → Pantalla de bloqueo: interruptor general. Va en su propio endpoint (y no en
// updateRestaurantSchema) porque `PATCH /restaurant` lo puede llamar un CASHIER, y apagar
// el bloqueo es un control de seguridad que solo debe estar en manos de Dueño/Admin.
export const setLockScreenEnabledSchema = z.object({ enabled: z.boolean() });
