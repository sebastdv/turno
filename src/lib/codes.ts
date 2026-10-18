import { randomInt } from "node:crypto";

// Sin 0/O, 1/I/L: el código se dicta en la barbería y se lee en el celular.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function bookingCode(length = 6): string {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}
