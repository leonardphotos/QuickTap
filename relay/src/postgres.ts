import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Postgres embebido del relé. Vive dentro de la PC del restaurante y solo escucha en
 * 127.0.0.1 — nunca se expone a la red; lo que sí se expone es el servidor HTTP de `server.ts`.
 *
 * Validado en la Fase 0 (ver docs/offline-mode-spike.md): arranca en ~40ms cuando el directorio
 * de datos ya existe, y los datos sobreviven cerrar y reabrir la app.
 */

export interface RelayPostgresOptions {
  /** Dónde viven los datos. En Electron: app.getPath('userData')/relay-db */
  dataDir: string;
  port?: number;
  user?: string;
  password?: string;
}

const DB_NAME = 'quicktap_relay';

export interface StartedPostgres {
  url: string;
  stop: () => Promise<void>;
}

export async function startRelayPostgres(opts: RelayPostgresOptions): Promise<StartedPostgres> {
  const port = opts.port ?? 54329;
  const user = opts.user ?? 'quicktap_relay';
  const password = opts.password ?? 'local_only';

  const pg = new EmbeddedPostgres({
    databaseDir: opts.dataDir,
    user,
    password,
    port,
    persistent: true,
  });

  // `initialise()` solo hace falta la primera vez; si el directorio ya tiene datos, saltarlo
  // (volver a inicializar sobre datos existentes falla y borraría el trabajo del día).
  const alreadyInitialised = existsSync(path.join(opts.dataDir, 'PG_VERSION'));
  if (!alreadyInitialised) {
    await pg.initialise();
  }

  await pg.start();

  if (!alreadyInitialised) {
    await pg.createDatabase(DB_NAME);
  }

  const url = `postgresql://${user}:${password}@127.0.0.1:${port}/${DB_NAME}`;
  return {
    url,
    stop: async () => {
      await pg.stop();
    },
  };
}

/**
 * Pone el schema al día. Usa `prisma db push` en vez de migraciones versionadas a propósito:
 * el relé es una caché reconstruible, no la fuente de verdad — si algún día el schema cambia,
 * empujar el nuevo estado es más simple y seguro que arrastrar un historial de migraciones en
 * la PC de cada restaurante.
 */
export function pushRelaySchema(databaseUrl: string, schemaPath: string, prismaBin: string): void {
  execFileSync(prismaBin, ['db', 'push', '--schema', schemaPath, '--skip-generate', '--accept-data-loss'], {
    env: { ...process.env, RELAY_DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}
