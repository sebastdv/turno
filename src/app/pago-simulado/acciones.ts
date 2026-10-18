"use server";

import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { bookings, payments } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { paymentConfig } from "@/lib/payments/config";
import { applyTransaction } from "@/lib/payments/payments";
import { SIMULATED_SECRET, simulatedEvent } from "@/lib/payments/simulated";
import { isValidEvent } from "@/lib/payments/wompi";

export async function simulatePayment(reference: string, status: "APPROVED" | "DECLINED") {
  // En producción con Wompi configurado, esta acción no existe.
  if (paymentConfig().mode !== "simulado") notFound();
  const user = await requireUser(`/pago-simulado/${reference}`);
  const db = await getDb();
  const [row] = await db
    .select({ payment: payments, booking: bookings })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .where(eq(payments.reference, reference));
  if (!row || row.booking.userId !== user.id || row.payment.provider !== "simulado") notFound();

  const event = simulatedEvent({ reference, amountInCents: row.payment.amountCop * 100, status });
  // Mismo camino que un evento real: verificar la firma y aplicar.
  if (!isValidEvent(event, SIMULATED_SECRET)) throw new Error("Firma simulada inválida.");
  const t = event.data.transaction!;
  await applyTransaction(
    db,
    { provider: "simulado", id: t.id, reference, status: t.status, amountInCents: t.amount_in_cents, currency: t.currency },
    event,
  );
  redirect(`/turnos/${row.booking.code}?pago=${status === "APPROVED" ? "aprobado" : "rechazado"}`);
}
