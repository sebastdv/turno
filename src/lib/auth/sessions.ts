import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { loginAttempts, sessions, users } from "@/db/schema";

export const SESSION_DAYS = 30;
const MAX_FAILURES = 5;
const WINDOW_MIN = 15;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export type SessionUser = { id: number; email: string; name: string; phone: string; role: "cliente" | "admin" };

/** Crea la sesión y devuelve el token para la cookie; en la base solo queda su hash. */
export async function createSession(db: Db, userId: number, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  // De paso, limpiar las vencidas de esta persona.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, now)));
  return { token, expiresAt };
}

export async function userForToken(db: Db, token: string | undefined, now = new Date()): Promise<SessionUser | null> {
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, phone: users.phone, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, now)));
  return row ?? null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

/** ¿Este correo superó los intentos fallidos permitidos en la ventana actual? */
export async function isLockedOut(db: Db, email: string, now = new Date()): Promise<boolean> {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, email));
  return Boolean(row && row.count >= MAX_FAILURES && now.getTime() - row.windowStart.getTime() < WINDOW_MIN * 60_000);
}

export async function recordFailure(db: Db, email: string, now = new Date()): Promise<void> {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, email));
  if (!row || now.getTime() - row.windowStart.getTime() >= WINDOW_MIN * 60_000) {
    await db
      .insert(loginAttempts)
      .values({ key: email, count: 1, windowStart: now })
      .onConflictDoUpdate({ target: loginAttempts.key, set: { count: 1, windowStart: now } });
  } else {
    await db.update(loginAttempts).set({ count: row.count + 1 }).where(eq(loginAttempts.key, email));
  }
}

export async function clearFailures(db: Db, email: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, email));
}
