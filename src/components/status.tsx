import type { BookingStatus } from "@/db/schema";

const LABELS: Record<BookingStatus, { text: string; style: string }> = {
  pendiente_pago: { text: "Falta el abono", style: "bg-warn-soft text-warn" },
  confirmada: { text: "Confirmado", style: "bg-ok-soft text-ok" },
  cancelada: { text: "Cancelado", style: "bg-line/60 text-muted" },
  expirada: { text: "Vencido", style: "bg-line/60 text-muted" },
  atendida: { text: "Atendido", style: "bg-ok-soft text-ok" },
  no_asistio: { text: "No asistió", style: "bg-danger-soft text-danger" },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const s = LABELS[status];
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${s.style}`}>{s.text}</span>;
}
