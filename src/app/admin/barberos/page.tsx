import type { Metadata } from "next";
import { asc, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { barbers, timeOff, workingHours } from "@/db/schema";
import { formatRanges } from "@/lib/schedule";
import { dayKey, formatDay, formatTime } from "@/lib/time";
import { Button } from "@/components/ui";
import { agregarBloqueo, guardarBarbero, guardarHorario, quitarBloqueo } from "../acciones";
import { AdminForm } from "../Formulario";

export const metadata: Metadata = { title: "Barberos" };

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// La semana arranca el lunes, como la piensa la barbería.
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const input = "mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-ink focus:ring-2 focus:ring-signal/30";

export default async function BarberosPage() {
  const db = await getDb();
  const [team, hours, blocks] = await Promise.all([
    db.select().from(barbers).orderBy(asc(barbers.sort), asc(barbers.id)),
    db.select().from(workingHours),
    db.select().from(timeOff).where(gt(timeOff.endsAt, new Date())).orderBy(asc(timeOff.startsAt)),
  ]);
  const today = dayKey(new Date());

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold uppercase">Barberos</h1>

      <ul className="mt-6 space-y-8">
        {team.map((b) => (
          <li key={b.id} className={`rounded-lg border border-line bg-surface p-5 ${b.active ? "" : "opacity-70"}`}>
            <h2 className="font-display text-3xl font-bold uppercase">{b.name}</h2>

            <AdminForm action={guardarBarbero.bind(null, b.id)} submit="Guardar datos" variant="secondary" className="mt-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
                <label className="text-sm font-medium">
                  Nombre
                  <input name="name" required defaultValue={b.name} className={input} />
                </label>
                <label className="text-sm font-medium">
                  Especialidad
                  <input name="bio" defaultValue={b.bio} maxLength={80} className={input} />
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
                  <input type="checkbox" name="active" defaultChecked={b.active} className="size-4 accent-[var(--signal)]" />
                  Recibe turnos
                </label>
              </div>
            </AdminForm>

            <details className="mt-5 group" open={hours.every((h) => h.barberId !== b.id)}>
              <summary className="cursor-pointer font-semibold">Horario semanal</summary>
              <AdminForm action={guardarHorario.bind(null, b.id)} submit="Guardar horario" className="mt-3">
                <p className="mb-3 text-sm text-muted">Tramos separados por coma, por ejemplo 09:00-13:00, 14:00-19:00. Vacío es día de descanso.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ORDER.map((d) => (
                    <label key={d} className="grid grid-cols-[6rem_1fr] items-center gap-2 text-sm font-medium">
                      {WEEKDAYS[d]}
                      <input
                        name={`dia-${d}`}
                        defaultValue={formatRanges(hours.filter((h) => h.barberId === b.id && h.weekday === d))}
                        placeholder="Descansa"
                        className={`${input} mt-0 tabular`}
                      />
                    </label>
                  ))}
                </div>
              </AdminForm>
            </details>

            <details className="mt-5">
              <summary className="cursor-pointer font-semibold">Bloqueos (vacaciones, citas, días cerrados)</summary>
              <ul className="mt-3 space-y-2">
                {blocks
                  .filter((x) => x.barberId === b.id)
                  .map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm">
                      <span className="first-letter:uppercase">
                        {formatDay(dayKey(x.startsAt))}, {formatTime(x.startsAt)} a {formatTime(x.endsAt)}
                        {x.reason && <span className="text-muted"> · {x.reason}</span>}
                      </span>
                      <form action={quitarBloqueo.bind(null, x.id)}>
                        <Button variant="secondary">Quitar</Button>
                      </form>
                    </li>
                  ))}
              </ul>
              <AdminForm action={agregarBloqueo.bind(null, b.id)} submit="Agregar bloqueo" variant="secondary" className="mt-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <label className="text-sm font-medium">
                    Día
                    <input type="date" name="dia" min={today} required className={input} />
                  </label>
                  <label className="text-sm font-medium">
                    Desde
                    <input type="time" name="desde" defaultValue="08:00" step={900} required className={input} />
                  </label>
                  <label className="text-sm font-medium">
                    Hasta
                    <input type="time" name="hasta" defaultValue="20:00" step={900} required className={input} />
                  </label>
                  <label className="text-sm font-medium">
                    Motivo
                    <input name="motivo" maxLength={80} placeholder="Opcional" className={input} />
                  </label>
                </div>
              </AdminForm>
            </details>
          </li>
        ))}
      </ul>

      <section aria-labelledby="nuevo" className="mt-10 rounded-lg border border-dashed border-line p-5">
        <h2 id="nuevo" className="font-semibold">
          Agregar barbero
        </h2>
        <AdminForm action={guardarBarbero.bind(null, null)} submit="Agregar">
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr]">
            <label className="text-sm font-medium">
              Nombre
              <input name="name" required className={input} />
            </label>
            <label className="text-sm font-medium">
              Especialidad
              <input name="bio" maxLength={80} className={input} />
            </label>
          </div>
        </AdminForm>
      </section>
    </main>
  );
}
