import { describe, expect, it } from "vitest";
import { computeSlots } from "./slots";
import { addDays, atBogota, dayKey, formatDay, formatTime, isDayKey, minutesOfDay, parseClock, weekdayOf } from "./time";
import { depositFor, formatCop } from "./money";

const day = "2026-10-20"; // martes
const times = (dates: Date[]) => dates.map(formatTime);

describe("hora de Bogotá", () => {
  it("convierte entre día y hora local y el instante UTC", () => {
    expect(atBogota(day, 9 * 60 + 30).toISOString()).toBe("2026-10-20T14:30:00.000Z");
    expect(dayKey(new Date("2026-10-21T04:59:00Z"))).toBe("2026-10-20");
    expect(dayKey(new Date("2026-10-21T05:00:00Z"))).toBe("2026-10-21");
    expect(minutesOfDay(new Date("2026-10-20T14:30:00Z"))).toBe(570);
  });

  it("nombra días y valida fechas", () => {
    expect(weekdayOf(day)).toBe(2);
    expect(formatDay(day)).toBe("martes 20 de octubre");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-02-28")).toBe(true);
    expect(parseClock("9:05")).toBe(545);
    expect(parseClock("25:00")).toBeNull();
  });
});

describe("computeSlots", () => {
  const morning = new Date("2026-10-20T11:00:00Z"); // 06:00 en Bogotá

  it("ofrece inicios cada 15 minutos donde el servicio cabe completo", () => {
    const slots = computeSlots({ day, durationMin: 45, hours: [{ startMin: 540, endMin: 660 }], busy: [], now: morning });
    expect(times(slots)).toEqual(["09:00", "09:15", "09:30", "09:45", "10:00", "10:15"]);
  });

  it("respeta varios tramos y no cruza el almuerzo", () => {
    const slots = computeSlots({
      day,
      durationMin: 60,
      hours: [{ startMin: 840, endMin: 960 }, { startMin: 540, endMin: 720 }],
      busy: [],
      now: morning,
      stepMin: 30,
    });
    expect(times(slots)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00"]);
  });

  it("descarta los que se cruzan con turnos o bloqueos, pero no los pegados", () => {
    const busy = [{ start: atBogota(day, 600), end: atBogota(day, 630) }]; // 10:00-10:30
    const slots = computeSlots({ day, durationMin: 30, hours: [{ startMin: 540, endMin: 690 }], busy, now: morning });
    expect(times(slots)).toEqual(["09:00", "09:15", "09:30", "10:30", "10:45", "11:00"]);
  });

  it("exige una hora de anticipación", () => {
    const now = atBogota(day, 9 * 60 + 10);
    const slots = computeSlots({ day, durationMin: 30, hours: [{ startMin: 540, endMin: 660 }], busy: [], now });
    expect(times(slots)[0]).toBe("10:15");
  });

  it("alinea al paso aunque el tramo empiece en un minuto raro", () => {
    const slots = computeSlots({ day, durationMin: 30, hours: [{ startMin: 550, endMin: 630 }], busy: [], now: morning });
    expect(times(slots)).toEqual(["09:15", "09:30", "09:45", "10:00"]);
  });
});

describe("dinero", () => {
  it("formatea pesos sin decimales", () => {
    expect(formatCop(30000)).toBe("$ 30.000");
  });

  it("el abono no pasa del precio del servicio", () => {
    expect(depositFor(30000, 10000)).toBe(10000);
    expect(depositFor(8000, 10000)).toBe(8000);
    expect(depositFor(30000, 0)).toBe(0);
  });
});
