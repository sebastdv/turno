"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { BookingError, cancelBooking } from "@/lib/bookings";
import { startPayment } from "@/lib/payments/payments";

export type ActionState = { error?: string } | null;

export async function pagarAbono(code: string): Promise<ActionState> {
  const user = await requireUser(`/turnos/${code}`);
  let url: string;
  try {
    url = await startPayment(await getDb(), code, user.id);
  } catch (err) {
    if (err instanceof BookingError) return { error: err.message };
    throw err;
  }
  redirect(url);
}

export async function cancelarTurno(code: string): Promise<ActionState> {
  const user = await requireUser(`/turnos/${code}`);
  try {
    await cancelBooking(await getDb(), { code, userId: user.id, asAdmin: false });
  } catch (err) {
    if (err instanceof BookingError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/turnos/${code}`);
  return null;
}
