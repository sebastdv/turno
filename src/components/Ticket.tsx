import { formatCop } from "@/lib/money";
import { dayKey, formatDay, formatTime } from "@/lib/time";

/** El turno como un tiquete de turnero: la hora grande, el código para dictarlo en la barbería. */
export function Ticket(props: {
  code: string;
  startsAt: Date;
  serviceName: string;
  durationMin: number;
  barberName: string;
  priceCop: number;
  depositCop: number;
  depositPaid: boolean;
  dimmed?: boolean;
}) {
  return (
    <article
      aria-label={`Turno ${props.code}`}
      className={`ticket rounded-xl bg-surface shadow-[0_1px_0_var(--line),0_0_0_1px_var(--line)] ${props.dimmed ? "opacity-60" : ""}`}
    >
      <div className="px-6 pt-6 pb-7">
        <p className="text-sm font-semibold text-muted first-letter:uppercase">{formatDay(dayKey(props.startsAt))}</p>
        <p className="tabular font-display text-8xl leading-[0.85] font-extrabold">{formatTime(props.startsAt)}</p>
        <p className="mt-3 text-lg">
          {props.serviceName} <span className="text-muted">· {props.durationMin} min</span>
        </p>
        <p className="text-lg">
          con <strong className="font-semibold">{props.barberName}</strong>
        </p>
      </div>
      <div className="mx-6 border-t-2 border-dashed border-line" />
      <div className="flex items-end justify-between gap-4 px-6 pt-5 pb-6">
        <div>
          <p className="text-xs font-semibold text-muted">Código</p>
          <p className="font-display text-4xl leading-none font-bold tracking-[0.12em]">{props.code}</p>
        </div>
        <dl className="text-right text-sm">
          <dt className="text-muted">{props.depositPaid ? "Pagas en la barbería" : "Valor del servicio"}</dt>
          <dd className="tabular text-xl font-semibold">{formatCop(props.depositPaid ? props.priceCop - props.depositCop : props.priceCop)}</dd>
        </dl>
      </div>
    </article>
  );
}
