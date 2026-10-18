import { and, count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { bookings, paymentEvents, payments, users, type PaymentStatus } from "@/db/schema";
import { BookingError, expireHolds } from "../bookings";
import { paymentConfig, type PaymentConfig } from "./config";
import { checkoutUrl, integritySignature } from "./wompi";

const FINAL: PaymentStatus[] = ["APPROVED", "DECLINED", "VOIDED", "ERROR"];

/**
 * Crea un intento de pago para el abono de un turno y devuelve a dónde mandar
 * a la persona: el checkout de Wompi o la pasarela simulada. Cada intento
 * tiene su referencia: Wompi no acepta reutilizarla después de un rechazo.
 */
export async function startPayment(db: Db, code: string, userId: number, config: PaymentConfig = paymentConfig()): Promise<string> {
  if (config.mode === "ninguno") throw new BookingError("no_permitido", "Los pagos en línea no están configurados.");
  await expireHolds(db);
  const [b] = await db.select().from(bookings).where(and(eq(bookings.code, code), eq(bookings.userId, userId)));
  if (!b) throw new BookingError("no_existe", "No encontramos ese turno.");
  if (b.status !== "pendiente_pago") throw new BookingError("no_permitido", "Este turno no tiene un abono pendiente.");

  const [{ n }] = await db.select({ n: count() }).from(payments).where(eq(payments.bookingId, b.id));
  const reference = `TURNO-${b.code}-${n + 1}`;
  await db.insert(payments).values({ bookingId: b.id, reference, provider: config.mode, amountCop: b.depositCop });

  if (config.mode === "simulado") return `/pago-simulado/${reference}`;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const amountInCents = b.depositCop * 100;
  return checkoutUrl({
    publicKey: config.wompi!.publicKey,
    reference,
    amountInCents,
    signature: integritySignature({ reference, amountInCents, currency: "COP", secret: config.wompi!.integritySecret }),
    redirectUrl: `${config.baseUrl}/turnos/${b.code}`,
    customer: { email: user?.email, fullName: user?.name, phone: user?.phone },
  });
}

export type ApplyResult =
  | "confirmado"
  | "sin_cupo"
  | "rechazado"
  | "pendiente"
  | "duplicado"
  | "ya_procesado"
  | "referencia_desconocida"
  | "monto_invalido";

/**
 * Aplica el resultado de una transacción (de un evento o de una consulta).
 * Idempotente: el mismo (transacción, estado) se procesa una sola vez, y un
 * pago que ya llegó a un estado final no cambia.
 */
export async function applyTransaction(
  db: Db,
  tx: { provider: "wompi" | "simulado"; id: string; reference: string; status: string; amountInCents: number; currency: string },
  payload: unknown,
): Promise<ApplyResult> {
  return db.transaction(async (t) => {
    const inserted = await t
      .insert(paymentEvents)
      .values({ provider: tx.provider, transactionId: tx.id, status: tx.status, payload })
      .onConflictDoNothing()
      .returning({ id: paymentEvents.id });
    if (inserted.length === 0) return "duplicado";

    const [payment] = await t.select().from(payments).where(eq(payments.reference, tx.reference)).for("update");
    if (!payment || payment.provider !== tx.provider) return "referencia_desconocida";
    if (FINAL.includes(payment.status)) return "ya_procesado";
    // Nunca confirmar por un monto o moneda distintos a los del abono.
    if (tx.currency !== "COP" || tx.amountInCents !== payment.amountCop * 100) return "monto_invalido";

    const status = (FINAL as string[]).includes(tx.status) ? (tx.status as PaymentStatus) : "PENDING";
    await t.update(payments).set({ status, transactionId: tx.id, updatedAt: new Date() }).where(eq(payments.id, payment.id));
    if (status !== "APPROVED") return status === "PENDING" ? "pendiente" : "rechazado";

    const [booking] = await t.select().from(bookings).where(eq(bookings.id, payment.bookingId)).for("update");
    if (booking.status === "confirmada") return "confirmado";
    if (booking.status === "pendiente_pago" || booking.status === "expirada") {
      try {
        // Si el apartado había vencido, el horario pudo tomarlo otra persona:
        // la restricción de exclusión lo detecta al reactivarlo.
        await t.transaction((sp) => sp.update(bookings).set({ status: "confirmada" }).where(eq(bookings.id, booking.id)));
        return "confirmado";
      } catch (err) {
        const code = (err as { code?: string; cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code;
        if (code !== "23P01") throw err;
      }
    }
    // Pagó pero el turno ya no existe (cancelado o tomado): hay que devolver el abono.
    await t
      .update(bookings)
      .set({ status: "cancelada", cancelledAt: booking.cancelledAt ?? new Date(), refundStatus: "pendiente" })
      .where(eq(bookings.id, booking.id));
    return "sin_cupo";
  });
}
