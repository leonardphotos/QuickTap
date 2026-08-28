import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { badRequest, conflict, unauthorized } from '../../utils/http-error';
import { isLockedAsync, trialPeriodEnd, trialPlanFor } from '../../utils/subscription';
import { sendMail } from '../../utils/mailer';
import { CURRENCY_SYMBOLS } from '../../utils/money';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { demoResetService } from '../../utils/demo-reset.service';
import { formatVenezuelanWhatsappPhone } from '../../utils/whatsapp';
import { masterWhatsappBotService } from '../master-whatsapp/master-whatsapp-bot.service';
import { platformSettingsService, renderTemplate } from '../platform-settings/platform-settings.service';
import { ForgotPasswordInput, GoogleAuthInput, LoginInput, RegisterInput, ResetPasswordInput } from './auth.dto';

const googleClient = new OAuth2Client();

/** Verifica el ID token de Google contra nuestro Client ID (audience) y devuelve el
 * perfil ya confiable. Nunca se lee email/nombre de lo que mande el cliente sin pasar
 * por acá primero — el token viene firmado por Google, así que esto es lo único que
 * garantiza que de verdad es esa cuenta de Google. */
async function verifyGoogleToken(credential: string) {
  if (!env.google.clientId) {
    throw badRequest('El inicio de sesión con Google no está configurado en este servidor.');
  }
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.google.clientId });
    payload = ticket.getPayload();
  } catch {
    throw unauthorized('El token de Google no es válido o venció. Intenta de nuevo.');
  }
  if (!payload?.sub || !payload.email) {
    throw unauthorized('Google no devolvió los datos esperados.');
  }
  if (!payload.email_verified) {
    throw unauthorized('Tu email de Google no está verificado.');
  }
  return {
    googleId: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: payload.name ?? payload.email,
  };
}

const RESET_CODE_TTL_MINUTES = 15;
const RESET_CODE_MAX_ATTEMPTS = 5;

function generateResetCode(): string {
  // crypto.randomInt (no Math.random): el código habilita cambiar la
  // contraseña, así que su generación debe ser impredecible de verdad.
  return String(crypto.randomInt(100000, 1000000));
}

function hashResetCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export function signToken(payload: { userId: string; restaurantId: string; role: string; parentRestaurantId?: string }) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

// Forma completa del restaurante que el frontend espera en todo momento
// (login/register/me deben devolver siempre la misma forma).
const RESTAURANT_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  logoUrl: true,
  businessType: true,
  shopRubro: true,
  shopDeliveryFee: true,
  whatsappPhone: true,
  whatsappOrderMessageTemplate: true,
  baseCurrency: true,
  shopBsSaleRate: true,
  theme: true,
  serviceChargeEnabled: true,
  modifierInventoryLinkEnabled: true,
  lockScreenEnabled: true,
  ivaEnabled: true,
  rif: true,
  orderingEnabled: true,
  requireOrderConfirmation: true,
  clubTabletPaymentsEnabled: true,
  deliveryOriginLat: true,
  deliveryOriginLng: true,
  deliveryPricingMode: true,
  deliveryBaseFee: true,
  deliveryPricePerKm: true,
  deliveryAutoOpenOnPaid: true,
  deliveryAutoAssignOnPaid: true,
  deliveryAutoAssignOnAccept: true,
  paymentMethodsConfig: true,
  requireCustomerData: true,
  fullscreenImageEnabled: true,
  fullscreenImageUrl: true,
  screenDisplayMode: true,
  screenCategoryIds: true,
  screenProductIds: true,
  screenPageIntervalSec: true,
  screenItemsPerPage: true,
  subscriptionStatus: true,
  subscriptionPlan: true,
  billingCycle: true,
  periodEnd: true,
  suspended: true,
  customAdministration: true,
  customInventoryBasic: true,
  customInventoryRecipe: true,
  customAccountsPayable: true,
  legacyFullAccessUntil: true,
  parentRestaurantId: true,
  pendingWelcomePlan: true,
  deleteOrderPinHash: true,
  lockScreenIntervals: true,
  isDemo: true,
  demoAdminUnlocked: true,
  inventoryMode: true,
  casaMatrizEnabled: true,
} as const;

type RestaurantRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  businessType: 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB' | 'ADMIN_OFFICE';
  shopRubro: string | null;
  shopDeliveryFee: Prisma.Decimal | null;
  whatsappPhone: string | null;
  whatsappOrderMessageTemplate: string | null;
  baseCurrency: 'USD' | 'EUR';
  shopBsSaleRate: Prisma.Decimal | null;
  theme: unknown;
  serviceChargeEnabled: boolean;
  modifierInventoryLinkEnabled: boolean;
  lockScreenEnabled: boolean;
  ivaEnabled: boolean;
  rif: string | null;
  orderingEnabled: boolean;
  requireOrderConfirmation: boolean;
  clubTabletPaymentsEnabled: boolean;
  deliveryOriginLat: number | null;
  deliveryOriginLng: number | null;
  deliveryPricingMode: 'DISABLED' | 'DISTANCE' | 'ZONE';
  deliveryBaseFee: Prisma.Decimal;
  deliveryPricePerKm: Prisma.Decimal;
  deliveryAutoOpenOnPaid: boolean;
  deliveryAutoAssignOnPaid: boolean;
  deliveryAutoAssignOnAccept: boolean;
  paymentMethodsConfig: unknown;
  requireCustomerData: boolean;
  fullscreenImageEnabled: boolean;
  fullscreenImageUrl: string | null;
  screenDisplayMode: string;
  screenCategoryIds: unknown;
  screenProductIds: unknown;
  screenPageIntervalSec: number;
  screenItemsPerPage: number;
  subscriptionStatus: 'TRIALING' | 'ACTIVE';
  subscriptionPlan: string | null;
  billingCycle: string | null;
  periodEnd: Date;
  suspended: boolean;
  customAdministration: boolean;
  customInventoryBasic: boolean;
  customInventoryRecipe: boolean;
  customAccountsPayable: boolean;
  legacyFullAccessUntil: Date | null;
  parentRestaurantId: string | null;
  pendingWelcomePlan: string | null;
  deleteOrderPinHash: string | null;
  lockScreenIntervals: unknown;
  isDemo: boolean;
  demoAdminUnlocked: boolean;
  inventoryMode: string;
  casaMatrizEnabled: boolean;
};

/** Forma que el frontend consume: agrega `locked`, calculado en vivo (nunca persistido; ver isLockedAsync),
 * y `currencySymbol`/`exchangeRate` (usados por el kiosco Comanda para mostrar precios en Bs y $, igual
 * que ya hace el menú público). */
