import { getDb } from "@/db/client";
import { paymentConfig } from "@/lib/payments/config";
import { applyTransaction } from "@/lib/payments/payments";
import { isValidEvent, type WompiEvent } from "@/lib/payments/wompi";

/**
 * Eventos de Wompi. Se responde 200 a todo evento con firma válida (aunque no
 * cambie nada) para que Wompi no reintente; un evento sin firma válida se ignora.
 */
export async function POST(request: Request) {
  const config = paymentConfig();
  if (config.mode !== "wompi") return Response.json({ error: "Wompi no está configurado." }, { status: 404 });

  let event: WompiEvent;
  try {
    event = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo no es JSON." }, { status: 400 });
  }
  if (!isValidEvent(event, config.wompi!.eventsSecret, request.headers.get("x-event-checksum"))) {
    return Response.json({ error: "Firma inválida." }, { status: 401 });
  }
  const t = event.data?.transaction;
  if (event.event !== "transaction.updated" || !t) return Response.json({ resultado: "ignorado" });

  const resultado = await applyTransaction(
    await getDb(),
    { provider: "wompi", id: t.id, reference: t.reference, status: t.status, amountInCents: t.amount_in_cents, currency: t.currency },
    event,
  );
  return Response.json({ resultado });
}
