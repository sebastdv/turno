import { createHash, timingSafeEqual } from "node:crypto";

// Integración con Wompi (https://docs.wompi.co): Web Checkout con firma de
// integridad y eventos `transaction.updated` firmados con el secreto de eventos.

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** SHA256("<referencia><monto en centavos><moneda>[<expiración>]<secreto de integridad>"). */
export function integritySignature(input: {
  reference: string;
  amountInCents: number;
  currency: string;
  secret: string;
  expirationTime?: string;
}): string {
  return sha256(`${input.reference}${input.amountInCents}${input.currency}${input.expirationTime ?? ""}${input.secret}`);
}

export interface WompiEvent {
  event: string;
  data: { transaction?: WompiTransaction } & Record<string, unknown>;
  environment?: string;
  signature: { properties: string[]; checksum: string };
  timestamp: number;
  sent_at?: string;
}

export interface WompiTransaction {
  id: string;
  reference: string;
  status: string;
  amount_in_cents: number;
  currency: string;
  [key: string]: unknown;
}

function valueAt(data: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((obj, key) => (obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined), data);
}

/**
 * SHA256 de los valores de `signature.properties` (rutas dentro de `data`), en
 * orden, más el `timestamp` y el secreto de eventos. Las propiedades pueden
 * cambiar entre eventos, así que se leen del propio evento.
 */
export function eventChecksum(event: Pick<WompiEvent, "data" | "signature" | "timestamp">, secret: string): string {
  const values = event.signature.properties.map((p) => String(valueAt(event.data, p) ?? "")).join("");
  return sha256(`${values}${event.timestamp}${secret}`);
}

/** Wompi manda el checksum en mayúsculas; se compara sin distinguir y en tiempo constante. */
export function isValidEvent(event: WompiEvent, secret: string, headerChecksum?: string | null): boolean {
  if (!event?.signature?.properties || !Array.isArray(event.signature.properties) || typeof event.timestamp !== "number") return false;
  const expected = Buffer.from(eventChecksum(event, secret).toLowerCase());
  return [event.signature.checksum, headerChecksum].every((given) => {
    if (given == null) return true; // el header es opcional; el campo del cuerpo no
    const received = Buffer.from(String(given).toLowerCase());
    return received.length === expected.length && timingSafeEqual(received, expected);
  }) && Boolean(event.signature.checksum);
}

export function checkoutUrl(input: {
  publicKey: string;
  reference: string;
  amountInCents: number;
  signature: string;
  redirectUrl: string;
  customer?: { email?: string; fullName?: string; phone?: string };
}): string {
  const url = new URL("https://checkout.wompi.co/p/");
  url.searchParams.set("public-key", input.publicKey);
  url.searchParams.set("currency", "COP");
  url.searchParams.set("amount-in-cents", String(input.amountInCents));
  url.searchParams.set("reference", input.reference);
  url.searchParams.set("signature:integrity", input.signature);
  url.searchParams.set("redirect-url", input.redirectUrl);
  if (input.customer?.email) url.searchParams.set("customer-data:email", input.customer.email);
  if (input.customer?.fullName) url.searchParams.set("customer-data:full-name", input.customer.fullName);
  if (input.customer?.phone) {
    url.searchParams.set("customer-data:phone-number", input.customer.phone);
    url.searchParams.set("customer-data:phone-number-prefix", "+57");
  }
  return url.toString();
}

/** Las llaves de pruebas empiezan por pub_test_/prv_test_ y van contra el sandbox. */
export function apiBase(publicKey: string): string {
  return publicKey.startsWith("pub_test_") ? "https://sandbox.wompi.co/v1" : "https://production.wompi.co/v1";
}

/**
 * Consulta una transacción desde el servidor. Respaldo del webhook cuando la
 * persona vuelve del checkout (y en local, donde Wompi no alcanza el webhook).
 */
export async function fetchTransaction(id: string, keys: { publicKey: string; privateKey: string }): Promise<WompiTransaction | null> {
  const res = await fetch(`${apiBase(keys.publicKey)}/transactions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${keys.privateKey}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: WompiTransaction };
  return body.data ?? null;
}
