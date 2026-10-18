import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { bookings, payments } from "@/db/schema";
import { createBooking } from "@/lib/bookings";
import { paymentConfig } from "@/lib/payments/config";
import { startPayment } from "@/lib/payments/payments";
import { eventChecksum, type WompiEvent } from "@/lib/payments/wompi";
import { seededDb } from "@/lib/test-helpers";
import { atBogota } from "@/lib/time";

const state: { db?: Db } = {};
vi.mock("@/db/client", async (original) => ({
  ...(await original<typeof import("@/db/client")>()),
  getDb: () => Promise.resolve(state.db),
}));

const { POST } = await import("./route");

const KEYS = {
  WOMPI_PUBLIC_KEY: "pub_test_abc",
  WOMPI_PRIVATE_KEY: "prv_test_abc",
  WOMPI_INTEGRITY_SECRET: "test_integrity_abc",
  WOMPI_EVENTS_SECRET: "test_events_abc",
};

function signed(reference: string, amountInCents: number, status = "APPROVED"): WompiEvent {
  const event: WompiEvent = {
    event: "transaction.updated",
    data: { transaction: { id: "15113-1700000000-12345", reference, status, amount_in_cents: amountInCents, currency: "COP" } },
    environment: "test",
    signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum: "" },
    timestamp: 1_760_000_000,
  };
  event.signature.checksum = eventChecksum(event, KEYS.WOMPI_EVENTS_SECRET).toUpperCase();
  return event;
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://localhost/api/pagos/wompi", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers }));

describe("webhook de Wompi", () => {
  let reference: string;
  let bookingId: number;

  beforeEach(async () => {
    for (const [k, v] of Object.entries(KEYS)) vi.stubEnv(k, v);
    const ctx = await seededDb();
    state.db = ctx.db;
    // Reloj fijo: el apartado del turno no debe vencer según la fecha real.
    const now = atBogota("2026-10-19", 18 * 60);
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const b = await createBooking(ctx.db, { userId: ctx.client.id, serviceId: ctx.corte.id, barberId: ctx.juan.id, startsAt: atBogota("2026-10-20", 600), now });
    const url = new URL(await startPayment(ctx.db, b.code, ctx.client.id, paymentConfig()));
    expect(url.host).toBe("checkout.wompi.co");
    reference = url.searchParams.get("reference")!;
    bookingId = b.id;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("confirma el turno con un evento firmado, y responde 200 a los reenvíos sin repetir", async () => {
    const event = signed(reference, 1_000_000);
    const res = await post(event, { "x-event-checksum": event.signature.checksum });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultado: "confirmado" });
    expect(await (await post(event)).json()).toEqual({ resultado: "duplicado" });
    const [b] = await state.db!.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(b.status).toBe("confirmada");
  });

  it("rechaza con 401 un evento alterado o con otra firma en el header", async () => {
    const event = signed(reference, 1_000_000);
    event.data.transaction!.amount_in_cents = 100;
    expect((await post(event)).status).toBe(401);
    expect((await post(signed(reference, 1_000_000), { "x-event-checksum": "ABC" })).status).toBe(401);
    const [p] = await state.db!.select().from(payments).where(eq(payments.reference, reference));
    expect(p.status).toBe("PENDING");
  });

  it("no confirma si el monto firmado no es el del abono", async () => {
    expect(await (await post(signed(reference, 100))).json()).toEqual({ resultado: "monto_invalido" });
  });

  it("responde 400 si el cuerpo no es JSON y 404 si Wompi no está configurado", async () => {
    expect((await post("no es json")).status).toBe(400);
    vi.stubEnv("WOMPI_EVENTS_SECRET", "");
    expect((await post(signed(reference, 1_000_000))).status).toBe(404);
  });
});
