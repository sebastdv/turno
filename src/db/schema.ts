import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    /** Siempre en minúsculas. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    /** scrypt$N$r$p$sal$hash, ver lib/passwords.ts. */
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["cliente", "admin"] }).notNull().default("cliente"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email), check("users_role_check", sql`${t.role} in ('cliente', 'admin')`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 del token de la cookie: con la base filtrada no se puede suplantar a nadie. */
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Intentos fallidos de inicio de sesión por correo, en ventanas de 15 minutos. */
export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

export const services = pgTable(
  "services",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    durationMin: integer("duration_min").notNull(),
    priceCop: integer("price_cop").notNull(),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    check("services_duration_check", sql`${t.durationMin} between 10 and 240 and ${t.durationMin} % 5 = 0`),
    check("services_price_check", sql`${t.priceCop} >= 0`),
  ],
);

export const barbers = pgTable("barbers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  bio: text("bio").notNull().default(""),
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
});

/** Horario semanal: un barbero puede tener varios tramos por día (antes y después del almuerzo). */
export const workingHours = pgTable(
  "working_hours",
  {
    id: serial("id").primaryKey(),
    barberId: integer("barber_id")
      .notNull()
      .references(() => barbers.id, { onDelete: "cascade" }),
    /** 0 = domingo … 6 = sábado. */
    weekday: smallint("weekday").notNull(),
    /** Minutos desde la medianoche, hora de Bogotá. */
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
  },
  (t) => [
    index("working_hours_barber_idx").on(t.barberId, t.weekday),
    check("working_hours_range_check", sql`${t.weekday} between 0 and 6 and ${t.startMin} >= 0 and ${t.endMin} <= 1440 and ${t.startMin} < ${t.endMin}`),
  ],
);

/** Bloqueos puntuales: vacaciones, citas médicas, un día cerrado. */
export const timeOff = pgTable(
  "time_off",
  {
    id: serial("id").primaryKey(),
    barberId: integer("barber_id")
      .notNull()
      .references(() => barbers.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull().default(""),
  },
  (t) => [index("time_off_barber_idx").on(t.barberId, t.startsAt), check("time_off_range_check", sql`${t.startsAt} < ${t.endsAt}`)],
);

export const BOOKING_STATUSES = ["pendiente_pago", "confirmada", "cancelada", "expirada", "atendida", "no_asistio"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    /** Código público del turno (en la URL y en el ticket). */
    code: text("code").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    barberId: integer("barber_id")
      .notNull()
      .references(() => barbers.id),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: BOOKING_STATUSES }).notNull().default("pendiente_pago"),
    /** Precio y abono al momento de reservar: si cambian después, el turno conserva los suyos. */
    priceCop: integer("price_cop").notNull(),
    depositCop: integer("deposit_cop").notNull(),
    /** Hasta cuándo se guarda el horario mientras se paga el abono. */
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    refundStatus: text("refund_status", { enum: ["pendiente", "hecho"] }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("bookings_code_key").on(t.code),
    index("bookings_user_idx").on(t.userId, t.startsAt),
    index("bookings_barber_day_idx").on(t.barberId, t.startsAt),
    check("bookings_range_check", sql`${t.startsAt} < ${t.endsAt}`),
    check(
      "bookings_status_check",
      sql`${t.status} in ('pendiente_pago', 'confirmada', 'cancelada', 'expirada', 'atendida', 'no_asistio')`,
    ),
    // La restricción de exclusión que impide dos turnos cruzados del mismo
    // barbero está en drizzle/0001_sin_cruces.sql (Drizzle no la modela).
  ],
);

export const PAYMENT_STATUSES = ["PENDING", "APPROVED", "DECLINED", "VOIDED", "ERROR"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    /** Referencia enviada a la pasarela; única por intento de pago. */
    reference: text("reference").notNull(),
    provider: text("provider", { enum: ["wompi", "simulado"] }).notNull(),
    amountCop: integer("amount_cop").notNull(),
    status: text("status", { enum: PAYMENT_STATUSES }).notNull().default("PENDING"),
    transactionId: text("transaction_id"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payments_reference_key").on(t.reference), index("payments_booking_idx").on(t.bookingId)],
);

/** Cada evento de la pasarela que se aceptó, para auditoría y para no procesar dos veces el mismo. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    provider: text("provider").notNull(),
    transactionId: text("transaction_id").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payment_events_tx_status_key").on(t.provider, t.transactionId, t.status)],
);
