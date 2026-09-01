import { z } from 'zod';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// El correo se guarda y se compara sin importar mayúsculas/minúsculas ni
// espacios alrededor (evita cuentas "duplicadas" por escribirlo distinto).
const emailSchema = z
  .string()
  .email()
  .transform((v) => v.trim().toLowerCase());

export const registerSchema = z.object({
  restaurantName: z.string().min(1).max(120),
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(slugRegex, 'El slug solo puede tener minúsculas, números y guiones.'),
  whatsappPhone: z.string().min(7).max(30).optional(),
  // Moneda en la que el restaurante colocará sus precios ($ o €).
  baseCurrency: z.enum(['USD', 'EUR']).optional().default('USD'),
  ownerName: z.string().min(1).max(120),
  email: emailSchema,
  password: z.string().min(6).max(100),
  // Vertical elegido en /empezar. RESTAURANT por defecto (flujo de siempre);
  // SHOP solo llega desde el registro de "Locales Comerciales", con shopRubro seteado;
  // SPORTS_CLUB desde el registro de "Canchas"; ADMIN_OFFICE desde "Administración".
  businessType: z.enum(['RESTAURANT', 'SHOP', 'SPORTS_CLUB', 'ADMIN_OFFICE']).optional().default('RESTAURANT'),
  shopRubro: z.string().min(1).max(60).optional(),
  // Id del intento de registro que venía siguiéndose (ver registration-funnel): al llegar acá
  // el embudo se cierra como completado. Opcional — el registro nunca depende de esto.
  funnelSessionId: z.string().min(8).max(64).optional(),
});

// "Continuar con Google": el credential (ID token firmado por Google) se verifica
// en el backend, nunca se confía en datos sueltos que mande el cliente. `registration`
// solo viene en la segunda llamada, cuando el usuario ya completó los datos del
// restaurante tras recibir `needsRegistration: true` en la primera.
export const googleAuthSchema = z.object({
  credential: z.string().min(1),
  slug: z.string().min(1).optional(),
  registration: registerSchema.omit({ email: true, password: true }).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  // El email es único por restaurante, no globalmente. Si el navegador ya
  // conoce el slug (login previo) se manda para resolver directo; si no
  // (dispositivo nuevo, storage borrado, miembro de equipo agregado desde
  // otro lugar), el backend busca por email entre todos los restaurantes.
  slug: z.string().min(1).optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .length(6, 'El código debe tener 6 dígitos.')
    .regex(/^\d+$/, 'El código solo puede tener números.'),
  newPassword: z.string().min(6).max(100),
});

// Pantalla de bloqueo: PIN personal de 4 dígitos (cada usuario configura el suyo).
export const setLockPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'El PIN debe tener 4 dígitos.'),
});
export const verifyLockPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'El PIN debe tener 4 dígitos.'),
});
export type SetLockPinInput = z.infer<typeof setLockPinSchema>;
export type VerifyLockPinInput = z.infer<typeof verifyLockPinSchema>;

// Segundo inicio de sesión (tablet compartida): cambiar de mesero sin volver a escribir
// correo y clave, con el PIN de 4 dígitos de la Pantalla de bloqueo (mismo campo, mismo PIN).
export const switchUserSchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, 'El PIN debe tener 4 dígitos.'),
});
export type SwitchUserInput = z.infer<typeof switchUserSchema>;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
