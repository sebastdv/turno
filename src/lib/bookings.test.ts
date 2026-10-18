import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bookings, timeOff } from "@/db/schema";
import { availability, BookingError, cancelBooking, cancellationTerms, createBooking } from "./bookings";
import { seededDb } from "./test-helpers";
import { atBogota, formatTime } from "./time";

const day = "2026-10-20"; // martes
const now = atBogota("2026-10-19", 18 * 60); // lunes 6 p. m., la víspera
const at = (hhmm: string) => atBogota(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));

afterEach(() => vi.unstubAllEnvs());

describe("availability", () => {
  it("lista horarios por barbero y junta a los libres con 'cualquiera'", async () => {
    const { db, corte, juan, mateo } = await seededDb();
    const one = await availability(db, { serviceId: corte.id, barberId: juan.id, day, now });
    expect([...one.slots.keys()].map((k) => formatTime(new Date(k))).slice(0, 3)).toEqual(["09:00", "09:15", "09:30"]);
    expect(one.slots.size).toBe(30); // 15 en la mañana + 15 en la tarde

    const any = await availability(db, { serviceId: corte.id, barberId: null, day, now });
    expect(any.slots.get(at("09:00").toISOString())).toEqual([juan.id, mateo.id]);
  });

  it("no ofrece días cerrados, bloqueos ni fechas fuera de los 30 días", async () => {
    const { db, corte, juan } = await seededDb();
    expect((await availability(db, { serviceId: corte.id, barberId: juan.id, day: "2026-10-25", now })).slots.size).toBe(0); // domingo
    expect((await availability(db, { serviceId: corte.id, barberId: juan.id, day: "2026-12-01", now })).slots.size).toBe(0);
    await db.insert(timeOff).values({ barberId: juan.id, startsAt: at("09:00"), endsAt: at("13:00"), reason: "médico" });
    const afternoon = await availability(db, { serviceId: corte.id, barberId: juan.id, day, now });
    expect(formatTime(new Date([...afternoon.slots.keys()][0]))).toBe("14:00");
  });
});

describe("createBooking", () => {
  it("aparta el horario con el abono pendiente y lo saca de la disponibilidad", async () => {
    const { db, corte, juan, client } = await seededDb();
    const b = await createBooking(db, { userId: client.id, serviceId: corte.id, barberId: juan.id, startsAt: at("10:00"), now });
    expect(b).toMatchObject({ status: "pendiente_pago", priceCop: 30000, depositCop: 10000, barberId: juan.id });
    expect(b.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(b.endsAt.toISOString()).toBe(at("10:30").toISOString());

    const left = await availability(db, { serviceId: corte.id, barberId: juan.id, day, now });
    expect(left.slots.has(at("10:00").toISOString())).toBe(false);
    expect(left.slots.has(at("09:45").toISOString())).toBe(false); // terminaría 10:15, cruzado
    expect(left.slots.has(at("10:30").toISOString())).toBe(true);
  });

  it("rechaza el mismo horario con el mismo barbero", async () => {
    const { db, corte, juan, client } = await seededDb();
    await createBooking(db, { userId: client.id, serviceId: corte.id, barberId: juan.id, startsAt: at("10:00"), now });
    await expect(
      createBooking(db, { userId: client.id, serviceId: corte.id, barberId: juan.id, startsAt: at("10:15"), now }),
    ).rejects.toMatchObject({ code: "ocupado" });
  });

  it("con 'cualquiera' asigna al barbero libre y reparte la carga", async () => {
    const { db, corte, juan, mateo, client } = await seededDb();
    const first = await createBooking(db, { userId: client.id, serviceId: corte.id, barberId: null, startsAt: at("10:00"), now });
    const second = await createBooking(db, { userId: client.id, serviceId: corte.id, barberId: null, startsAt: at("10:00"), now });
    expect(new Set([first.barberId, second.barberId])).toEqual(new Set([juan.id, mateo.id]));
    // Con los dos ocupados a las 10:00 ya no queda nadie.
    await expect(
      createBooking(db, { userId: client.id, serviceId: corte.id, barberId: null, startsAt: at("10:00"), now }),
    ).rejects.toBeInstanceOf(BookingError);
  });

  it("si el abono no se paga a tiempo, el horario se libera", async () => {
    const { db, corte, juan, client } = await seededDb();
    const held = await createBooking(db, { userId: client.id, serviceId: corte.id, barberId: juan.id, startsAt: at("10:00"), now });
    const later = new Date(now.getTime() + 16 * 60_000);
    const again = await createBooking(db, { userId: client.id, serviceId: corte.id, barberId: juan.id, startsAt: at("10:00"), now: later });
    expect(again.status).toBe("pendiente_pago");
    const [old] = await db.select().from(bookings).where(eq(bookings.id, held.id));
    expect(old.status).toBe("expirada");
  });

  it("sin abono configurado el turno queda confirmado de una vez", async () => {
    vi.stubEnv("ABONO_COP", "0");
    const { db, corte, juan, client } = await seededDb();
    const b = await createBooking(db, { userId: client.id, serviceId: corte.id, barberId: juan.id, startsAt: at("10:00"), now });
    expect(b).toMatchObject({ status: "confirmada", depositCop: 0 });
  });

  it("exige una hora de anticipación y horas en punto de 15 minutos", async () => {
    const { db, corte, juan, client } = await seededDb();
    const soon = atBogota(day, 9 * 60 + 30);
    await expect(
      createBooking(db, { userId: client.id, serviceId: corte.id, barberId: juan.id, startsAt: at("10:00"), now: soon }),
    ).rejects.toMatchObject({ code: "fuera_de_rango" });
    await expect(
      createBooking(db, { userId: client.id, serviceId: corte.id, barberId: juan.id, startsAt: at("10:07"), now }),
    ).rejects.toMatchObject({ code: "fuera_de_rango" });
  });
});

describe("cancelación", () => {
  const confirmed = { startsAt: at("15:00"), status: "confirmada" as const, depositCop: 10000 };

  it("devuelve el abono con 3 horas o más de anticipación", () => {
    expect(cancellationTerms(confirmed, at("12:00"))).toEqual({ cancellable: true, refund: true });
    expect(cancellationTerms(confirmed, at("12:01"))).toEqual({ cancellable: true, refund: false });
    expect(cancellationTerms(confirmed, at("15:00"))).toEqual({ cancellable: false, refund: false });
  });

  it("solo la persona del turno puede cancelarlo; si cancela la barbería, siempre devuelve", async () => {
    const { db, corte, juan, client } = await seededDb();
    const b = await createBooking(db, { userId: client.id, serviceId: corte.id, barberId: juan.id, startsAt: at("15:00"), now });
    await db.update(bookings).set({ status: "confirmada" }).where(eq(bookings.id, b.id));
    await expect(cancelBooking(db, { code: b.code, userId: 999, now })).rejects.toMatchObject({ code: "no_existe" });

    const late = atBogota(day, 13 * 60);
    const byAdmin = await cancelBooking(db, { code: b.code, userId: 999, asAdmin: true, now: late });
    expect(byAdmin).toMatchObject({ status: "cancelada", refundStatus: "pendiente" });
    await expect(cancelBooking(db, { code: b.code, userId: client.id, now })).rejects.toMatchObject({ code: "no_permitido" });
  });
});
