import jwt from 'jsonwebtoken';

/**
 * El relé valida los MISMOS tokens que emite la nube, con el mismo secreto.
 *
 * Esto es lo que hace que un mesero ya logueado siga trabajando sin internet sin volver a
 * escribir su contraseña: su token sigue siendo válido, solo que ahora lo verifica la PC del
 * local en vez del servidor. Es verificación puramente criptográfica, sin consultar ninguna
 * base de datos — por eso funciona aunque la nube esté caída.
 *
 * (Renovar un token vencido durante un corte largo es otra cosa, y llega en la Fase 6.)
 */

export interface RelayAuth {
  userId: string;
  restaurantId: string;
  role: string;
}

export function verifyToken(token: string, secret: string): RelayAuth | null {
  try {
    const payload = jwt.verify(token, secret) as Partial<RelayAuth>;
    if (!payload.restaurantId || !payload.userId) return null;
    return { userId: payload.userId, restaurantId: payload.restaurantId, role: payload.role ?? '' };
  } catch {
    return null;
  }
}

/** Lee el token del header `Authorization: Bearer <token>`. */
export function bearerFrom(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}
