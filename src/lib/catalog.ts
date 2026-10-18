import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { barbers, services } from "@/db/schema";

export function activeServices(db: Db) {
  return db.select().from(services).where(eq(services.active, true)).orderBy(asc(services.sort), asc(services.id));
}

export function activeBarbers(db: Db) {
  return db.select().from(barbers).where(eq(barbers.active, true)).orderBy(asc(barbers.sort), asc(barbers.id));
}
