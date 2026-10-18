import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookings, payments } from "@/db/schema";
import { createBooking } from "../bookings";
import { seededDb } from "../test-helpers";
import { atBogota } from "../time";
import type { PaymentConfig } from "./config";
import { paymentConfig } from "./config";
import { applyTransaction, startPayment } from "./payments";
import { checkoutUrl, eventChecksum, integritySignature, isValidEvent, type WompiEvent } from "./wompi";

describe("firmas de Wompi (ejemplos de la documentación)", () => {
  it("firma de integridad", () => {
    expect(
      integritySignature({
        reference: "sk8-438k4-xmxm392-sn2m",
        amountInCents: 2490000,
        currency: "COP",
        secret: "prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6",
      }),
    ).toBe("37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5");
  });

  const event: WompiEvent = {
    event: "transaction.updated",
    data: { transaction: { id: "1234-1610641025-49201", status: "APPROVED", amount_in_cents: 4490000, reference: "r", currency: "COP" } },
    signature: {
      properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
      // SHA-256 de la cadena del ejemplo de la documentación (ver el test de abajo).
      checksum: "5A18EC5E8FDB7DF463E9F94774CBA8F583BA21BD04A09CEFF2EA68A4BC0AEFBE",
    },
    timestamp: 1530291411,
  };
  const secret = "prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z";

  it("checksum de eventos: concatena las propiedades, el timestamp y el secreto", () => {
    // Es la cadena del paso 3 de la documentación. El checksum que la
    // documentación muestra como resultado (3476DDA5…) no es el SHA-256 de esa
    // cadena; `shasum -a 256` da 5a18ec5e…, igual que este código.
    const documented = "1234-1610641025-49201APPROVED44900001530291411prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z";
    expect(eventChecksum(event, secret)).toBe(createHash("sha256").update(documented).digest("hex"));
    expect(eventChecksum(event, secret).toUpperCase()).toBe(event.signature.checksum);
    expect(isValidEvent(event, secret)).toBe(true);
    expect(isValidEvent(event, secret, event.signature.checksum.toLowerCase())).toBe(true);
  });

  it("rechaza eventos alterados, con otro secreto o con un header distinto", () => {
    const tampered = structuredClone(event);
    tampered.data.transaction!.amount_in_cents = 100;
    expect(isValidEvent(tampered, secret)).toBe(false);
    expect(isValidEvent(event, "otro")).toBe(false);
    expect(isValidEvent(event, secret, "ABC")).toBe(false);
    expect(isValidEvent({ ...event, signature: { ...event.signature, checksum: "" } }, secret)).toBe(false);
  });

  it("arma la URL del checkout con los parámetros de Wompi", () => {
    const url = new URL(checkoutUrl({ publicKey: "pub_test_x", reference: "R1", amountInCents: 1000000, signature: "s", redirectUrl: "https://t.co/turnos/R1" }));
    expect(url.origin + url.pathname).toBe("https://checkout.wompi.co/p/");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      "public-key": "pub_test_x",
      currency: "COP",
      "amount-in-cents": "1000000",
      reference: "R1",
      "signature:integrity": "s",
    });
  });
});

describe("configuración de pagos", () => {
  it("usa Wompi con las cuatro llaves; si no, la simulada solo fuera de producción o si se pide", () => {
    const keys = { WOMPI_PUBLIC_KEY: "pub_test_a", WOMPI_PRIVATE_KEY: "prv_test_b", WOMPI_INTEGRITY_SECRET: "c", WOMPI_EVENTS_SECRET: "d" };
    expect(paymentConfig({ ...keys, NODE_ENV: "production" } as NodeJS.ProcessEnv).mode).toBe("wompi");
    expect(paymentConfig({ NODE_ENV: "development" } as NodeJS.ProcessEnv).mode).toBe("simulado");
    expect(paymentConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv).mode).toBe("ninguno");
    expect(paymentConfig({ NODE_ENV: "production", PAGOS_SIMULADOS: "1" } as NodeJS.ProcessEnv).mode).toBe("simulado");
  });
});

