import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { relayDb } from './db.js';

/**
 * Entrar sin internet.
 *
 * Si un corte se alarga más que la sesión de un mesero, su token vence y quedaría fuera del
 * sistema justo cuando más se necesita. Para eso el relé guarda una copia del hash de las
 * contraseñas del personal de salón (nunca la contraseña) y puede emitir un token nuevo.
 *
 * El token que emite es igual al de la nube y firmado con el mismo secreto, así que sirve para
 * todo — pero dura poco: es para cubrir un turno, no para reemplazar el login normal. Cuando
 * vuelva el internet, el siguiente login contra la nube da uno normal.
 */

/** Corto a propósito: es para salir del paso durante un corte, no una sesión completa. */
const OFFLINE_TOKEN_HOURS = 12;

export interface LocalLoginResult {
  token: string;
  user: { id: string; name: string; email: string; role: string };
  restaurant: { id: string; name: string };
}

export async function localLogin(
  email: string,
  password: string,
  jwtSecret: string,
): Promise<LocalLoginResult | null> {
  const db = relayDb();
  const cred = await db.cachedCredential.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!cred) return null;

  const ok = await bcrypt.compare(password, cred.passwordHash);
  if (!ok) return null;

  const restaurant = await db.restaurant.findUnique({ where: { id: cred.restaurantId } });
  if (!restaurant) return null;

  const token = jwt.sign(
    { userId: cred.id, restaurantId: cred.restaurantId, role: cred.role },
    jwtSecret,
    { expiresIn: `${OFFLINE_TOKEN_HOURS}h` },
  );

  return {
    token,
    user: { id: cred.id, name: cred.name, email: cred.email, role: cred.role },
    restaurant: { id: restaurant.id, name: restaurant.name },
  };
}