async function serializeRestaurant(restaurant: RestaurantRow) {
  let exchangeRate: { rateBs: string; fetchedAt: Date } | null = null;
  try {
    const rate = await exchangeRateService.getRate(restaurant.baseCurrency, restaurant.id);
    exchangeRate = { rateBs: rate.rateBs.toString(), fetchedAt: rate.fetchedAt };
  } catch {
    exchangeRate = null;
  }

  // Un restaurante solo ve la pestaña "Canchas" si de verdad tiene algún club
  // vinculado (ver ClubRestaurantLink). Consulta aparte para no tocar el select
  // de RestaurantRow, que comparten login / registro / /auth/me.
  const linkedClubs =
    restaurant.businessType === 'SPORTS_CLUB'
      ? 0
      : await prisma.clubRestaurantLink.count({ where: { restaurantId: restaurant.id } });

  return {
    id: restaurant.id,
    slug: restaurant.slug,
    name: restaurant.name,
    description: restaurant.description,
    logoUrl: restaurant.logoUrl,
    businessType: restaurant.businessType,
    shopRubro: restaurant.shopRubro,
    shopDeliveryFee: restaurant.shopDeliveryFee != null ? Number(restaurant.shopDeliveryFee) : null,
    whatsappPhone: restaurant.whatsappPhone,
    whatsappOrderMessageTemplate: restaurant.whatsappOrderMessageTemplate,
    baseCurrency: restaurant.baseCurrency,
    currencySymbol: CURRENCY_SYMBOLS[restaurant.baseCurrency],
    exchangeRate,
    shopBsSaleRate: restaurant.shopBsSaleRate != null ? Number(restaurant.shopBsSaleRate) : null,
    theme: restaurant.theme,
    isDemo: restaurant.isDemo,
    demoAdminUnlocked: restaurant.demoAdminUnlocked,
    inventoryMode: restaurant.inventoryMode,
    casaMatrizEnabled: restaurant.casaMatrizEnabled,
    serviceChargeEnabled: restaurant.serviceChargeEnabled,
    modifierInventoryLinkEnabled: restaurant.modifierInventoryLinkEnabled,
    lockScreenEnabled: restaurant.lockScreenEnabled,
    ivaEnabled: restaurant.ivaEnabled,
    rif: restaurant.rif,
    orderingEnabled: restaurant.orderingEnabled,
    requireOrderConfirmation: restaurant.requireOrderConfirmation,
    clubTabletPaymentsEnabled: restaurant.clubTabletPaymentsEnabled,
    deliveryOriginLat: restaurant.deliveryOriginLat,
    deliveryOriginLng: restaurant.deliveryOriginLng,
    deliveryPricingMode: restaurant.deliveryPricingMode,
    deliveryBaseFee: restaurant.deliveryBaseFee,
    deliveryPricePerKm: restaurant.deliveryPricePerKm,
    deliveryAutoOpenOnPaid: restaurant.deliveryAutoOpenOnPaid,
    deliveryAutoAssignOnPaid: restaurant.deliveryAutoAssignOnPaid,
    deliveryAutoAssignOnAccept: restaurant.deliveryAutoAssignOnAccept,
    paymentMethodsConfig: restaurant.paymentMethodsConfig,
    requireCustomerData: restaurant.requireCustomerData,
    fullscreenImageEnabled: restaurant.fullscreenImageEnabled,
    fullscreenImageUrl: restaurant.fullscreenImageUrl,
    screenDisplayMode: restaurant.screenDisplayMode,
    screenCategoryIds: (restaurant.screenCategoryIds as string[] | null) ?? [],
    screenProductIds: (restaurant.screenProductIds as string[] | null) ?? [],
    screenPageIntervalSec: restaurant.screenPageIntervalSec,
    screenItemsPerPage: restaurant.screenItemsPerPage,
    subscriptionStatus: restaurant.subscriptionStatus,
    subscriptionPlan: restaurant.subscriptionPlan,
    billingCycle: restaurant.billingCycle,
    periodEnd: restaurant.periodEnd,
    suspended: restaurant.suspended,
    customAdministration: restaurant.customAdministration,
    customInventoryBasic: restaurant.customInventoryBasic,
    customInventoryRecipe: restaurant.customInventoryRecipe,
    customAccountsPayable: restaurant.customAccountsPayable,
    legacyFullAccessUntil: restaurant.legacyFullAccessUntil,
    parentRestaurantId: restaurant.parentRestaurantId,
    pendingWelcomePlan: restaurant.pendingWelcomePlan,
    hasDeleteOrderPin: !!restaurant.deleteOrderPinHash,
    lockScreenIntervals: (restaurant.lockScreenIntervals as Record<string, number>) ?? {},
    linkedClubs,
    locked: await isLockedAsync(restaurant),
  };
}

