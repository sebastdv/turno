import { randomUUID } from "node:crypto";
import { eventChecksum, type WompiEvent } from "./wompi";

/** Secreto de la pasarela simulada: solo firma eventos que nunca salen del servidor. */
export const SIMULATED_SECRET = "pasarela-simulada";

/** Un evento con el mismo formato que Wompi, firmado como lo haría Wompi. */
export function simulatedEvent(input: { reference: string; amountInCents: number; status: "APPROVED" | "DECLINED" }): WompiEvent {
  const event: WompiEvent = {
    event: "transaction.updated",
    data: {
      transaction: {
        id: `SIM-${randomUUID()}`,
        reference: input.reference,
        status: input.status,
        amount_in_cents: input.amountInCents,
        currency: "COP",
        payment_method_type: "SIMULADO",
      },
    },
    environment: "test",
    signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum: "" },
    timestamp: Math.floor(Date.now() / 1000),
    sent_at: new Date().toISOString(),
  };
  event.signature.checksum = eventChecksum(event, SIMULATED_SECRET).toUpperCase();
  return event;
}
