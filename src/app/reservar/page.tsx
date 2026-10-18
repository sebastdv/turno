import type { Metadata } from "next";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { workingHours } from "@/db/schema";
import { currentUser } from "@/lib/auth/current";
import { availability, bookableDays, HOLD_MIN } from "@/lib/bookings";
import { activeBarbers, activeServices } from "@/lib/catalog";
import { depositFor, formatCop } from "@/lib/money";
import { dayKey, formatDay, formatTime, minutesOfDay, shortWeekday, weekdayOf } from "@/lib/time";
import { Confirmar } from "./Confirmar";

export const metadata: Metadata = { title: "Reservar" };
export const dynamic = "force-dynamic";

type Params = { servicio?: string; barbero?: string; dia?: string; hora?: string };

const DAYS_SHOWN = 14;

function href(current: Params, change: Partial<Params>): string {
  const next = { ...current, ...change };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
  return `/reservar?${q}`;
}

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: React.ReactNode }) {
  return (
    <section aria-labelledby={`paso-${n}`} className="border-t border-line py-6">
      <h2 id={`paso-${n}`} className="flex items-baseline gap-3">
        <span className="tabular font-display text-3xl font-extrabold text-muted">{n}</span>
        <span className="text-lg font-semibold">{title}</span>
        {done && <span className="ml-auto truncate text-sm text-muted">{done}</span>}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const chip = (selected: boolean) =>
  `rounded-md border px-4 py-2.5 text-left ${selected ? "border-ink bg-ink text-paper" : "border-line bg-surface hover:border-ink"}`;

export default async function ReservarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const db = await getDb();
  const [services, team, user] = await Promise.all([activeServices(db), activeBarbers(db), currentUser()]);

  const service = services.find((s) => String(s.id) === params.servicio);
  const barberParam = params.barbero === "cualquiera" || team.some((b) => String(b.id) === params.barbero) ? params.barbero : undefined;
  const barber = team.find((b) => String(b.id) === barberParam);
  const days = bookableDays().slice(0, DAYS_SHOWN);
  const day = params.dia && days.includes(params.dia) ? params.dia : undefined;

  // Días en que trabaja el barbero elegido (o cualquiera del equipo).
  const ids = barber ? [barber.id] : team.map((b) => b.id);
  const hours = ids.length ? await db.select().from(workingHours).where(inArray(workingHours.barberId, ids)) : [];
  const openWeekdays = new Set(hours.map((h) => h.weekday));

  const slots = service && barberParam && day ? (await availability(db, { serviceId: service.id, barberId: barber?.id ?? null, day })).slots : null;
  const chosen = params.hora && slots?.has(params.hora) ? new Date(params.hora) : null;
  const freeBarbers = chosen ? team.filter((b) => slots!.get(params.hora!)!.includes(b.id)) : [];

  const groups = slots
    ? [
        { name: "Mañana", items: [...slots.keys()].filter((k) => minutesOfDay(new Date(k)) < 12 * 60) },
        { name: "Tarde", items: [...slots.keys()].filter((k) => minutesOfDay(new Date(k)) >= 12 * 60 && minutesOfDay(new Date(k)) < 17 * 60) },
        { name: "Noche", items: [...slots.keys()].filter((k) => minutesOfDay(new Date(k)) >= 17 * 60) },
      ].filter((g) => g.items.length)
    : [];

  const deposit = service ? depositFor(service.priceCop) : 0;
  const here = href(params, {});

  return (
    <main className="mx-auto max-w-3xl px-4 pt-8 pb-16 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold uppercase sm:text-6xl">Reservar turno</h1>

      <Step n={1} title="Servicio" done={service?.name}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => (
            <li key={s.id}>
              <Link href={href(params, { servicio: String(s.id), hora: undefined })} scroll={false} aria-current={s.id === service?.id} className={`block w-full ${chip(s.id === service?.id)}`}>
                <span className="flex justify-between gap-3 font-semibold">
                  {s.name}
                  <span className="tabular">{formatCop(s.priceCop)}</span>
                </span>
                <span className={`text-sm ${s.id === service?.id ? "opacity-80" : "text-muted"}`}>{s.durationMin} min</span>
              </Link>
            </li>
          ))}
        </ul>
      </Step>

      {service && (
        <Step n={2} title="Barbero" done={barberParam === "cualquiera" ? "El primero libre" : barber?.name}>
          <ul className="flex flex-wrap gap-2">
            <li>
              <Link href={href(params, { barbero: "cualquiera", hora: undefined })} scroll={false} aria-current={barberParam === "cualquiera"} className={`block ${chip(barberParam === "cualquiera")}`}>
                <span className="font-semibold">El primero libre</span>
              </Link>
            </li>
            {team.map((b) => (
              <li key={b.id}>
                <Link href={href(params, { barbero: String(b.id), hora: undefined })} scroll={false} aria-current={b.id === barber?.id} className={`block ${chip(b.id === barber?.id)}`}>
                  <span className="font-semibold">{b.name}</span>
                  {b.bio && <span className={`block text-sm ${b.id === barber?.id ? "opacity-80" : "text-muted"}`}>{b.bio}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Step>
      )}

      {service && barberParam && (
        <Step n={3} title="Día" done={day ? formatDay(day) : undefined}>
          <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
            {days.map((d) => {
              const open = openWeekdays.has(weekdayOf(d));
              const selected = d === day;
              const label = (
                <>
                  <span className="block text-xs font-semibold uppercase">{d === dayKey(new Date()) ? "hoy" : shortWeekday(d)}</span>
                  <span className="tabular font-display text-3xl leading-none font-bold">{Number(d.slice(8))}</span>
                </>
              );
              return (
                <li key={d} className="snap-start">
                  {open ? (
                    <Link href={href(params, { dia: d, hora: undefined })} scroll={false} aria-current={selected} aria-label={formatDay(d)} className={`block w-16 text-center ${chip(selected)} px-0`}>
                      {label}
                    </Link>
                  ) : (
                    <span aria-label={`${formatDay(d)}, cerrado`} className="block w-16 rounded-md border border-dashed border-line px-0 py-2.5 text-center text-muted/60">
                      {label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Step>
      )}

      {slots && day && (
        <Step n={4} title="Hora" done={chosen ? formatTime(chosen) : undefined}>
          {groups.length === 0 ? (
            <p className="text-muted">No quedan horarios libres este día. Prueba con otro día{barber ? " u otro barbero" : ""}.</p>
          ) : (
            <div className="space-y-5">
              {groups.map((g) => (
                <div key={g.name}>
                  <h3 className="mb-2 text-sm font-semibold text-muted">{g.name}</h3>
                  <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {g.items.map((iso) => {
                      const selected = iso === params.hora;
                      return (
                        <li key={iso}>
                          <Link
                            href={href(params, { hora: iso })}
                            scroll={false}
                            aria-current={selected}
                            className={`tabular block rounded-md border py-2 text-center font-display text-2xl font-bold ${selected ? "border-signal bg-signal text-on-signal" : "border-line bg-surface hover:border-ink"}`}
                          >
                            {formatTime(new Date(iso))}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Step>
      )}

      {service && chosen && day && (
        <section aria-labelledby="resumen" className="mt-4 rounded-lg bg-brand p-5 text-on-brand sm:p-6">
          <h2 id="resumen" className="text-sm font-semibold text-on-brand-muted">
            Tu turno
          </h2>
          <p className="mt-1 tabular font-display text-6xl leading-none font-extrabold">{formatTime(chosen)}</p>
          <p className="mt-2 text-lg first-letter:uppercase">
            {formatDay(day)} · {service.name} con{" "}
            {barber ? barber.name : freeBarbers.length === 1 ? freeBarbers[0].name : `el primero libre (${new Intl.ListFormat("es", { type: "disjunction" }).format(freeBarbers.map((b) => b.name))})`}
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-white/15 pt-4 text-sm">
            <div>
              <dt className="text-on-brand-muted">Servicio</dt>
              <dd className="tabular font-semibold">{formatCop(service.priceCop)}</dd>
            </div>
            <div>
              <dt className="text-on-brand-muted">Abono ahora</dt>
              <dd className="tabular font-semibold">{formatCop(deposit)}</dd>
            </div>
            <div>
              <dt className="text-on-brand-muted">En la barbería</dt>
              <dd className="tabular font-semibold">{formatCop(service.priceCop - deposit)}</dd>
            </div>
          </dl>
          <div className="mt-5">
            {user ? (
              <Confirmar
                fields={{ servicio: String(service.id), barbero: barberParam!, hora: chosen.toISOString(), volver: here }}
                label={deposit > 0 ? `Confirmar y pagar ${formatCop(deposit)}` : "Confirmar turno"}
              />
            ) : (
              <Link href={`/entrar?siguiente=${encodeURIComponent(here)}`} className="block rounded-md bg-signal px-4 py-3 text-center font-semibold text-on-signal hover:brightness-95">
                Entra o crea tu cuenta para confirmar
              </Link>
            )}
            {deposit > 0 && <p className="mt-3 text-sm text-on-brand-muted">Te guardamos el horario {HOLD_MIN} minutos mientras pagas.</p>}
          </div>
        </section>
      )}
    </main>
  );
}
