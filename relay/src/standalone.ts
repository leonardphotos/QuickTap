import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRelay, defaultPaths } from './index.js';

/**
 * Arranque suelto del relé, para probarlo sin Electron:
 *
 *   RELAY_JWT_SECRET=<el mismo de la nube> npm run dev
 *
 * Deja la base en `.relay-data/` dentro del propio paquete.
 */

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secret = process.env.RELAY_JWT_SECRET;

if (!secret) {
  console.error('Falta RELAY_JWT_SECRET (debe ser el mismo JWT_SECRET de la nube).');
  process.exit(1);
}

const relay = await startRelay({
  dataDir: path.join(packageRoot, '.relay-data'),
  port: Number(process.env.RELAY_PORT ?? 4001),
  jwtSecret: secret,
  ...defaultPaths(packageRoot),
});

console.log(`\n[relé] escuchando en ${relay.url}`);
console.log('[relé] latido: GET /api/v1/relay/health');
console.log('[relé] Ctrl+C para detener\n');

const shutdown = async () => {
  console.log('\n[relé] deteniendo...');
  await relay.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
