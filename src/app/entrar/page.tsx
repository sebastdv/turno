import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current";
import { safeNext } from "@/lib/auth/validation";
import { LoginForm } from "../cuenta/Formularios";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ siguiente?: string }> }) {
  const next = safeNext((await searchParams).siguiente);
  if (await currentUser()) redirect(next);
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="font-display text-5xl font-extrabold uppercase">Entrar</h1>
      <p className="mt-2 mb-6 text-muted">Para reservar y ver tus turnos.</p>
      <LoginForm next={next} />
    </main>
  );
}
