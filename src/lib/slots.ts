import { atBogota } from "./time";

export const SLOT_STEP_MIN = 15;
/** No se puede reservar con menos de una hora de anticipación. */
export const LEAD_MIN = 60;
export const MAX_DAYS_AHEAD = 30;

export interface Range {
  start: Date;
  end: Date;
}

const overlaps = (a: Range, b: Range) => a.start < b.end && b.start < a.end;

/**
 * Horas de inicio posibles para un servicio de `durationMin` en un día:
 * caben completas dentro de un tramo de trabajo, no se cruzan con turnos ni
 * bloqueos (`busy`) y empiezan después de `now + LEAD_MIN`.
 */
export function computeSlots(input: {
  day: string;
  durationMin: number;
  hours: { startMin: number; endMin: number }[];
  busy: Range[];
  now: Date;
  stepMin?: number;
  leadMin?: number;
}): Date[] {
  const step = input.stepMin ?? SLOT_STEP_MIN;
  const earliest = input.now.getTime() + (input.leadMin ?? LEAD_MIN) * 60_000;
  const starts: Date[] = [];
  for (const h of [...input.hours].sort((a, b) => a.startMin - b.startMin)) {
    // Los turnos arrancan en múltiplos del paso, aunque el tramo empiece a las 9:10.
    const first = Math.ceil(h.startMin / step) * step;
    for (let m = first; m + input.durationMin <= h.endMin; m += step) {
      const slot = { start: atBogota(input.day, m), end: atBogota(input.day, m + input.durationMin) };
      if (slot.start.getTime() < earliest) continue;
      if (input.busy.some((b) => overlaps(slot, b))) continue;
      starts.push(slot.start);
    }
  }
  return starts;
}
