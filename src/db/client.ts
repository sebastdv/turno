import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { seedDemo } from "./seed";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

const globalForDb = globalThis as unknown as { turnoDb?: Promise<Db> };

/**
 * Producción usa PostgreSQL con DATABASE_URL (`npm run db:migrate` al desplegar).
 * Sin ella, desarrollo usa PGlite embebido en .data/, migrado al arrancar.
 */
export function getDb(): Promise<Db> {
  // Una conexión fallida no se queda en caché: la siguiente petición reintenta.
  globalForDb.turnoDb ??= connect().catch((error) => {
    globalForDb.turnoDb = undefined;
    throw error;
  });
  return globalForDb.turnoDb;
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    return drizzlePostgres(postgres(url, { max: 5, prepare: false }), { schema }) as unknown as Db;
  }
  return openLocalDb(path.join(process.cwd(), ".data", "pglite"));
}

function pglite(dir?: string): PGlite {
  // btree_gist: necesario para la restricción que impide turnos cruzados.
  const options = { extensions: { btree_gist } };
  return dir ? new PGlite(dir, options) : new PGlite(options);
}

/**
 * Base PGlite en `dir`, creada, migrada y con la barbería de ejemplo si está
 * vacía. La siembra va aquí y no en un script aparte: correrlo con el servidor
 * de desarrollo encendido abriría dos PGlite sobre la misma carpeta.
 */
export async function openLocalDb(dir: string): Promise<Db> {
  mkdirSync(path.dirname(dir), { recursive: true });
  const db = drizzlePglite(pglite(dir), { schema }) as unknown as Db;
  await migratePglite(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
  await seedDemo(db);
  return db;
}

/** Base en memoria para los tests, ya migrada. */
export async function createTestDb(): Promise<Db> {
  const db = drizzlePglite(pglite(), { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Db;
}
