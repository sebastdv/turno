"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { SESSION_COOKIE, setSessionCookie } from "@/lib/auth/current";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { clearFailures, createSession, deleteSession, isLockedOut, recordFailure } from "@/lib/auth/sessions";
import { loginSchema, registerSchema, safeNext } from "@/lib/auth/validation";

export type FormState = {
  error?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
} | null;

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0])] ??= i.message;
  return out;
}

let dummyHash: Promise<string> | null = null;

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const raw = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), phone: String(form.get("phone") ?? ""), password: String(form.get("password") ?? "") };
  const values = { name: raw.name, email: raw.email, phone: raw.phone };
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error.issues), values };

  const db = await getDb();
  const [created] = await db
    .insert(users)
    .values({ ...parsed.data, passwordHash: await hashPassword(parsed.data.password) })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (!created) return { errors: { email: "Ya hay una cuenta con ese correo. Entra con tu contraseña." }, values };

  const session = await createSession(db, created.id);
  await setSessionCookie(session.token, session.expiresAt);
  redirect(safeNext(form.get("next")));
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") });
  const values = { email: String(form.get("email") ?? "") };
  if (!parsed.success) return { errors: fieldErrors(parsed.error.issues), values };
  const { email, password } = parsed.data;

  const db = await getDb();
  if (await isLockedOut(db, email)) return { error: "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.", values };

  const [user] = await db.select().from(users).where(eq(users.email, email));
  // Sin cuenta también se calcula un hash: el tiempo de respuesta no revela qué correos existen.
  dummyHash ??= hashPassword("contraseña-que-nadie-usa");
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !ok) {
    await recordFailure(db, email);
    return { error: "El correo o la contraseña no coinciden.", values };
  }
  await clearFailures(db, email);
  const session = await createSession(db, user.id);
  await setSessionCookie(session.token, session.expiresAt);
  redirect(safeNext(form.get("next"), user.role === "admin" ? "/admin" : "/mis-turnos"));
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(await getDb(), token);
  jar.delete(SESSION_COOKIE);
  redirect("/");
}
