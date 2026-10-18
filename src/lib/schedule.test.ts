import { describe, expect, it } from "vitest";
import { formatRanges, parseRanges } from "./schedule";

describe("parseRanges", () => {
  it("lee varios tramos en cualquier orden y los ordena", () => {
    expect(parseRanges("14:00-19:00, 9:00 - 13:00")).toEqual({
      ranges: [
        { startMin: 540, endMin: 780 },
        { startMin: 840, endMin: 1140 },
      ],
    });
    expect(parseRanges("   ")).toEqual({ ranges: [] });
  });

  it("explica qué está mal", () => {
    expect(parseRanges("9-13")).toEqual({ error: '"9-13" no es un tramo válido. Usa el formato 09:00-13:00.' });
    expect(parseRanges("13:00-09:00")).toMatchObject({ error: expect.stringContaining("posterior") });
    expect(parseRanges("09:00-13:00, 12:00-15:00")).toEqual({ error: "Hay tramos que se cruzan." });
  });

  it("formatea de vuelta", () => {
    expect(formatRanges([{ startMin: 840, endMin: 1140 }, { startMin: 540, endMin: 780 }])).toBe("09:00-13:00, 14:00-19:00");
  });
});
