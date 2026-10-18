"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import type { AdminState } from "./acciones";

/**
 * Formulario del panel con su mensaje de resultado al lado del botón. Con
 * `confirm`, el primer clic pregunta antes de ejecutar (para acciones que no
 * se deshacen, como cancelar un turno).
 */
export function AdminForm({
  action,
  children,
  submit,
  confirm,
  variant = "primary",
  className = "",
}: {
  action: (state: AdminState, form: FormData) => Promise<AdminState>;
  children?: React.ReactNode;
  submit: string;
  confirm?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [asking, setAsking] = useState(false);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {confirm && !asking ? (
          <Button type="button" variant={variant} onClick={() => setAsking(true)}>
            {submit}
          </Button>
        ) : (
          <>
            {confirm && <span className="text-sm font-medium">{confirm}</span>}
            <Button type="submit" variant={variant} disabled={pending}>
              {pending ? "Guardando…" : confirm ? `Sí, ${submit.toLowerCase()}` : submit}
            </Button>
            {confirm && (
              <Button type="button" variant="secondary" onClick={() => setAsking(false)}>
                No
              </Button>
            )}
          </>
        )}
        {state?.error && (
          <span role="alert" className="text-sm font-medium text-danger">
            {state.error}
          </span>
        )}
        {state?.ok && (
          <span role="status" className="text-sm font-medium text-ok">
            {state.ok}
          </span>
        )}
      </div>
    </form>
  );
}
