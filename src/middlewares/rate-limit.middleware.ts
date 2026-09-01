import { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/** /auth/login, /auth/register: hasta 20 intentos cada 15 min por IP — deja pasar un
 * usuario real que se equivoca de contraseña varias veces, pero frena fuerza bruta. */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

/** /auth/forgot-password, /auth/reset-password: más estricto (5 cada 15 min) — ya
 * tienen su propio límite de intentos por código (ver auth.service.ts), esto es
 * la capa de por-IP encima de eso. */
export const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

/** Checkout/reserva/booking públicos (comensal o jugador, sin cuenta): checkout dine-in/delivery,
 * reserva de mesa y reserva de cancha. Límite más alto que login porque varios clientes reales
 * pueden compartir la misma IP (wifi del local, NAT de operador), pero igual frena un script
 * creando pedidos o reservas falsas en bucle. */
export const publicBookingRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera unos minutos e intenta de nuevo.' },
});

/** /auth/verify-lock-pin: el PIN de la pantalla de bloqueo es de solo 4 dígitos (10.000
 * combinaciones) — sin límite, cualquiera con el JWT ya válido (dispositivo compartido, token
 * filtrado) lo fuerza-bruta en segundos. Se limita por usuario (no por IP): el JWT ya identifica
 * a quién, y así no se puede esquivar cambiando de IP mientras se reusa el mismo token. */
export const lockPinRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // req.ip crudo rompe la normalización de IPv6 (una misma IP puede escribirse de varias formas
  // válidas) — express-rate-limit trae ipKeyGenerator() justo para eso en el caso de respaldo
  // (no debería usarse casi nunca: esta ruta siempre pasa por authGuard antes, así que req.auth
  // ya viene seteado salvo un bug en otra parte).
  keyGenerator: (req: Request) => req.auth?.userId ?? ipKeyGenerator(req.ip ?? 'unknown'),
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

/** /auth/switch-user: el segundo inicio de sesión de la tablet compartida (mesero A → mesero B
 * con solo el PIN de 4 dígitos, sin correo/clave). Mismo riesgo que lock-pin —10.000
 * combinaciones— pero acá el que intenta NO es todavía la cuenta objetivo (es cualquier mesero
 * ya logueado en esa tablet probando el PIN de otro), así que no sirve limitar por req.auth.userId:
 * dos sesiones cualquiera de la misma tablet podrían repartirse los intentos contra UNA cuenta
 * objetivo y cada una tendría su propia cuota. Se limita por restaurante+cuenta objetivo. */
export const switchUserRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `${req.restaurantId ?? 'x'}:${req.body?.userId ?? 'x'}`,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

/** /auth/identify-waiter: la Tablet de Meseros prueba una clave de 4 dígitos contra TODOS los
 * meseros del restaurante — no hay un "targetUserId" que limitar como en switchUserRateLimit,
 * así que se limita por restaurante entero: cualquiera parado frente a esa tablet comparte la
 * misma cuota, que es justo lo que hay que frenar (fuerza bruta contra el conjunto de claves). */
export const identifyWaiterRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.restaurantId ?? ipKeyGenerator(req.ip ?? 'unknown'),
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

/**
 * Acciones públicas de la mesa (llamar al mesero, pedir la cuenta, poner/quitar la clave).
 *
 * No piden credenciales: basta el qrToken impreso en la mesa. Llamar al mesero dispara una
 * notificación push a TODOS los teléfonos del personal, así que un bucle desde una sola mesa
 * los inunda a todos (y arriesga que FCM marque al remitente); y poner la clave hace un
 * bcrypt(10), que es CPU cara contra un proceso PM2 de una sola instancia.
 *
 * El tope es holgado a propósito: una mesa real llama al mesero un par de veces por comida.
 */
export const publicTableActionRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes seguidas. Espera un momento e intenta de nuevo.' },
});

/**
 * Embudo de registro: lo llama el formulario en cada blur, sin credenciales y con un
 * sessionId que elige quien llama. Sin tope, cualquiera llena la lista de "contactables" del
 * Dashboard maestro con filas inventadas. 60 en 15 min cubre de sobra a una persona real
 * llenando el formulario (son ~6 campos).
 */
export const registrationFunnelRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera unos minutos e intenta de nuevo.' },
});
