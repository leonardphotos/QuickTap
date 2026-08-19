import path from 'node:path';
import { startRelayPostgres, pushRelaySchema, type StartedPostgres } from './postgres.js';
import { startRelayServer, type StartedRelayServer } from './server.js';
import { disconnectDb } from './db.js';

/**
 * Arranque del relé completo: Postgres embebido + servidor local.
 *
 * Pensado para llamarse desde el proceso principal de Electron (la app de escritorio que ya
 * corre en la PC del restaurante), pero no depende de Electron — se puede arrancar suelto,
 * que es como se prueba (`npm run dev`).
 */

export interface RelayOptions {
  /** Dónde guardar la base local. En Electron: app.getPath('userData')/relay-db */
  dataDir: string;
  /** Puerto que van a usar tablets e impresora. */
  port?: number;
  /** Mismo secreto que la nube, para aceptar los tokens ya emitidos. */
  jwtSecret: string;
  /** Ruta al schema del relé y al binario de prisma (varían al empaquetar). */
  schemaPath: string;
  prismaBin: string;
  pgPort?: number;
}

export interface RunningRelay {
  url: string;
  stop: () => Promise<void>;
}

export async function startRelay(opts: RelayOptions): Promise<RunningRelay> {
  const port = opts.port ?? 4001;

  let pg: StartedPostgres | null = null;
  let server: StartedRelayServer | null = null;

  try {
    pg = await startRelayPostgres({ dataDir: opts.dataDir, port: opts.pgPort });
    process.env.RELAY_DATABASE_URL = pg.url;

    pushRelaySchema(pg.url, opts.schemaPath, opts.prismaBin);

    server = startRelayServer({ port, jwtSecret: opts.jwtSecret });

    return {
      url: `http://0.0.0.0:${port}`,
      stop: async () => {
        await server?.stop();
        await disconnectDb();
        await pg?.stop();
      },
    };
  } catch (e) {
    // Si algo falla a medias, no dejar un Postgres colgado ocupando el puerto.
    await server?.stop().catch(() => undefined);
    await disconnectDb().catch(() => undefined);
    await pg?.stop().catch(() => undefined);
    throw e;
  }
}

/** Rutas por defecto cuando el relé corre desde su propio paquete (desarrollo/pruebas). */
export function defaultPaths(packageRoot: string) {
  return {
    schemaPath: path.join(packageRoot, 'prisma', 'schema.prisma'),
    prismaBin: path.join(packageRoot, 'node_modules', '.bin', 'prisma'),
  };
}
