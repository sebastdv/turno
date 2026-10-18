// La barbería trabaja en hora de Bogotá. Colombia no tiene horario de verano
// (UTC−5 todo el año), así que convertir con un desfase fijo es exacto.

export const TIME_ZONE = "America/Bogota";
const OFFSET = "-05:00";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Día en Bogotá ("2026-10-20") de un instante. */
export function dayKey(date: Date): string {
  const local = new Date(date.getTime() - 5 * 3600_000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/** Instante de un día y una hora (en minutos desde la medianoche) de Bogotá. */
export function atBogota(day: string, minutes: number): Date {
  return new Date(`${day}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00${OFFSET}`);
}

/** Minutos desde la medianoche de Bogotá. */
export function minutesOfDay(date: Date): number {
  const local = new Date(date.getTime() - 5 * 3600_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

export function isDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dayKey(atBogota(value, 12 * 60)) === value;
}

export function addDays(day: string, n: number): string {
  return dayKey(new Date(atBogota(day, 12 * 60).getTime() + n * 86_400_000));
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/** "martes 20 de octubre" */
export function formatDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
}

export function shortWeekday(day: string): string {
  return WEEKDAYS[weekdayOf(day)].slice(0, 3);
}

/** "10:30" en 24 h: en una lista de turnos se leen mejor que con a. m./p. m. */
export function formatTime(date: Date): string {
  const m = minutesOfDay(date);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "08:00" → 480 */
export function parseClock(value: string): number | null {
  const m = /^([01]?\d|2[0-4]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes <= 1440 ? minutes : null;
}

export function formatClock(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
