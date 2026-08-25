import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { badRequest } from '../../utils/http-error';
import { telefonoCanonico } from '../../utils/phone';
import { enviarSms } from '../../utils/sms';
import type { WalletPayload } from './wallet.service';

/**
 * Alta y entrada al Wallet con clave propia.
 *
 * El flujo de primera vez: teléfono + cédula → código de 4 dígitos por SMS → el cliente crea su
 * clave → adentro. Las siguientes veces: teléfono + clave. La cédula sola dejó de ser la llave
 * porque es un dato semipúblico — cualquiera que conozca a la persona la tiene. El SMS prueba
 * que quien se registra TIENE el teléfono, que es la identidad real de la cuenta.
 *
 * La cuenta (`WalletAccount`) vive por teléfono canónico, no por Customer: la ficha de cliente
 * es por restaurante y una persona tiene varias, pero su clave es una sola.
 */

const CODIGO_VIGENCIA_MIN = 10;
const CODIGO_MAX_INTENTOS = 5;
const REENVIO_SEGUNDOS = 60;
const WALLET_TOKEN_DAYS = 30;
const SETUP_TOKEN_MIN = 15;

interface SetupPayload {
  phone: string; // canónico
  customerId: string;
  scope: 'wallet-setup';
}

function soloDigitos(v: string): string {
  return v.replace(/\D/g, '');
}

/** El Customer que respalda una sesión: cualquiera de las fichas con ese teléfono sirve —
 * todas las lecturas del portal cruzan negocios por teléfono canónico, no por id. */
async function clientePorTelefono(telefono: string) {
  const candidatos = await prisma.customer.findMany({
    where: { phone: { contains: telefono.slice(-7) } },
    select: { id: true, name: true, phone: true, idNumber: true },
  });
  return candidatos.filter((c) => telefonoCanonico(c.phone) === telefono);
}

function sesionDe(customerId: string, name: string) {
  const payload: WalletPayload = { customerId, scope: 'wallet' };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: `${WALLET_TOKEN_DAYS}d` });
  return { token, customer: { id: customerId, name } };
}

