"use client";

import { useActionState } from "react";
import { Alert, Button } from "@/components/ui";
import { reservar, type ReserveState } from "./acciones";

export function Confirmar({ fields, label }: { fields: Record<string, string>; label: string }) {
  const [state, action, pending] = useActionState<ReserveState, FormData>(reservar, null);
  return (
    <form action={action} className="space-y-3">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {state?.error && <Alert>{state.error}</Alert>}
      <Button type="submit" disabled={pending} className="w-full py-3 text-base">
        {pending ? "Apartando tu turno…" : label}
      </Button>
    </form>
  );
}
