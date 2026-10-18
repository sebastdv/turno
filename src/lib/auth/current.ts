import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { userForToken, type SessionUser } from "./sessions";

export const SESSION_COOKIE = "turno_sesion";

/** La persona con sesión iniciada, una sola consulta por petición. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userForToken(await getDb(), token);
});

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function requireUser(next: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(`/entrar?siguiente=${encodeURIComponent(next)}`);
  return user;
}

/** Para quien no es administrador, el panel simplemente no existe. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/entrar?siguiente=/admin");
  if (user.role !== "admin") notFound();
  return user;
}
