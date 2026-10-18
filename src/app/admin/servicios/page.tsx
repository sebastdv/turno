import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { services } from "@/db/schema";
import { guardarServicio } from "../acciones";
import { AdminForm } from "../Formulario";

export const metadata: Metadata = { title: "Servicios" };

const input = "mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-ink focus:ring-2 focus:ring-signal/30";

function ServiceFields({ s }: { s?: typeof services.$inferSelect }) {
  const id = s?.id ?? "nuevo";
  return (
    <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
      <label className="text-sm font-medium">
        Nombre
        <input name="name" required defaultValue={s?.name} className={input} id={`name-${id}`} />
      </label>
      <label className="text-sm font-medium">
        Duración (min)
        <input name="durationMin" type="number" min={10} max={240} step={5} required defaultValue={s?.durationMin ?? 30} className={`${input} tabular`} />
      </label>
      <label className="text-sm font-medium">
        Precio (pesos)
        <input name="priceCop" inputMode="numeric" required defaultValue={s?.priceCop} className={`${input} tabular`} />
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        Descripción
        <input name="description" defaultValue={s?.description} maxLength={140} className={input} />
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
        <input type="checkbox" name="active" defaultChecked={s?.active ?? true} className="size-4 accent-[var(--signal)]" />
        Se puede reservar
      </label>
    </div>
  );
}

export default async function ServiciosPage() {
  const db = await getDb();
  const list = await db.select().from(services).orderBy(asc(services.sort), asc(services.id));
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold uppercase">Servicios</h1>
      <p className="mt-1 text-muted">Los cambios de precio o duración no afectan los turnos ya reservados.</p>
      <ul className="mt-6 space-y-4">
        {list.map((s) => (
          <li key={s.id} className={`rounded-lg border border-line bg-surface p-4 ${s.active ? "" : "opacity-70"}`}>
            <AdminForm action={guardarServicio.bind(null, s.id)} submit="Guardar">
              <ServiceFields s={s} />
            </AdminForm>
          </li>
        ))}
      </ul>
      <section aria-labelledby="nuevo" className="mt-10 rounded-lg border border-dashed border-line p-4">
        <h2 id="nuevo" className="mb-3 font-semibold">
          Nuevo servicio
        </h2>
        <AdminForm action={guardarServicio.bind(null, null)} submit="Crear servicio">
          <ServiceFields />
        </AdminForm>
      </section>
    </main>
  );
}
