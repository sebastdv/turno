import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "./passwords";
import { clearFailures, createSession, deleteSession, isLockedOut, recordFailure, userForToken } from "./sessions";
import { registerSchema, safeNext } from "./validation";

describe("contraseñas", () => {
  it("verifica la correcta, rechaza otras y usa sal distinta cada vez", async () => {
    const a = await hashPassword("una contraseña larga");
    const b = await hashPassword("una contraseña larga");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword("una contraseña larga", a)).toBe(true);
    expect(await verifyPassword("otra contraseña larga", a)).toBe(false);
    expect(await verifyPassword("x", "basura")).toBe(false);
  });
});

describe("sesiones", () => {
  it("el token abre la sesión hasta que vence o se cierra, y la base solo guarda su hash", async () => {
    const db = await createTestDb();
    const [u] = await db.insert(users).values({ email: "a@b.co", name: "Ana", phone: "3001234567", passwordHash: "x" }).returning();
    const now = new Date("2026-10-20T15:00:00Z");
    const { token } = await createSession(db, u.id, now);
    expect(await userForToken(db, token, now)).toMatchObject({ id: u.id, role: "cliente" });
    expect(await userForToken(db, token, new Date(now.getTime() + 31 * 86_400_000))).toBeNull();
    expect(await userForToken(db, "otro", now)).toBeNull();
    const stored = await db.query.sessions.findFirst();
    expect(stored!.id).not.toBe(token);
    await deleteSession(db, token);
    expect(await userForToken(db, token, now)).toBeNull();
  });

  it("bloquea tras 5 intentos fallidos durante 15 minutos", async () => {
    const db = await createTestDb();
    const now = new Date("2026-10-20T15:00:00Z");
    for (let i = 0; i < 5; i++) await recordFailure(db, "a@b.co", now);
    expect(await isLockedOut(db, "a@b.co", now)).toBe(true);
    expect(await isLockedOut(db, "a@b.co", new Date(now.getTime() + 16 * 60_000))).toBe(false);
    await clearFailures(db, "a@b.co");
    expect(await isLockedOut(db, "a@b.co", now)).toBe(false);
  });
});

describe("validación", () => {
  it("normaliza correo y celular", () => {
    const r = registerSchema.parse({ name: " Ana ", email: " Ana@Correo.CO ", phone: "+57 300 123 4567", password: "1234567890" });
    expect(r).toEqual({ name: "Ana", email: "ana@correo.co", phone: "3001234567", password: "1234567890" });
    expect(registerSchema.safeParse({ name: "Ana", email: "x", phone: "12345", password: "corta" }).success).toBe(false);
  });

  it("solo permite redirecciones internas después de entrar", () => {
    expect(safeNext("/reservar?servicio=1")).toBe("/reservar?servicio=1");
    expect(safeNext("https://evil.co")).toBe("/mis-turnos");
    expect(safeNext("//evil.co")).toBe("/mis-turnos");
    expect(safeNext("/\\evil.co")).toBe("/mis-turnos");
  });
});
