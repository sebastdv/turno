"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { currentUser } from "@/lib/auth/current";
import { BookingError, createBooking } from "@/lib/bookings";
import { startPayment } from "@/lib/payments/payments";

export type ReserveState = { error?: string } | null;

export async function reservar(_: ReserveState, form: FormData): Promise<ReserveState> {
  const serviceId = Number(form.get("servicio"));
  const barber = String(form.get("barbero") ?? "cualquiera");
  const startsAt = new Date(String(form.get("hora") ?? ""));
  const back = String(form.get("volver") ?? "/reservar");

  const user = await currentUser();
  if (!user) redirect(`/entrar?siguiente=${encodeURIComponent(back)}`);
  if (!Number.isInteger(serviceId) || Number.isNaN(startsAt.getTime())) return { error: "Faltan datos del turno. Vuelve a elegir la hora." };

  const db = await getDb();
  let code: string;
  let pending: boolean;
  try {
    const booking = await createBooking(db, {
      userId: user.id,
      serviceId,
      barberId: barber === "cualquiera" ? null : Number(barber),
      startsAt,
    });
    code = booking.code;
    pending = booking.status === "pendiente_pago";
  } catch (err) {
    if (err instanceof BookingError) return { error: err.message };
    throw err;
  }

  // redirect() lanza una excepción a propósito: va fuera de cualquier try.
  if (!pending) redirect(`/turnos/${code}`);
  let next = `/turnos/${code}`;
  try {
    next = await startPayment(db, code, user.id);
  } catch (err) {
    // Sin pasarela disponible el turno queda apartado; su página lo explica.
    if (!(err instanceof BookingError)) throw err;
  }
  redirect(next);
}
