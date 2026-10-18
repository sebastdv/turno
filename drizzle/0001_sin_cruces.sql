-- Dos turnos activos del mismo barbero no pueden cruzarse en el tiempo.
-- Postgres lo garantiza aunque dos personas confirmen el mismo horario al
-- mismo tiempo: la segunda inserción falla con exclusion_violation (23P01).
-- btree_gist permite combinar la igualdad de barber_id con el cruce de rangos.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_sin_cruces"
  EXCLUDE USING gist ("barber_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" IN ('pendiente_pago', 'confirmada', 'atendida', 'no_asistio'));
