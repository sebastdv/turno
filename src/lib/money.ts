const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** "$ 30.000" */
export function formatCop(value: number): string {
  return cop.format(value).replace(/ /g, " ");
}

/** Abono configurado, sin pasar del precio del servicio. */
export function depositFor(priceCop: number, configured = Number(process.env.ABONO_COP ?? 10000)): number {
  const deposit = Number.isFinite(configured) && configured > 0 ? Math.round(configured) : 0;
  return Math.min(deposit, priceCop);
}
