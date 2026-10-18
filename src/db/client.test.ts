import { count } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./client";
import { barbers, bookings, services, users } from "./schema";

describe("esquema", () => {
  it("impide dos turnos activos cruzados del mismo barbero, pero no los cancelados", async () => {
    const db = await createTestDb();
    const [u] = await db.insert(users).values({ email: "a@b.co", name: "A", phone: "300", passwordHash: "x" }).returning();
    const [b] = await db.insert(barbers).values({ name: "Juan" }).returning();
    const [s] = await db.insert(services).values({ name: "Corte", durationMin: 30, priceCop: 30000 }).returning();
    const base = { userId: u.id, barberId: b.id, serviceId: s.id, priceCop: 30000, depositCop: 10000, holdExpiresAt: new Date() };
    const at = (start: string, end: string, code: string, status: "confirmada" | "cancelada" = "confirmada") =>
      db.insert(bookings).values({ ...base, code, status, startsAt: new Date(start), endsAt: new Date(end) });

    await at("2026-10-20T14:00:00Z", "2026-10-20T14:30:00Z", "A1");
    await expect(at("2026-10-20T14:15:00Z", "2026-10-20T14:45:00Z", "A2")).rejects.toMatchObject({ cause: { code: "23P01" } });
    // Pegado al anterior: el rango es [inicio, fin), así que 14:30 está libre.
    await at("2026-10-20T14:30:00Z", "2026-10-20T15:00:00Z", "A3");
    // Un turno cancelado no ocupa el horario.
    await at("2026-10-20T15:00:00Z", "2026-10-20T15:30:00Z", "A4", "cancelada");
    await at("2026-10-20T15:00:00Z", "2026-10-20T15:30:00Z", "A5");

    const [{ n }] = await db.select({ n: count() }).from(bookings);
    expect(n).toBe(4);
  });
});
