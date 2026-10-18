import { formatClock, parseClock } from "./time";

export interface DayRange {
  startMin: number;
  endMin: number;
}

/**
 * "09:00-13:00, 14:00-19:00" → tramos ordenados. Vacío = día cerrado.
 * Rechaza horas inválidas, tramos al revés y tramos que se cruzan.
 */
export function parseRanges(text: string): { ranges: DayRange[] } | { error: string } {
  const parts = text
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const ranges: DayRange[] = [];
  for (const part of parts) {
    const m = /^(\d{1,2}:\d{2})\s*(?:-|–|a)\s*(\d{1,2}:\d{2})$/.exec(part);
    const start = m ? parseClock(m[1]) : null;
    const end = m ? parseClock(m[2]) : null;
    if (start === null || end === null) return { error: `"${part}" no es un tramo válido. Usa el formato 09:00-13:00.` };
    if (start >= end) return { error: `En "${part}" la hora final debe ser posterior a la inicial.` };
    ranges.push({ startMin: start, endMin: end });
  }
  ranges.sort((a, b) => a.startMin - b.startMin);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].startMin < ranges[i - 1].endMin) return { error: "Hay tramos que se cruzan." };
  }
  return { ranges };
}

export function formatRanges(ranges: DayRange[]): string {
  return [...ranges]
    .sort((a, b) => a.startMin - b.startMin)
    .map((r) => `${formatClock(r.startMin)}-${formatClock(r.endMin)}`)
    .join(", ");
}
