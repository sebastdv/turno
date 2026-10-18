// Datos mínimos para los tests: un servicio, dos barberos de lunes a sábado
// (9:00-13:00 y 14:00-18:00) y un cliente.
import { createTestDb, type Db } from "@/db/client";
import { barbers, services, users, workingHours } from "@/db/schema";

export async function seededDb() {
  const db: Db = await createTestDb();
  const [corte] = await db.insert(services).values({ name: "Corte", durationMin: 30, priceCop: 30000 }).returning();
  const team = await db.insert(barbers).values([{ name: "Juan", sort: 1 }, { name: "Mateo", sort: 2 }]).returning();
  for (const b of team) {
    for (let weekday = 1; weekday <= 6; weekday++) {
      await db.insert(workingHours).values([
        { barberId: b.id, weekday, startMin: 540, endMin: 780 },
        { barberId: b.id, weekday, startMin: 840, endMin: 1080 },
      ]);
    }
  }
  const [client] = await db
    .insert(users)
    .values({ email: "cliente@test.co", name: "Cliente", phone: "3001234567", passwordHash: "x" })
    .returning();
  return { db, corte, juan: team[0], mateo: team[1], client };
}
