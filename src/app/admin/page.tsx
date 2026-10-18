import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bookings, services, timeOff, users, workingHours } from "@/db/schema";
import { ACTIVE, cancellationTerms, expireHolds } from "@/lib/bookings";
import { activeBarbers } from "@/lib/catalog";
import { formatCop } from "@/lib/money";
import { addDays, atBogota, dayKey, formatClock, formatDay, formatTime, isDayKey, minutesOfDay, weekdayOf } from "@/lib/time";
import { StatusBadge } from "@/components/status";
import { Button } from "@/components/ui";
import { cancelarComoBarberia, marcarTurno } from "./acciones";
import { AdminForm } from "./Formulario";

export const metadata: Metadata = { title: "Agenda" };

const PX_PER_MIN = 1.5;

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { dia } = await searchParams;
  const today = dayKey(new Date());
  const day = dia && isDayKey(dia) ? dia : today;
  const db = await getDb();
  await expireHolds(db);

  const team = await activeBarbers(db);
  const ids = team.map((b) => b.id);
  const from = atBogota(day, 0);
  const to = atBogota(addDays(day, 1), 0);
  const [rows, hours, off] = ids.length
    ? await Promise.all([
        db
          .select({ b: bookings, serviceName: services.name, clientName: users.name, clientPhone: users.phone })
          .from(bookings)
          .innerJoin(services, eq(services.id, bookings.serviceId))
          .innerJoin(users, eq(users.id, bookings.userId))
          .where(and(inArray(bookings.barberId, ids), inArray(bookings.status, ACTIVE), lt(bookings.startsAt, to), gt(bookings.endsAt, from)))
          .orderBy(asc(bookings.startsAt)),
        db.select().from(workingHours).where(and(inArray(workingHours.barberId, ids), eq(workingHours.weekday, weekdayOf(day)))),
        db.select().from(timeOff).where(and(inArray(timeOff.barberId, ids), lt(timeOff.startsAt, to), gt(timeOff.endsAt, from))),
      ])
    : [[], [], []];

  // Eje del día: del primer tramo de trabajo al último, en horas completas.
  const startMin = Math.floor(Math.min(8 * 60, ...hours.map((h) => h.startMin)) / 60) * 60;
  const endMin = Math.ceil(Math.max(19 * 60, ...hours.map((h) => h.endMin)) / 60) * 60;
  const y = (m: number) => (Math.max(startMin, Math.min(endMin, m)) - startMin) * PX_PER_MIN;
  const hourMarks = Array.from({ length: (endMin - startMin) / 60 + 1 }, (_, i) => startMin + i * 60);

  const confirmed = rows.filter((r) => ["confirmada", "atendida", "no_asistio"].includes(r.b.status));
  const pending = rows.filter((r) => r.b.status === "pendiente_pago");
  const now = new Date();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl font-extrabold uppercase">Agenda</h1>
          <p className="text-lg first-letter:uppercase">
            {formatDay(day)}
            {day === today && " · hoy"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin?dia=${addDays(day, -1)}`} className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium hover:border-ink">
            ← Anterior
          </Link>
          {day !== today && (
            <Link href="/admin" className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium hover:border-ink">
              Hoy
            </Link>
          )}
          <Link href={`/admin?dia=${addDays(day, 1)}`} className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium hover:border-ink">
            Siguiente →
          </Link>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Turnos confirmados", String(confirmed.length)],
          ["Esperando abono", String(pending.length)],
          ["Abonos recibidos", formatCop(confirmed.reduce((s, r) => s + r.b.depositCop, 0))],
          ["Por cobrar en la barbería", formatCop(confirmed.reduce((s, r) => s + r.b.priceCop - r.b.depositCop, 0))],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-surface p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="tabular font-display text-3xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      {team.length === 0 ? (
        <p className="mt-8 text-muted">No hay barberos activos.</p>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-lg border border-line bg-surface">
          <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `3.5rem repeat(${team.length}, minmax(0, 1fr))` }}>
            <div />
            {team.map((b) => (
              <div key={b.id} className="border-b border-l border-line px-3 py-2 font-semibold">
                {b.name}
              </div>
            ))}
            <div className="relative" style={{ height: y(endMin) }}>
              {hourMarks.map((m) => (
                <span key={m} className="tabular absolute right-2 -translate-y-1/2 text-xs text-muted" style={{ top: y(m) }}>
                  {formatClock(m)}
                </span>
              ))}
            </div>
            {team.map((b) => (
              <div key={b.id} className="relative border-l border-line bg-[repeating-linear-gradient(135deg,var(--paper)_0_6px,transparent_6px_12px)]" style={{ height: y(endMin) }}>
                {hourMarks.map((m) => (
                  <div key={m} className="absolute inset-x-0 border-t border-line/70" style={{ top: y(m) }} />
                ))}
                {hours
                  .filter((h) => h.barberId === b.id)
                  .map((h) => (
                    <div key={h.id} className="absolute inset-x-0 bg-surface/95" style={{ top: y(h.startMin), height: y(h.endMin) - y(h.startMin) }} />
                  ))}
                {off
                  .filter((o) => o.barberId === b.id)
                  .map((o) => {
                    const top = o.startsAt < from ? startMin : minutesOfDay(o.startsAt);
                    const bottom = o.endsAt >= to ? endMin : minutesOfDay(o.endsAt);
                    return (
                      <div key={o.id} className="absolute inset-x-1 rounded bg-line/70 px-2 py-1 text-xs text-muted" style={{ top: y(top), height: y(bottom) - y(top) }}>
                        Bloqueado{o.reason ? `: ${o.reason}` : ""}
                      </div>
                    );
                  })}
                {rows
                  .filter((r) => r.b.barberId === b.id)
                  .map(({ b: t, clientName, serviceName }) => {
                    const top = y(minutesOfDay(t.startsAt));
                    const height = y(minutesOfDay(t.endsAt)) - top;
                    const tone =
                      t.status === "pendiente_pago"
                        ? "border-warn bg-warn-soft"
                        : t.status === "no_asistio"
                          ? "border-danger bg-danger-soft"
                          : t.status === "atendida"
                            ? "border-ok bg-ok-soft"
                            : "border-brand bg-brand text-on-brand";
                    return (
                      <Link
                        key={t.id}
                        href={`/turnos/${t.code}`}
                        className={`absolute inset-x-1 overflow-hidden rounded border-l-4 px-2 py-1 text-xs leading-tight hover:z-10 hover:ring-2 hover:ring-signal ${tone}`}
                        style={{ top: top + 1, height: Math.max(height - 2, 18) }}
                        title={`${formatTime(t.startsAt)} ${clientName} · ${serviceName}`}
                      >
                        <span className="tabular font-semibold">{formatTime(t.startsAt)}</span> {clientName}
                        <span className="block truncate opacity-80">{serviceName}</span>
                      </Link>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}

      <section aria-labelledby="lista" className="mt-10">
        <h2 id="lista" className="font-semibold">
          Turnos del día
        </h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-muted">No hay turnos este día.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {rows.map(({ b: t, serviceName, clientName, clientPhone }) => {
              const barber = team.find((x) => x.id === t.barberId);
              const started = t.startsAt <= now;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="tabular w-16 font-display text-3xl font-bold">{formatTime(t.startsAt)}</span>
                  <span className="min-w-48 flex-1">
                    <span className="block font-semibold">
                      {clientName}{" "}
                      <a href={`tel:+57${clientPhone}`} className="text-sm font-normal text-muted underline underline-offset-2">
                        {clientPhone}
                      </a>
                    </span>
                    <span className="block text-sm text-muted">
                      {serviceName} con {barber?.name} · <Link href={`/turnos/${t.code}`} className="underline underline-offset-2">{t.code}</Link>
                    </span>
                  </span>
                  <StatusBadge status={t.status} />
                  <span className="flex flex-wrap gap-2">
                    {t.status === "confirmada" && started && (
                      <>
                        <form action={marcarTurno.bind(null, t.code, "atendida")}>
                          <Button variant="secondary">Atendido</Button>
                        </form>
                        <form action={marcarTurno.bind(null, t.code, "no_asistio")}>
                          <Button variant="secondary">No asistió</Button>
                        </form>
                      </>
                    )}
                    {cancellationTerms(t, now).cancellable && (
                      <AdminForm
                        action={cancelarComoBarberia.bind(null, t.code)}
                        submit="Cancelar"
                        confirm={t.status === "confirmada" && t.depositCop > 0 ? `Se avisará que hay que devolver ${formatCop(t.depositCop)}.` : "El horario quedará libre."}
                        variant="danger"
                        className="[&>div]:mt-0"
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
