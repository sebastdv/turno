import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { bookings, payments } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { formatCop } from "@/lib/money";
import { paymentConfig } from "@/lib/payments/config";
import { Button } from "@/components/ui";
import { simulatePayment } from "../acciones";

export const metadata: Metadata = { title: "Pago simulado", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PagoSimuladoPage({ params }: { params: Promise<{ referencia: string }> }) {
  const { referencia } = await params;
  if (paymentConfig().mode !== "simulado") notFound();
  const user = await requireUser(`/pago-simulado/${referencia}`);
  const db = await getDb();
  const [row] = await db
    .select({ payment: payments, booking: bookings })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .where(eq(payments.reference, referencia));
  if (!row || row.booking.userId !== user.id) notFound();

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <p className="inline-block rounded bg-warn-soft px-2 py-1 text-xs font-semibold text-warn">Pasarela simulada: no se cobra nada</p>
      <h1 className="mt-4 font-display text-5xl font-extrabold uppercase">Pagar abono</h1>
      <p className="mt-2 text-muted">
        Así se ve el paso de pago cuando no hay llaves de Wompi configuradas. Con ellas, aquí se abre el checkout de Wompi.
      </p>
      <dl className="mt-6 space-y-2 rounded-lg border border-line bg-surface p-5">
        <div className="flex justify-between">
          <dt className="text-muted">Referencia</dt>
          <dd className="font-mono text-sm">{referencia}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Valor</dt>
          <dd className="tabular font-display text-3xl font-bold">{formatCop(row.payment.amountCop)}</dd>
        </div>
      </dl>
      {row.payment.status !== "PENDING" ? (
        <p className="mt-6 text-muted">Este pago ya se procesó.</p>
      ) : (
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <form action={simulatePayment.bind(null, referencia, "APPROVED")}>
            <Button type="submit" className="w-full">
              Aprobar pago
            </Button>
          </form>
          <form action={simulatePayment.bind(null, referencia, "DECLINED")}>
            <Button type="submit" variant="secondary" className="w-full">
              Rechazar pago
            </Button>
          </form>
        </div>
      )}
    </main>
  );
}
