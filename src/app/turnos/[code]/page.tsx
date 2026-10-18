import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { payments } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { bookingDetails, cancellationTerms, expireHolds, REFUND_LIMIT_HOURS } from "@/lib/bookings";
import { formatCop } from "@/lib/money";
import { paymentConfig } from "@/lib/payments/config";
import { applyTransaction } from "@/lib/payments/payments";
import { fetchTransaction } from "@/lib/payments/wompi";
import { formatTime } from "@/lib/time";
import { Ticket } from "@/components/Ticket";
import { Alert, ButtonLink } from "@/components/ui";
import { Cancelar, EsperarPago, PagarAbono } from "./Acciones";

export const metadata: Metadata = { title: "Tu turno", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Respaldo del webhook: al volver del checkout, consultar la transacción en Wompi. */
async function syncFromWompi(bookingId: number, transactionId: string) {
  const config = paymentConfig();
  if (config.mode !== "wompi") return;
  const db = await getDb();
  const tx = await fetchTransaction(transactionId, config.wompi!).catch(() => null);
  if (!tx) return;
  // Solo si la transacción es de un pago de este mismo turno.
  const [mine] = await db.select().from(payments).where(and(eq(payments.bookingId, bookingId), eq(payments.reference, tx.reference)));
  if (!mine) return;
  await applyTransaction(
    db,
    { provider: "wompi", id: tx.id, reference: tx.reference, status: tx.status, amountInCents: tx.amount_in_cents, currency: tx.currency },
    { fuente: "consulta", transaction: tx },
  );
}

export default async function TurnoPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ id?: string; pago?: string }>;
}) {
  const { code } = await params;
  const { id, pago } = await searchParams;
  const user = await requireUser(`/turnos/${code}`);
  const db = await getDb();
  await expireHolds(db);

  let details = await bookingDetails(db, code);
  if (!details || (details.booking.userId !== user.id && user.role !== "admin")) notFound();
  if (id && details.booking.status === "pendiente_pago") {
    await syncFromWompi(details.booking.id, id);
    details = (await bookingDetails(db, code))!;
  }

  const { booking, service, barber } = details;
  const terms = cancellationTerms(booking);
  const depositPaid = booking.depositCop > 0 && ["confirmada", "atendida", "no_asistio"].includes(booking.status);
  const isOwner = booking.userId === user.id;

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <div className="mb-6 space-y-3">
        {booking.status === "confirmada" && <Alert tone="ok">Tu turno está confirmado. Te esperamos {booking.depositCop > 0 ? "con el abono ya descontado" : ""}.</Alert>}
        {booking.status === "pendiente_pago" && (
          <>
            {pago === "rechazado" && <Alert>El pago fue rechazado. Puedes intentarlo de nuevo.</Alert>}
            <Alert tone="warn">
              Falta pagar el abono de {formatCop(booking.depositCop)}. Te guardamos el horario hasta las {formatTime(booking.holdExpiresAt)}.
            </Alert>
          </>
        )}
        {booking.status === "expirada" && <Alert tone="warn">El tiempo para pagar el abono venció y el horario se liberó.</Alert>}
        {booking.status === "cancelada" && (
          <Alert tone="warn">
            Turno cancelado.{" "}
            {booking.refundStatus === "pendiente"
              ? `Te devolveremos el abono de ${formatCop(booking.depositCop)}.`
              : booking.refundStatus === "hecho"
                ? "El abono ya fue devuelto."
                : ""}
          </Alert>
        )}
      </div>

      <Ticket
        code={booking.code}
        startsAt={booking.startsAt}
        serviceName={service.name}
        durationMin={service.durationMin}
        barberName={barber.name}
        priceCop={booking.priceCop}
        depositCop={booking.depositCop}
        depositPaid={depositPaid}
        dimmed={["cancelada", "expirada"].includes(booking.status)}
      />

      <div className="mt-6 space-y-4">
        {booking.status === "pendiente_pago" && isOwner && (
          <>
            {id && <EsperarPago />}
            <PagarAbono code={booking.code} label={`Pagar abono de ${formatCop(booking.depositCop)}`} />
          </>
        )}
        {booking.status === "expirada" && (
          <ButtonLink href={`/reservar?servicio=${service.id}`} className="w-full py-3">
            Reservar de nuevo
          </ButtonLink>
        )}
        {terms.cancellable && isOwner && (
          <Cancelar
            code={booking.code}
            terms={
              booking.status === "pendiente_pago"
                ? "El horario quedará libre para otra persona."
                : terms.refund
                  ? `Faltan más de ${REFUND_LIMIT_HOURS} horas: te devolvemos el abono de ${formatCop(booking.depositCop)}.`
                  : booking.depositCop > 0
                    ? `Faltan menos de ${REFUND_LIMIT_HOURS} horas: el abono de ${formatCop(booking.depositCop)} no se devuelve.`
                    : "El horario quedará libre para otra persona."
            }
          />
        )}
        <p className="text-sm text-muted">
          <Link href="/mis-turnos" className="underline underline-offset-2 hover:text-ink">
            Ver todos mis turnos
          </Link>
        </p>
      </div>
    </main>
  );
}
