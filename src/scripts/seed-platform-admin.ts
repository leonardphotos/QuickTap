import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';

/**
 * Crea (o actualiza la contraseña de) la cuenta del Dashboard maestro.
 * No hay registro público para esto a propósito: se corre una vez desde
 * el servidor con `npm run seed:platform-admin`.
 *
 *   PLATFORM_ADMIN_EMAIL=tu@correo.com PLATFORM_ADMIN_PASSWORD=algo-seguro npm run seed:platform-admin
 */
async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const name = process.env.PLATFORM_ADMIN_NAME ?? 'Administrador QuickTap';

  if (!email || !password) {
    console.error('Faltan PLATFORM_ADMIN_EMAIL y/o PLATFORM_ADMIN_PASSWORD en el entorno.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.platformAdmin.upsert({
    where: { email },
    update: { passwordHash, name },
    create: { email, passwordHash, name },
  });

  console.log(`Administrador de plataforma listo: ${admin.email}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
