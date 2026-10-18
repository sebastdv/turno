// Crea o asciende una cuenta de administrador en la base de DATABASE_URL.
// Uso: npm run crear-admin -- correo@dominio.co "Nombre"   (pide la contraseña)
import { createInterface } from "node:readline/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/passwords";
import { email as emailSchema, password as passwordSchema } from "../src/lib/auth/validation";

const url = process.env.DATABASE_URL;
const [rawEmail, name = "Administrador"] = process.argv.slice(2);
if (!url || !rawEmail) {
  console.error('Uso: DATABASE_URL=... npm run crear-admin -- correo@dominio.co "Nombre"');
  process.exit(1);
}
const email = emailSchema.parse(rawEmail);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = passwordSchema.parse(await rl.question("Contraseña (mínimo 10 caracteres): "));
rl.close();

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });
await db
  .insert(schema.users)
  .values({ email, name, phone: "3000000000", passwordHash: await hashPassword(password), role: "admin" })
  .onConflictDoUpdate({ target: schema.users.email, set: { role: "admin" } });
await client.end();
console.log(`${email} es administrador.`);