export const walletAuthService = {
  /**
   * Qué pide el login para este teléfono. `tieneClave` es lo único que se revela — sirve para
   * que la pantalla cambie la casilla de cédula por la de clave. No dice si el teléfono es
   * cliente de algún negocio: eso se responde igual para todos al pedir el código.
   */
  async estado(phone: string) {
    const telefono = telefonoCanonico(phone);
    if (telefono.length < 7) return { tieneClave: false };
    const cuenta = await prisma.walletAccount.findUnique({ where: { phone: telefono }, select: { passwordHash: true } });
    return { tieneClave: !!cuenta?.passwordHash };
  },

  /**
   * Primera vez: valida teléfono + cédula contra las fichas de cliente y manda el código.
   *
   * El mensaje de error es el mismo para "no existe" y "cédula equivocada", igual que el login
   * clásico: distinguirlos permitiría averiguar qué teléfonos están registrados.
   */
  async enviarCodigo(input: { phone: string; idNumber: string }) {
    const telefono = telefonoCanonico(input.phone);
    const cedula = soloDigitos(input.idNumber);
    if (telefono.length < 7 || !cedula) throw badRequest('Escribe tu teléfono y tu cédula.');

    const fichas = await clientePorTelefono(telefono);
    const cliente = fichas.find((c) => c.idNumber && soloDigitos(c.idNumber) === cedula);
    if (!cliente) throw badRequest('No encontramos una cuenta con esos datos.');

    const previa = await prisma.walletAccount.findUnique({ where: { phone: telefono } });
    if (previa?.passwordHash) throw badRequest('Esta cuenta ya tiene clave: entra con ella.');
    if (previa?.smsSentAt && Date.now() - previa.smsSentAt.getTime() < REENVIO_SEGUNDOS * 1000) {
      throw badRequest('Ya te enviamos un código hace un momento. Espera un minuto para pedir otro.');
    }

    // randomInt y no Math.random: es un código de seguridad, aunque sean 4 dígitos.
    const codigo = String(crypto.randomInt(0, 10_000)).padStart(4, '0');
    const data = {
      smsCodeHash: await bcrypt.hash(codigo, 10),
      smsCodeExpiresAt: new Date(Date.now() + CODIGO_VIGENCIA_MIN * 60_000),
      smsAttempts: 0,
      smsSentAt: new Date(),
    };
    await prisma.walletAccount.upsert({ where: { phone: telefono }, create: { phone: telefono, ...data }, update: data });

    // El SMS sale al número TAL CUAL está en la ficha (con su 0414...), que es el formato que
    // el proveedor acepta como local. Si el envío falla, el error llega a la pantalla: dejar
    // al cliente esperando un código que nunca salió es peor que decirle que reintente.
    await enviarSms(cliente.phone, `Codigo de verificacion para ingreso de QuickTap Wallet: ${codigo}`);
    return { enviado: true };
  },

  /** Canjea el código por un permiso corto para crear la clave. */
  async verificarCodigo(input: { phone: string; code: string }) {
    const telefono = telefonoCanonico(input.phone);
    const cuenta = await prisma.walletAccount.findUnique({ where: { phone: telefono } });
    if (!cuenta?.smsCodeHash || !cuenta.smsCodeExpiresAt) throw badRequest('Pide primero tu código.');
    if (cuenta.smsCodeExpiresAt.getTime() < Date.now()) throw badRequest('El código venció. Pide uno nuevo.');
    if (cuenta.smsAttempts >= CODIGO_MAX_INTENTOS) {
      throw badRequest('Demasiados intentos con este código. Pide uno nuevo.');
    }

    const bien = await bcrypt.compare(soloDigitos(input.code), cuenta.smsCodeHash);
    if (!bien) {
      await prisma.walletAccount.update({ where: { phone: telefono }, data: { smsAttempts: { increment: 1 } } });
      throw badRequest('Ese código no es. Revisa el SMS.');
    }

    // El código es de un solo uso: se quema al canjearlo, no al vencerse.
    await prisma.walletAccount.update({
      where: { phone: telefono },
      data: { smsCodeHash: null, smsCodeExpiresAt: null, verifiedAt: new Date() },
    });

    const [cliente] = await clientePorTelefono(telefono);
    if (!cliente) throw badRequest('No encontramos una cuenta con esos datos.');
    const payload: SetupPayload = { phone: telefono, customerId: cliente.id, scope: 'wallet-setup' };
    return { setupToken: jwt.sign(payload, env.jwtSecret, { expiresIn: `${SETUP_TOKEN_MIN}m` }) };
  },

  /** Crea la clave (con el permiso del código recién verificado) y deja al cliente adentro. */
  async crearClave(input: { setupToken: string; password: string }) {
    let payload: SetupPayload;
    try {
      payload = jwt.verify(input.setupToken, env.jwtSecret) as SetupPayload;
    } catch {
      throw badRequest('La verificación venció. Vuelve a pedir tu código.');
    }
    if (payload.scope !== 'wallet-setup') throw badRequest('La verificación venció. Vuelve a pedir tu código.');

    // Mismo piso que las claves del panel: 8 caracteres con letras y números. El medidor de la
    // pantalla orienta más fino, pero el piso se hace cumplir acá — la pantalla se puede saltar.
    const clave = input.password;
    if (clave.length < 8 || !/[a-záéíóúñ]/i.test(clave) || !/\d/.test(clave)) {
      throw badRequest('La clave debe tener al menos 8 caracteres, con letras y números.');
    }

    await prisma.walletAccount.update({
      where: { phone: payload.phone },
      data: { passwordHash: await bcrypt.hash(clave, 10) },
    });

    const cliente = await prisma.customer.findUnique({ where: { id: payload.customerId }, select: { id: true, name: true } });
    if (!cliente) throw badRequest('No encontramos una cuenta con esos datos.');
    return sesionDe(cliente.id, cliente.name);
  },

  /** Las siguientes veces: teléfono + clave. */
  async loginConClave(input: { phone: string; password: string }) {
    const telefono = telefonoCanonico(input.phone);
    const cuenta = await prisma.walletAccount.findUnique({ where: { phone: telefono } });
    // Un solo mensaje para "no existe" y "clave mala", como siempre.
    if (!cuenta?.passwordHash || !(await bcrypt.compare(input.password, cuenta.passwordHash))) {
      throw badRequest('Teléfono o clave incorrectos.');
    }
    const [cliente] = await clientePorTelefono(telefono);
    if (!cliente) throw badRequest('Teléfono o clave incorrectos.');
    return sesionDe(cliente.id, cliente.name);
  },
};
