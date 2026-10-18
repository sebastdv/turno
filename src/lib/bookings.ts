import { and, asc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { barbers, bookings, services, timeOff, users, workingHours, type BookingStatus } from "@/db/schema";
import { bookingCode } from "./codes";
import { depositFor } from "./money";
import { computeSlots, LEAD_MIN, MAX_DAYS_AHEAD, SLOT_STEP_MIN, type Range } from "./slots";
import { addDays, atBogota, dayKey, minutesOfDay, weekdayOf } from "./time";

/** Mientras se paga el abono, el horario queda apartado este tiempo. */
export const HOLD_MIN = 15;
/** Cancelando con al menos esta anticipación, el abono se devuelve. */
export const REFUND_LIMIT_HOURS = 3;

/** Estados que ocupan el horario (los mismos de la restricción de exclusión). */
export const ACTIVE: BookingStatus[] = ["pendiente_pago", "confirmada", "atendida", "no_asistio"];

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

export class BookingError extends Error {
  readonly code: "no_disponible" | "fuera_de_rango" | "ocupado" | "no_existe" | "no_permitido";
  constructor(code: BookingError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** Las reservas sin pagar cuyo plazo venció liberan su horario. */
export async function expireHolds(db: Executor, now = new Date()): Promise<void> {
  await db
    .update(bookings)
    .set({ status: "expirada" })
    .where(and(eq(bookings.status, "pendiente_pago"), lt(bookings.holdExpiresAt, now)));
}

export function bookableDays(now = new Date()): string[] {
  const today = dayKey(now);
  return Array.from({ length: MAX_DAYS_AHEAD }, (_, i) => addDays(today, i));
}

/** Turnos y bloqueos de cada barbero en un día (más un margen por servicios largos). */
async function busyByBarber(db: Executor, barberIds: number[], day: string, now: Date): Promise<Map<number, Range[]>> {
  const from = atBogota(day, 0);
  const to = atBogota(addDays(day, 1), 0);
  const [taken, off] = await Promise.all([
    db
      .select({ barberId: bookings.barberId, start: bookings.startsAt, end: bookings.endsAt, status: bookings.status, hold: bookings.holdExpiresAt })
      .from(bookings)
      .where(and(inArray(bookings.barberId, barberIds), inArray(bookings.status, ACTIVE), lt(bookings.startsAt, to), gt(bookings.endsAt, from))),
    db
      .select({ barberId: timeOff.barberId, start: timeOff.startsAt, end: timeOff.endsAt })
      .from(timeOff)
      .where(and(inArray(timeOff.barberId, barberIds), lt(timeOff.startsAt, to), gt(timeOff.endsAt, from))),
  ]);
  const map = new Map<number, Range[]>(barberIds.map((id) => [id, []]));
  // Un apartado vencido todavía no marcado como expirado ya no ocupa el horario.
  for (const t of taken) if (t.status !== "pendiente_pago" || t.hold > now) map.get(t.barberId)!.push(t);
  for (const t of off) map.get(t.barberId)!.push(t);
  return map;
}

export interface Availability {
  /** Hora de inicio en ISO → barberos libres a esa hora. */
  slots: Map<string, number[]>;
}

/** Horarios libres de un servicio en un día, para un barbero o para cualquiera. */
export async function availability(
  db: Executor,
  input: { serviceId: number; barberId: number | null; day: string; now?: Date },
): Promise<Availability> {
  const now = input.now ?? new Date();
  const slots = new Map<string, number[]>();
  if (!bookableDays(now).includes(input.day)) return { slots };

  const [service] = await db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.active, true)));
  if (!service) return { slots };
  const team = await db
    .select({ id: barbers.id })
    .from(barbers)
    .where(input.barberId ? and(eq(barbers.id, input.barberId), eq(barbers.active, true)) : eq(barbers.active, true))
    .orderBy(asc(barbers.sort), asc(barbers.id));
  if (team.length === 0) return { slots };

  const ids = team.map((b) => b.id);
  const hours = await db
    .select()
    .from(workingHours)
    .where(and(inArray(workingHours.barberId, ids), eq(workingHours.weekday, weekdayOf(input.day))));
  const busy = await busyByBarber(db, ids, input.day, now);

  for (const id of ids) {
    const starts = computeSlots({
      day: input.day,
      durationMin: service.durationMin,
      hours: hours.filter((h) => h.barberId === id),
      busy: busy.get(id) ?? [],
      now,
    });
    for (const s of starts) {
      const key = s.toISOString();
      slots.set(key, [...(slots.get(key) ?? []), id]);
    }
  }
  return { slots: new Map([...slots].sort(([a], [b]) => a.localeCompare(b))) };
}

function isExclusionViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23P01" || e?.cause?.code === "23P01";
}

