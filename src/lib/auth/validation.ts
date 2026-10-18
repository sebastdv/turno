import { z } from "zod";

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Escribe un correo válido." }));

/** Celular colombiano: 10 dígitos que empiezan por 3 (se aceptan espacios y +57). */
export const phone = z
  .string()
  .transform((v) => v.replace(/[\s()-]/g, "").replace(/^\+?57(?=3\d{9}$)/, ""))
  .pipe(z.string().regex(/^3\d{9}$/, { error: "Escribe un celular de 10 dígitos, por ejemplo 300 123 4567." }));

export const password = z
  .string()
  .min(10, { error: "La contraseña debe tener al menos 10 caracteres." })
  .max(200, { error: "La contraseña es demasiado larga." });

export const registerSchema = z.object({
  name: z.string().trim().min(2, { error: "Escribe tu nombre." }).max(60, { error: "El nombre es demasiado largo." }),
  email,
  phone,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: "Escribe tu contraseña." }),
});

/** Solo rutas internas: evita usar el login como redirección abierta. */
export function safeNext(value: unknown, fallback = "/mis-turnos"): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : fallback;
}
