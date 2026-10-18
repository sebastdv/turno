import Link from "next/link";
import { getDb } from "@/db/client";
import { activeBarbers, activeServices } from "@/lib/catalog";
import { depositFor, formatCop } from "@/lib/money";
import { nextFreeByBarber } from "@/lib/next-free";
import { addDays, dayKey, formatDay, formatTime } from "@/lib/time";
import { ButtonLink } from "@/components/ui";

export const dynamic = "force-dynamic";

function relativeDay(date: Date): string {
  const today = dayKey(new Date());
  const day = dayKey(date);
  if (day === today) return "Hoy";
  if (day === addDays(today, 1)) return "Mañana";
  return formatDay(day).split(" ").slice(0, 2).join(" ");
}

export default async function Home() {
  const db = await getDb();
  const [services, team] = await Promise.all([activeServices(db), activeBarbers(db)]);
  const first = services[0];
  const nextFree = first ? await nextFreeByBarber(db, first.id, team.map((b) => b.id)) : new Map<number, Date>();
  const deposit = first ? depositFor(Math.max(...services.map((s) => s.priceCop))) : 0;

  return (
    <main>
      <section className="bg-brand text-on-brand">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 pt-10 pb-14 sm:px-6 md:grid-cols-[1.1fr_1fr] md:items-end md:pt-16">
          <div>
            <h1 className="font-display text-6xl leading-[0.9] font-extrabold uppercase sm:text-7xl">
              Tu turno,
              <br />
              sin hacer fila.
            </h1>
            <p className="mt-5 max-w-md text-lg text-on-brand-muted">
              Elige el servicio, el barbero y la hora. {deposit > 0 ? `Pagas un abono de ${formatCop(deposit)} que se descuenta en la barbería.` : ""}
            </p>
            <ButtonLink href="/reservar" className="mt-7 px-6 py-3 text-base">
              Reservar turno
            </ButtonLink>
          </div>

          {first && team.length > 0 && (
            <div className="rounded-lg bg-brand-2 p-5 ring-1 ring-white/10" aria-labelledby="tablero">
              <h2 id="tablero" className="text-sm font-semibold text-on-brand-muted">
                Próximo turno libre · {first.name.toLowerCase()}
              </h2>
              <ul className="mt-3 divide-y divide-white/10">
                {team.map((b) => {
                  const at = nextFree.get(b.id);
                  return (
                    <li key={b.id}>
                      <Link
                        href={at ? `/reservar?servicio=${first.id}&barbero=${b.id}&dia=${dayKey(at)}&hora=${encodeURIComponent(at.toISOString())}` : `/reservar?servicio=${first.id}&barbero=${b.id}`}
                        className="flex items-baseline justify-between gap-4 py-3 hover:text-signal"
                      >
                        <span className="text-lg font-semibold">{b.name}</span>
                        {at ? (
                          <span className="tabular font-display text-4xl leading-none font-bold">
                            <span className="mr-2 text-base font-semibold text-on-brand-muted uppercase">{relativeDay(at)}</span>
                            {formatTime(at)}
                          </span>
                        ) : (
                          <span className="text-on-brand-muted">Sin cupos esta semana</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6" aria-labelledby="servicios">
        <h2 id="servicios" className="font-display text-4xl font-extrabold uppercase">
          Servicios
        </h2>
        <ul className="mt-6 max-w-2xl">
          {services.map((s) => (
            <li key={s.id}>
              <Link href={`/reservar?servicio=${s.id}`} className="group block py-3">
                <span className="flex items-baseline gap-3">
                  <span className="text-lg font-semibold group-hover:underline">{s.name}</span>
                  <span aria-hidden className="flex-1 translate-y-[-4px] border-b-2 border-dotted border-line" />
                  <span className="tabular font-display text-2xl font-bold">{formatCop(s.priceCop)}</span>
                </span>
                <span className="text-sm text-muted">
                  {s.durationMin} min · {s.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line" aria-labelledby="como">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-3">
          <h2 id="como" className="font-display text-4xl font-extrabold uppercase md:col-span-3">
            Cómo funciona el abono
          </h2>
          <p>
            <strong className="block font-semibold">Aparta tu hora</strong>
            <span className="text-muted">Tienes 15 minutos para pagar el abono en línea; mientras tanto, nadie más toma ese horario.</span>
          </p>
          <p>
            <strong className="block font-semibold">Se descuenta del servicio</strong>
            <span className="text-muted">En la barbería pagas solo la diferencia.</span>
          </p>
          <p>
            <strong className="block font-semibold">¿No puedes ir?</strong>
            <span className="text-muted">Cancela con 3 horas o más de anticipación y te devolvemos el abono.</span>
          </p>
        </div>
      </section>
    </main>
  );
}
