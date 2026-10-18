export type PaymentMode = "wompi" | "simulado" | "ninguno";

export interface PaymentConfig {
  mode: PaymentMode;
  wompi: { publicKey: string; privateKey: string; integritySecret: string; eventsSecret: string } | null;
  baseUrl: string;
}

/**
 * Con las llaves de Wompi, pagos reales (o de pruebas con llaves pub_test_).
 * Sin ellas, la pasarela simulada: solo en desarrollo, o en una demo que la
 * active a propósito con PAGOS_SIMULADOS=1. En producción sin llaves no hay pagos.
 */
export function paymentConfig(env: NodeJS.ProcessEnv = process.env): PaymentConfig {
  const baseUrl = (env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const { WOMPI_PUBLIC_KEY: publicKey, WOMPI_PRIVATE_KEY: privateKey, WOMPI_INTEGRITY_SECRET: integritySecret, WOMPI_EVENTS_SECRET: eventsSecret } = env;
  if (publicKey && privateKey && integritySecret && eventsSecret) {
    return { mode: "wompi", wompi: { publicKey, privateKey, integritySecret, eventsSecret }, baseUrl };
  }
  const simulated = env.NODE_ENV !== "production" || env.PAGOS_SIMULADOS === "1";
  return { mode: simulated ? "simulado" : "ninguno", wompi: null, baseUrl };
}
