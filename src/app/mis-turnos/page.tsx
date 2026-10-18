import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { barbers, bookings, services } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { expireHolds } from "@/lib/bookings";
import { dayKey, formatDay, formatTime } from "@/lib/time";
import { StatusBadge } from "@/components/status";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Mis turnos" };
export const dynamic = "force-dynamic";

type Row = {
  b: typeof bookings.$inferSelect;
  serviceName: string;
  barberName: string;
};

function List({ items }: { items: Row[] }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map(({ b, serviceName, barberName }) => (
        <li key={b.id}>
          <Link href={`/turnos/${b.code}`} className="flex items-center gap-4 py-4 hover:bg-surface">
            <span className="tabular w-20 shrink-0 font-display text-4xl leading-none font-bold">{formatTime(b.startsAt)}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold first-letter:uppercase">{formatDay(dayKey(b.startsAt))}</span>
              <span className="block truncate text-sm text-muted">
                {serviceName} con {barberName}
              </span>
            </span>
            <StatusBadge status={b.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function MisTurnosPage() {
  const user = await requireUser("/mis-turnos");
  const db = await getDb();
  await expireHolds(db);
  const rows = await db
    .select({ b: bookings, serviceName: services.name, barberName: barbers.name })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(barbers, eq(barbers.id, bookings.barberId))
    .where(eq(bookings.userId, user.id))
    .orderBy(desc(bookings.startsAt));

  const now = new Date().getTime();
  const upcoming = rows.filter((r) => r.b.endsAt.getTime() > now && ["confirmada", "pendiente_pago"].includes(r.b.status)).reverse();
  const rest = rows.filter((r) => !upcoming.includes(r));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-5xl font-extrabold uppercase">Mis turnos</h1>
        <ButtonLink href="/reservar">Reservar otro</ButtonLink>
      </div>
      <section className="mt-8" aria-labelledby="proximos">
        <h2 id="proximos" className="mb-3 font-semibold">
          Próximos
        </h2>
        {upcoming.length ? <List items={upcoming} /> : <p className="text-muted">No tienes turnos próximos.</p>}
      </section>
      {rest.length > 0 && (
        <section className="mt-10" aria-labelledby="historial">
          <h2 id="historial" className="mb-3 font-semibold">
            Historial
          </h2>
          <List items={rest} />
        </section>
      )}
    </main>
  );
}
