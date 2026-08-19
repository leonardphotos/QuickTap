import { PrismaClient } from '../node_modules/.prisma/relay-client/index.js';

let client: PrismaClient | null = null;

/** Cliente Prisma del relé. Se conecta al Postgres embebido que levanta `postgres.ts`. */
export function relayDb(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      datasources: { db: { url: process.env.RELAY_DATABASE_URL } },
    });
  }
  return client;
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