/**
 * Bienvenida por WhatsApp al registrarse (ver master-whatsapp-bot.service.ts): usa el mismo
 * WhatsApp del negocio que el restaurante acaba de escribir en el registro (Restaurant.
 * whatsappPhone) — no hay un campo separado de "WhatsApp del dueño". Fire-and-forget: nunca
 * debe tumbar el registro si el bot de plataforma está desconectado o falla.
 */
function sendMasterWelcomeMessage(restaurant: { name: string; whatsappPhone: string | null }, ownerName: string): void {
  if (!restaurant.whatsappPhone) return;
  const phone = formatVenezuelanWhatsappPhone(restaurant.whatsappPhone).replace(/\D/g, '');
  platformSettingsService
    .getMessageTemplates()
    .then((templates) => {
      const message = renderTemplate(templates.welcomeMessage, { ownerName, restaurantName: restaurant.name });
      return masterWhatsappBotService.sendMessage(phone, message);
    })
    .catch(() => undefined);
}

/**
 * Aviso al número verificador (Ajustes → WhatsApp del Dashboard maestro) de que un restaurante
 * nuevo acaba de registrarse — mismo número que ya recibe los comprobantes de renovación. Fire
 * and forget, igual que la bienvenida: nunca debe tumbar el registro. Sin número verificador
 * configurado, no manda nada (no hay a quién avisarle).
 */
function sendNewSignupAlertToVerifier(restaurant: { name: string; businessType: string; slug: string }, ownerName: string): void {
  Promise.all([platformSettingsService.getSubscriptionVerifierPhone(), platformSettingsService.getMessageTemplates()])
    .then(([verifierPhone, templates]) => {
      if (!verifierPhone) return;
      const mensaje = renderTemplate(templates.newSignupAlertMessage, {
        restaurantName: restaurant.name,
        ownerName,
        businessType: restaurant.businessType,
        slug: restaurant.slug,
      });
      return masterWhatsappBotService.sendMessage(verifierPhone, mensaje);
    })
    .catch(() => undefined);
}