/**
 * Crea la reserva apartando el horario. Revalida la disponibilidad dentro de
 * la transacción y deja que la restricción de exclusión resuelva la carrera
 * si dos personas confirman el mismo horario a la vez.
 */
export async function createBooking(
  db: Db,
  input: { userId: number; serviceId: number; barberId: number | null; startsAt: Date; now?: Date },
) {
  const now = input.now ?? new Date();
  const day = dayKey(input.startsAt);
  if (minutesOfDay(input.startsAt) % SLOT_STEP_MIN !== 0 || input.startsAt.getTime() < now.getTime() + LEAD_MIN * 60_000) {
    throw new BookingError("fuera_de_rango", "Ese horario ya no se puede reservar.");
  }

  return db.transaction(async (tx) => {
    await expireHolds(tx, now);
    const [service] = await tx.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.active, true)));
    if (!service) throw new BookingError("no_existe", "Ese servicio ya no está disponible.");

    const { slots } = await availability(tx, { serviceId: service.id, barberId: input.barberId, day, now });
    const free = slots.get(input.startsAt.toISOString()) ?? [];
    if (free.length === 0) throw new BookingError("ocupado", "Ese horario se acaba de ocupar. Elige otro.");

    // Con "cualquier barbero", primero el que tiene menos turnos ese día.
    const candidates = free.length > 1 ? await byLoad(tx, free, day) : free;
    const deposit = depositFor(service.priceCop);
    for (const barberId of candidates) {
      try {
        // Un savepoint por intento: si la inserción choca, la transacción sigue viva.
        return await tx.transaction(async (sp) => {
          const [row] = await sp
            .insert(bookings)
            .values({
              code: bookingCode(),
              userId: input.userId,
              barberId,
              serviceId: service.id,
              startsAt: input.startsAt,
              endsAt: new Date(input.startsAt.getTime() + service.durationMin * 60_000),
              // Sin abono no hay nada que pagar: el turno queda confirmado de una vez.
              status: deposit > 0 ? "pendiente_pago" : "confirmada",
              priceCop: service.priceCop,
              depositCop: deposit,
              holdExpiresAt: new Date(now.getTime() + HOLD_MIN * 60_000),
            })
            .returning();
          return row;
        });
      } catch (err) {
        if (!isExclusionViolation(err)) throw err;
      }
    }
    throw new BookingError("ocupado", "Ese horario se acaba de ocupar. Elige otro.");
  });
}

async function byLoad(tx: Tx, barberIds: number[], day: string): Promise<number[]> {
  const rows = await tx
    .select({ barberId: bookings.barberId, n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(
        inArray(bookings.barberId, barberIds),
        inArray(bookings.status, ACTIVE),
        gt(bookings.startsAt, atBogota(day, 0)),
        lt(bookings.startsAt, atBogota(addDays(day, 1), 0)),
      ),
    )
    .groupBy(bookings.barberId);
  const load = new Map(rows.map((r) => [r.barberId, r.n]));
  return [...barberIds].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0));
}

/** Política de cancelación: con 3 horas o más se devuelve el abono; con menos, se pierde. */
export function cancellationTerms(booking: { startsAt: Date; status: BookingStatus; depositCop: number }, now = new Date()) {
  const hoursLeft = (booking.startsAt.getTime() - now.getTime()) / 3_600_000;
  const cancellable = (booking.status === "confirmada" || booking.status === "pendiente_pago") && hoursLeft > 0;
  const refund = booking.status === "confirmada" && booking.depositCop > 0 && hoursLeft >= REFUND_LIMIT_HOURS;
  return { cancellable, refund };
}

export async function cancelBooking(db: Db, input: { code: string; userId: number; asAdmin?: boolean; now?: Date }) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(bookings).where(eq(bookings.code, input.code)).for("update");
    if (!b || (!input.asAdmin && b.userId !== input.userId)) throw new BookingError("no_existe", "No encontramos ese turno.");
    const terms = cancellationTerms(b, now);
    if (!terms.cancellable) throw new BookingError("no_permitido", "Este turno ya no se puede cancelar.");
    // Si cancela la barbería, el abono se devuelve siempre.
    const refund = b.status === "confirmada" && b.depositCop > 0 && (terms.refund || input.asAdmin === true);
    const [row] = await tx
      .update(bookings)
      .set({ status: "cancelada", cancelledAt: now, refundStatus: refund ? "pendiente" : null })
      .where(eq(bookings.id, b.id))
      .returning();
    return row;
  });
}

/** Turno con su servicio, barbero y cliente, para mostrarlo. */
export async function bookingDetails(db: Db, code: string) {
  const [row] = await db
    .select({ booking: bookings, service: services, barber: barbers, user: { id: users.id, name: users.name, email: users.email, phone: users.phone } })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(barbers, eq(barbers.id, bookings.barberId))
    .innerJoin(users, eq(users.id, bookings.userId))
    .where(eq(bookings.code, code));
  return row ?? null;
}
