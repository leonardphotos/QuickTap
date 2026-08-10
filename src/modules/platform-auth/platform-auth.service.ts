import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { unauthorized } from '../../utils/http-error';
import { PlatformLoginInput } from './platform-auth.dto';
import { PlatformAuthPayload } from '../../middlewares/platform-auth.middleware';

function signToken(payload: PlatformAuthPayload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.platformJwtExpiresIn } as jwt.SignOptions);
}

export const platformAuthService = {
  async login(input: PlatformLoginInput) {
    const admin = await prisma.platformAdmin.findUnique({ where: { email: input.email } });
    if (!admin) throw unauthorized('Credenciales inválidas.');

    const valid = await bcrypt.compare(input.password, admin.passwordHash);
    if (!valid) throw unauthorized('Credenciales inválidas.');

    const token = signToken({ platformAdminId: admin.id, scope: 'platform' });
    return { token, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } };
  },

  async me(platformAdminId: string) {
    const admin = await prisma.platformAdmin.findUnique({
      where: { id: platformAdminId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!admin) throw unauthorized();
    return admin;
  },
};
