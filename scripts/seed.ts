// Siembra Filo Barbería en la base de DATABASE_URL, para una demo publicada.
// En desarrollo no hace falta: la base local se siembra sola al abrirse.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { seedDemo } from "../src/db/seed";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}
const client = postgres(url, { max: 1 });
const seeded = await seedDemo(drizzle(client, { schema }) as never);
await client.end();
console.log(seeded ? "Barbería de ejemplo creada." : "La base ya tenía servicios: no se sembró nada.");