describe("aplicar pagos", () => {
  const now = atBogota("2026-10-19", 18 * 60);
  // Reloj fijo: startPayment vence apartados con la hora actual.
  beforeEach(() => vi.useFakeTimers({ now, toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());
  const simulated: PaymentConfig = { mode: "simulado", wompi: null, baseUrl: "http://localhost:3000" };

  async function pendingBooking(hhmm = "10:00") {
    const ctx = await seededDb();
    const startsAt = atBogota("2026-10-20", Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
    const booking = await createBooking(ctx.db, { userId: ctx.client.id, serviceId: ctx.corte.id, barberId: ctx.juan.id, startsAt, now });
    const url = await startPayment(ctx.db, booking.code, ctx.client.id, simulated);
    const [payment] = await ctx.db.select().from(payments).where(eq(payments.bookingId, booking.id));
    return { ...ctx, booking, payment, url };
  }

  const tx = (reference: string, status: string, amountInCents = 1000000, id = "tx-1") => ({
    provider: "simulado" as const,
    id,
    reference,
    status,
    amountInCents,
    currency: "COP",
  });

  it("un pago aprobado confirma el turno, una sola vez", async () => {
    const { db, booking, payment, url } = await pendingBooking();
    expect(url).toBe(`/pago-simulado/TURNO-${booking.code}-1`);
    expect(await applyTransaction(db, tx(payment.reference, "APPROVED"), {})).toBe("confirmado");
    expect(await applyTransaction(db, tx(payment.reference, "APPROVED"), {})).toBe("duplicado");
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b.status).toBe("confirmada");
  });

  it("un rechazo deja el turno pendiente y permite otro intento con nueva referencia", async () => {
    const { db, booking, client, payment } = await pendingBooking();
    expect(await applyTransaction(db, tx(payment.reference, "DECLINED"), {})).toBe("rechazado");
    expect(await applyTransaction(db, tx(payment.reference, "APPROVED", 1000000, "tx-2"), {})).toBe("ya_procesado");
    const url = await startPayment(db, booking.code, client.id, simulated);
    expect(url).toBe(`/pago-simulado/TURNO-${booking.code}-2`);
  });

  it("no confirma por un monto distinto ni por referencias desconocidas", async () => {
    const { db, payment } = await pendingBooking();
    expect(await applyTransaction(db, tx(payment.reference, "APPROVED", 100), {})).toBe("monto_invalido");
    expect(await applyTransaction(db, tx("TURNO-NOPE-1", "APPROVED", 1000000, "tx-9"), {})).toBe("referencia_desconocida");
  });

  it("si paga tarde y el horario sigue libre, el turno revive", async () => {
    const { db, booking, payment } = await pendingBooking();
    await db.update(bookings).set({ status: "expirada" }).where(eq(bookings.id, booking.id));
    expect(await applyTransaction(db, tx(payment.reference, "APPROVED"), {})).toBe("confirmado");
  });

  it("si paga tarde y otra persona tomó el horario, queda un reembolso pendiente", async () => {
    const { db, booking, payment, corte, juan, client } = await pendingBooking();
    const later = new Date(now.getTime() + 20 * 60_000);
    await createBooking(db, { userId: client.id, serviceId: corte.id, barberId: juan.id, startsAt: booking.startsAt, now: later });
    expect(await applyTransaction(db, tx(payment.reference, "APPROVED"), {})).toBe("sin_cupo");
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b).toMatchObject({ status: "cancelada", refundStatus: "pendiente" });
  });

  it("no deja pagar un turno ajeno ni uno que no está pendiente", async () => {
    const { db, booking, client, payment } = await pendingBooking();
    await expect(startPayment(db, booking.code, client.id + 1, simulated)).rejects.toMatchObject({ code: "no_existe" });
    await applyTransaction(db, tx(payment.reference, "APPROVED"), {});
    await expect(startPayment(db, booking.code, client.id, simulated)).rejects.toMatchObject({ code: "no_permitido" });
  });
});
