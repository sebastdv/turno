import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { barbers, bookings, services, users } from "@/db/schema";
import { expireHolds } from "@/lib/bookings";
import { formatCop } from "@/lib/money";
import { addDays, atBogota, dayKey, formatDay, formatTime } from "@/lib/time";
import { StatusBadge } from "@/components/status";
import { Button } from "@/components/ui";
import { marcarDevuelto } from "../acciones";

export const metadata: Metadata = { title: "Turnos y reembolsos" };

export default async function TurnosAdminPage() {
  const db = await getDb();
  await expireHolds(db);
  const now = new Date();
  const columns = { b: bookings, serviceName: services.name, barberName: barbers.name, clientName: users.name, clientPhone: users.phone };
  const base = () =>
    db
      .select(columns)
      .from(bookings)
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .innerJoin(barbers, eq(barbers.id, bookings.barberId))
      .innerJoin(users, eq(users.id, bookings.userId));

  const [refunds, upcoming] = await Promise.all([
    base().where(eq(bookings.refundStatus, "pendiente")).orderBy(desc(bookings.cancelledAt)),
    base()
      .where(
        and(
          inArray(bookings.status, ["confirmada", "pendiente_pago"]),
          gt(bookings.startsAt, now),
          lt(bookings.startsAt, atBogota(addDays(dayKey(now), 8), 0)),
        ),
      )
      .orderBy(asc(bookings.startsAt)),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold uppercase">Turnos y reembolsos</h1>

      <section aria-labelledby="reembolsos" className="mt-8">
        <h2 id="reembolsos" className="font-semibold">
          Abonos por devolver
        </h2>
        <p className="text-sm text-muted">
          Turnos cancelados a tiempo o por la barbería, y pagos que llegaron después de que el horario se ocupó. La devolución se hace por fuera
          (transferencia o Nequi); aquí se marca cuando ya está hecha.
        </p>
        {refunds.length === 0 ? (
          <p className="mt-3 text-muted">No hay abonos por devolver.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {refunds.map(({ b, clientName, clientPhone, serviceName }) => (
              <li key={b.id} className="flex flex-wrap items-center gap-4 py-3">
                <span className="tabular w-28 font-display text-2xl font-bold">{formatCop(b.depositCop)}</span>
                <span className="min-w-48 flex-1">
                  <span className="block font-semibold">
                    {clientName}{" "}
                    <a href={`tel:+57${clientPhone}`} className="text-sm font-normal text-muted underline underline-offset-2">
                      {clientPhone}
                    </a>
                  </span>
                  <span className="block text-sm text-muted">
                    {serviceName} del {formatDay(dayKey(b.startsAt))} · {b.code}
                  </span>
                </span>
                <form action={marcarDevuelto.bind(null, b.code)}>
                  <Button variant="secondary">Marcar devuelto</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="proximos" className="mt-12">
        <h2 id="proximos" className="font-semibold">
          Próximos 7 días
        </h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-muted">No hay turnos próximos.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {upcoming.map(({ b, clientName, serviceName, barberName }) => (
              <li key={b.id}>
                <Link href={`/admin?dia=${dayKey(b.startsAt)}`} className="flex flex-wrap items-center gap-4 py-3 hover:bg-surface">
                  <span className="w-44 text-sm first-letter:uppercase">
                    {formatDay(dayKey(b.startsAt))}
                    <span className="tabular block font-display text-2xl font-bold">{formatTime(b.startsAt)}</span>
                  </span>
                  <span className="min-w-48 flex-1">
                    <span className="block font-semibold">{clientName}</span>
                    <span className="block text-sm text-muted">
                      {serviceName} con {barberName}
                    </span>
                  </span>
                  <StatusBadge status={b.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