export const authService = {
  /** Registro de un restaurante nuevo + su usuario dueño (OWNER). Arranca en TRIALING (15 días). */
  async register(input: RegisterInput) {
    const existingSlug = await prisma.restaurant.findUnique({ where: { slug: input.slug } });
    if (existingSlug) throw conflict('Ese slug ya está en uso.');

    const passwordHash = await bcrypt.hash(input.password, 10);

    const restaurant = await prisma.restaurant.create({
      data: {
        slug: input.slug,
        name: input.restaurantName,
        businessType: input.businessType,
        shopRubro: input.businessType === 'SHOP' ? input.shopRubro : undefined,
        whatsappPhone: input.whatsappPhone,
        baseCurrency: input.baseCurrency,
        periodEnd: trialPeriodEnd(),
        // Los 15 días de prueba arrancan con el plan más completo ya asignado (Elite en
        // restaurantes, el plan único del vertical en los demás) para que el dueño pruebe
        // TODO el producto —incluida Sucursales— antes de elegir/pagar un plan en
        // Facturación. BillingPage sigue mostrando "Activar plan" igual, porque eso depende
        // de subscriptionStatus (TRIALING), no de qué plan tenga asignado.
        subscriptionPlan: trialPlanFor(input.businessType),
        users: {
          create: {
            email: input.email,
            passwordHash,
            name: input.ownerName,
            role: 'OWNER',
          },
        },
      },
      include: { users: true },
    });

    const owner = restaurant.users[0];
    sendMasterWelcomeMessage(restaurant, owner.name);
    sendNewSignupAlertToVerifier(restaurant, owner.name);
    const token = signToken({ userId: owner.id, restaurantId: restaurant.id, role: owner.role });

    return {
      token,
      restaurant: await serializeRestaurant(restaurant),
      user: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        canAccessInventory: owner.canAccessInventory,
        cashierFullAccess: owner.cashierFullAccess,
        hasLockPin: !!owner.lockPinHash,
      },
    };
  },

  async login(input: LoginInput) {
    // El slug guardado en el navegador es solo un atajo (evita probar contra
    // todos los restaurantes). Si ya no sirve —el restaurante fue borrado o
    // desactivado, o esa cuenta ya no está ahí— NO cortamos el login: seguimos
    // abajo y probamos por email en todos los restaurantes antes de rendirnos.
    // Así un slug viejo en localStorage nunca bloquea un login válido.
    if (input.slug) {
      const restaurant = await prisma.restaurant.findUnique({ where: { slug: input.slug } });
      if (restaurant?.isActive) {
        const user = await prisma.user.findFirst({
          where: { restaurantId: restaurant.id, email: { equals: input.email, mode: 'insensitive' }, isActive: true },
        });
        if (user?.passwordHash && (await bcrypt.compare(input.password, user.passwordHash))) {
          return this.buildSession(user, restaurant);
        }
      }
    }

    // Sin slug (dispositivo nuevo o storage borrado), o el slug guardado ya no
    // sirve: el email es único por restaurante, no globalmente, así que puede
    // haber más de un candidato. Se prueba la contraseña contra cada uno hasta
    // encontrar coincidencia.
    const candidates = await prisma.user.findMany({
      where: { email: { equals: input.email, mode: 'insensitive' }, isActive: true, restaurant: { isActive: true } },
      include: { restaurant: true },
    });

    for (const candidate of candidates) {
      if (!candidate.passwordHash) continue; // cuenta creada solo con Google, sin contraseña
      const valid = await bcrypt.compare(input.password, candidate.passwordHash);
      if (valid) return this.buildSession(candidate, candidate.restaurant);
    }

    throw unauthorized('Credenciales inválidas.');
  },

  /**
   * "Continuar con Google" — login automático o registro de una cuenta nueva.
   * El `credential` (ID token) SIEMPRE se verifica contra Google antes de confiar en
   * el email/nombre que trae, en ambas llamadas (con o sin `registration`).
   *
   * 1. Sin `registration`: busca una cuenta existente por googleId y, si no hay,
   *    por email — si encuentra una cuenta con contraseña que todavía no tiene
   *    googleId, la vincula sola (así una cuenta vieja por contraseña también puede
   *    entrar con un clic de ahí en adelante). Sin ningún candidato, devuelve
   *    `needsRegistration` en vez de fallar: el frontend pide los datos del
   *    restaurante y vuelve a llamar esto con `registration` lleno.
   * 2. Con `registration`: crea Restaurant + User igual que `register()`, pero sin
   *    contraseña (passwordHash null) y con el googleId ya vinculado.
   */
  async googleAuth(input: GoogleAuthInput) {
    const google = await verifyGoogleToken(input.credential);

    if (input.registration) {
      const existingSlug = await prisma.restaurant.findUnique({ where: { slug: input.registration.slug } });
      if (existingSlug) throw conflict('Ese slug ya está en uso.');

      const restaurant = await prisma.restaurant.create({
        data: {
          slug: input.registration.slug,
          name: input.registration.restaurantName,
          businessType: input.registration.businessType,
          shopRubro: input.registration.businessType === 'SHOP' ? input.registration.shopRubro : undefined,
          whatsappPhone: input.registration.whatsappPhone,
          baseCurrency: input.registration.baseCurrency,
          periodEnd: trialPeriodEnd(),
          // Ver el mismo comentario en register(): arranca la prueba con el plan más
          // completo ya asignado.
          subscriptionPlan: trialPlanFor(input.registration.businessType),
          users: {
            create: {
              email: google.email,
              name: google.name,
              googleId: google.googleId,
              role: 'OWNER',
            },
          },
        },
        include: { users: true },
      });

      const owner = restaurant.users[0];
      sendMasterWelcomeMessage(restaurant, owner.name);
    sendNewSignupAlertToVerifier(restaurant, owner.name);
      return this.buildSession(owner, restaurant);
    }

    if (input.slug) {
      const restaurant = await prisma.restaurant.findUnique({ where: { slug: input.slug } });
      if (restaurant?.isActive) {
        const user = await prisma.user.findFirst({
          where: { restaurantId: restaurant.id, isActive: true, OR: [{ googleId: google.googleId }, { email: google.email }] },
        });
        if (user) return this.googleSession(user, restaurant, google.googleId);
      }
    }

    const candidates = await prisma.user.findMany({
      where: {
        isActive: true,
        restaurant: { isActive: true },
        OR: [{ googleId: google.googleId }, { email: { equals: google.email, mode: 'insensitive' } }],
      },
      include: { restaurant: true },
    });

    if (candidates.length === 0) {
      return { needsRegistration: true as const, email: google.email, name: google.name };
    }
    if (candidates.length > 1) {
      throw conflict('Ese correo tiene cuenta en varios restaurantes — inicia sesión con contraseña para elegir cuál.');
    }

    const [candidate] = candidates;
    return this.googleSession(candidate, candidate.restaurant, google.googleId);
  },

  /** Arma la sesión para un match encontrado por googleAuth, vinculando el googleId
   * a la cuenta si todavía no lo tenía (ej. cuenta vieja creada por contraseña, que
   * a partir de ahora también puede entrar con un clic). */
  async googleSession(
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      canAccessInventory: boolean;
      cashierFullAccess: boolean;
      lockPinHash: string | null;
      googleId: string | null;
    },
    restaurant: RestaurantRow,
    googleId: string,
  ) {
    if (!user.googleId) {
      await prisma.user.update({ where: { id: user.id }, data: { googleId } });
    }
    return this.buildSession(user, restaurant);
  },

  /**
   * Entorno Demo Efímero: si la sesión que cierra es la cuenta demo, resetea
   * el restaurante de inmediato (borra y vuelve a sembrar) en vez de esperar
   * al barrido de inactividad. Acepta el token por header Bearer (logout
   * normal) o en el body (navigator.sendBeacon del cierre de pestaña, que no
   * puede mandar headers) — siempre responde silenciosamente ante cualquier
   * problema: un logout nunca debe fallar de forma visible para el usuario.
   */
  async logout(token: string | undefined) {
    if (!token) return;
    let payload: { restaurantId?: string };
    try {
      payload = jwt.verify(token, env.jwtSecret) as { restaurantId?: string };
    } catch {
      return;
    }
    if (!payload.restaurantId) return;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: payload.restaurantId },
      select: { isDemo: true },
    });
    if (restaurant?.isDemo) {
      await demoResetService.reset();
    }
  },

  async buildSession(
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      canAccessInventory: boolean;
      cashierFullAccess: boolean;
      lockPinHash: string | null;
    },
    restaurant: RestaurantRow,
  ) {
    const token = signToken({ userId: user.id, restaurantId: restaurant.id, role: user.role });
    return {
      token,
      restaurant: await serializeRestaurant(restaurant),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        canAccessInventory: user.canAccessInventory,
        cashierFullAccess: user.cashierFullAccess,
        hasLockPin: !!user.lockPinHash,
      },
    };
  },

  async me(restaurantId: string, userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, restaurantId },
      select: { id: true, name: true, email: true, role: true, canAccessInventory: true, cashierFullAccess: true, lockPinHash: true },
    });
    if (!user) throw unauthorized();

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: RESTAURANT_SELECT,
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        canAccessInventory: user.canAccessInventory,
        cashierFullAccess: user.cashierFullAccess,
        hasLockPin: !!user.lockPinHash,
      },
      restaurant: restaurant ? await serializeRestaurant(restaurant) : null,
    };
  },

  /** Ajustes → Pantalla de bloqueo: cada usuario crea/cambia su propio PIN de 4 dígitos. */
  async setLockPin(userId: string, pin: string) {
    const lockPinHash = await bcrypt.hash(pin, 10);
    await prisma.user.update({ where: { id: userId }, data: { lockPinHash } });
    return { done: true };
  },

  /** Re-solicitud periódica de la Pantalla de bloqueo: nunca lanza por PIN incorrecto, solo informa. */
  async verifyLockPin(userId: string, pin: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { lockPinHash: true } });
    if (!user?.lockPinHash) return { valid: false };
    const valid = await bcrypt.compare(pin, user.lockPinHash);
    return { valid };
  },

  /**
   * Genera un código de 6 dígitos y lo envía por correo. El email es único
   * por restaurante (no globalmente), así que un mismo correo puede tener
   * cuentas en varios restaurantes: todas reciben el mismo código y se
   * actualizan juntas al confirmar (ver resetPassword). Por seguridad, si el
   * correo no existe no se revela: la respuesta es igual en ambos casos.
   */
  async forgotPassword(input: ForgotPasswordInput) {
    const candidates = await prisma.user.findMany({
      where: {
        email: { equals: input.email, mode: 'insensitive' },
        isActive: true,
        // Entorno Demo Efímero: nunca se emite un código para una cuenta del
        // restaurante demo — mismo "no revela nada" que el caso de abajo.
        restaurant: { isActive: true, isDemo: false },
      },
    });
    if (candidates.length === 0) return;

    // Evita reenvíos en cadena: si ya hay un código vigente pedido hace menos
    // de un minuto, no se genera ni se envía uno nuevo.
    const recent = candidates.find(
      (c) => c.resetCodeExpiresAt && c.resetCodeExpiresAt.getTime() - Date.now() > (RESET_CODE_TTL_MINUTES - 1) * 60 * 1000,
    );
    if (recent) return;

    const code = generateResetCode();
    const resetCodeHash = hashResetCode(code);
    const resetCodeExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000);

    await prisma.user.updateMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      data: { resetCodeHash, resetCodeExpiresAt, resetCodeAttempts: 0 },
    });

    await sendMail(
      input.email,
      'Tu código para restablecer la contraseña — QuickTap.club',
      `<p>Usa este código para restablecer tu contraseña en QuickTap.club:</p>
       <p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p>
       <p>Vence en ${RESET_CODE_TTL_MINUTES} minutos. Si no fuiste tú, ignora este correo.</p>`,
    );
  },

  /** Valida el código y actualiza la contraseña en todas las cuentas que compartan ese correo. */
  async resetPassword(input: ResetPasswordInput) {
    const candidates = await prisma.user.findMany({
      where: {
        email: { equals: input.email, mode: 'insensitive' },
        isActive: true,
        restaurant: { isActive: true },
        resetCodeHash: { not: null },
        resetCodeExpiresAt: { gt: new Date() },
      },
    });
    if (candidates.length === 0) throw badRequest('El código es inválido o ya venció. Pide uno nuevo.');

    const codeHash = hashResetCode(input.code);
    const valid = candidates.some((c) => c.resetCodeHash === codeHash);

    if (!valid) {
      const ids = candidates.map((c) => c.id);
      const attempts = candidates[0].resetCodeAttempts + 1;
      if (attempts >= RESET_CODE_MAX_ATTEMPTS) {
        // Demasiados intentos: se invalida el código, hay que pedir uno nuevo.
        await prisma.user.updateMany({
          where: { id: { in: ids } },
          data: { resetCodeHash: null, resetCodeExpiresAt: null, resetCodeAttempts: 0 },
        });
        throw badRequest('Demasiados intentos. Pide un código nuevo.');
      }
      await prisma.user.updateMany({ where: { id: { in: ids } }, data: { resetCodeAttempts: attempts } });
      throw badRequest('Código incorrecto.');
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 10);
    await prisma.user.updateMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      data: { passwordHash, resetCodeHash: null, resetCodeExpiresAt: null, resetCodeAttempts: 0 },
    });
  },
};
