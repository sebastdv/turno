"use server";

import { and, eq, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { barbers, bookings, services, timeOff, workingHours } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { BookingError, cancelBooking } from "@/lib/bookings";
import { parseRanges } from "@/lib/schedule";
import { atBogota, isDayKey, parseClock } from "@/lib/time";

export type AdminState = { error?: string; ok?: string } | null;

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/");
  revalidatePath("/reservar");
}

// ── Turnos ──────────────────────────────────────────────────────────────

/** Marcar asistencia: solo turnos confirmados que ya empezaron. */
export async function marcarTurno(code: string, status: "atendida" | "no_asistio"): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  await db
    .update(bookings)
    .set({ status })
    .where(and(eq(bookings.code, code), eq(bookings.status, "confirmada"), lte(bookings.startsAt, new Date())));
  refresh();
}

export async function cancelarComoBarberia(code: string): Promise<AdminState> {
  const admin = await requireAdmin();
  try {
    await cancelBooking(await getDb(), { code, userId: admin.id, asAdmin: true });
  } catch (err) {
    if (err instanceof BookingError) return { error: err.message };
    throw err;
  }
  refresh();
  return { ok: "Turno cancelado. El abono quedó pendiente de devolución." };
}

export async function marcarDevuelto(code: string): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  await db.update(bookings).set({ refundStatus: "hecho" }).where(and(eq(bookings.code, code), eq(bookings.refundStatus, "pendiente")));
  refresh();
}

// ── Servicios ───────────────────────────────────────────────────────────

const serviceSchema = z.object({
  name: z.string().trim().min(2, { error: "Escribe el nombre del servicio." }).max(60),
  description: z.string().trim().max(140),
  durationMin: z.coerce.number().int().min(10, { error: "La duración mínima es 10 minutos." }).max(240).multipleOf(5, { error: "La duración va en múltiplos de 5 minutos." }),
  priceCop: z.coerce.number().int({ error: "El precio va en pesos, sin decimales." }).min(0).max(5_000_000),
  active: z.boolean(),
});

function readService(form: FormData) {
  return serviceSchema.safeParse({
    name: form.get("name"),
    description: form.get("description") ?? "",
    durationMin: form.get("durationMin"),
    priceCop: String(form.get("priceCop") ?? "").replace(/[.\s$]/g, ""),
    active: form.get("active") === "on",
  });
}

export async function guardarServicio(id: number | null, _: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const parsed = readService(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await getDb();
  if (id) await db.update(services).set(parsed.data).where(eq(services.id, id));
  else await db.insert(services).values({ ...parsed.data, sort: 100 });
  refresh();
  return { ok: id ? "Guardado." : "Servicio creado." };
}

// ── Barberos, horarios y bloqueos ───────────────────────────────────────

const barberSchema = z.object({
  name: z.string().trim().min(2, { error: "Escribe el nombre." }).max(40),
  bio: z.string().trim().max(80),
  active: z.boolean(),
});

export async function guardarBarbero(id: number | null, _: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const parsed = barberSchema.safeParse({ name: form.get("name"), bio: form.get("bio") ?? "", active: id ? form.get("active") === "on" : true });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await getDb();
  if (id) await db.update(barbers).set(parsed.data).where(eq(barbers.id, id));
  else await db.insert(barbers).values({ ...parsed.data, sort: 100 });
  refresh();
  return { ok: id ? "Guardado." : "Barbero agregado. Ahora define su horario." };
}

/**
 * Reemplaza el horario semanal completo. Los turnos ya tomados se respetan
 * aunque queden fuera del nuevo horario: la barbería decide si los cancela.
 */
export async function guardarHorario(barberId: number, _: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const rows: { barberId: number; weekday: number; startMin: number; endMin: number }[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const result = parseRanges(String(form.get(`dia-${weekday}`) ?? ""));
    if ("error" in result) return { error: `${WEEKDAYS[weekday][0].toUpperCase()}${WEEKDAYS[weekday].slice(1)}: ${result.error}` };
    for (const r of result.ranges) rows.push({ barberId, weekday, ...r });
  }
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(workingHours).where(eq(workingHours.barberId, barberId));
    if (rows.length) await tx.insert(workingHours).values(rows);
  });
  refresh();
  return { ok: "Horario guardado." };
}

export async function agregarBloqueo(barberId: number, _: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const day = String(form.get("dia") ?? "");
  const from = parseClock(String(form.get("desde") ?? ""));
  const to = parseClock(String(form.get("hasta") ?? ""));
  if (!isDayKey(day)) return { error: "Elige el día." };
  if (from === null || to === null || from >= to) return { error: "Revisa las horas: la final debe ser posterior a la inicial." };
  const db = await getDb();
  await db.insert(timeOff).values({
    barberId,
    startsAt: atBogota(day, from),
    endsAt: atBogota(day, to),
    reason: String(form.get("motivo") ?? "").trim().slice(0, 80),
  });
  refresh();
  return { ok: "Bloqueo agregado. Los turnos ya tomados en ese horario siguen en pie." };
}

export async function quitarBloqueo(id: number): Promise<void> {
  await requireAdmin();
  await (await getDb()).delete(timeOff).where(eq(timeOff.id, id));
  refresh();
}
