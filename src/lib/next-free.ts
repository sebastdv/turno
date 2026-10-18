import type { Db } from "@/db/client";
import { availability, bookableDays } from "./bookings";

/** Primer horario libre de cada barbero para un servicio, buscando hasta `days` días. */
export async function nextFreeByBarber(db: Db, serviceId: number, barberIds: number[], days = 7, now = new Date()) {
  const found = new Map<number, Date>();
  for (const day of bookableDays(now).slice(0, days)) {
    const { slots } = await availability(db, { serviceId, barberId: null, day, now });
    for (const [iso, free] of slots) for (const id of free) if (!found.has(id)) found.set(id, new Date(iso));
    if (barberIds.every((id) => found.has(id))) break;
  }
  return found;
}
