// Aplica las migraciones de drizzle/ a la base de DATABASE_URL (Postgres con btree_gist).
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  // `--if-configured` (lo usa vercel-build): un build sin base, como un preview, sigue de largo.
  if (process.argv.includes("--if-configured")) {
    console.log("Sin DATABASE_URL: se omite este paso.");
    process.exit(0);
  }
  console.error("Falta DATABASE_URL. En desarrollo, PGlite se migra solo al arrancar.");
  process.exit(1);
}
const client = postgres(url, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: "drizzle" });
await client.end();
console.log("Migraciones aplicadas.");
