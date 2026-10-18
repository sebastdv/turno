import { count } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/passwords";
import type { Db } from "./client";
import { barbers, services, users, workingHours } from "./schema";

// Filo Barbería: una barbería ficticia para desarrollo y demos.

const SERVICES = [
  { name: "Corte clásico", description: "Tijera o máquina, lavado y peinado.", durationMin: 30, priceCop: 30000, sort: 1 },
  { name: "Corte y barba", description: "Corte completo más perfilado y toalla caliente.", durationMin: 60, priceCop: 48000, sort: 2 },
  { name: "Arreglo de barba", description: "Perfilado con navaja y aceite.", durationMin: 30, priceCop: 22000, sort: 3 },
  { name: "Corte infantil", description: "Hasta 12 años.", durationMin: 30, priceCop: 25000, sort: 4 },
  { name: "Cejas", description: "Perfilado con navaja.", durationMin: 15, priceCop: 8000, sort: 5 },
];

const TEAM = [
  { name: "Andrés", bio: "Degradados y cortes clásicos.", sort: 1 },
  { name: "Camilo", bio: "Barbas y navaja.", sort: 2 },
  { name: "Mateo", bio: "Cortes infantiles y diseños.", sort: 3 },
];

/** Lunes a viernes 9:00-13:00 y 14:00-19:00; sábados 8:00-15:00; domingo cerrado. */
function weekFor(barberId: number) {
  const rows = [];
  for (let weekday = 1; weekday <= 5; weekday++) {
    rows.push({ barberId, weekday, startMin: 540, endMin: 780 }, { barberId, weekday, startMin: 840, endMin: 1140 });
  }
  rows.push({ barberId, weekday: 6, startMin: 480, endMin: 900 });
  return rows;
}

/** Siembra la barbería de ejemplo si la base está vacía. Devuelve si sembró. */
export async function seedDemo(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(services);
  if (n > 0) return false;

  await db.insert(services).values(SERVICES);
  const team = await db.insert(barbers).values(TEAM).returning();
  for (const b of team) await db.insert(workingHours).values(weekFor(b.id));

  const accounts = [
    { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD, name: "Dueño de Filo", role: "admin" as const },
    { email: env.SEED_CLIENT_EMAIL, password: env.SEED_CLIENT_PASSWORD, name: "Cliente de prueba", role: "cliente" as const },
  ];
  for (const a of accounts) {
    if (!a.email || !a.password) continue;
    await db
      .insert(users)
      .values({ email: a.email.toLowerCase(), name: a.name, phone: "3000000000", passwordHash: await hashPassword(a.password), role: a.role })
      .onConflictDoNothing();
  }
  return true;
}
