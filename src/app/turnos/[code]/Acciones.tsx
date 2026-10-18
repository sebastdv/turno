"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { cancelarTurno, pagarAbono, type ActionState } from "../acciones";

export function PagarAbono({ code, label }: { code: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState>(pagarAbono.bind(null, code), null);
  return (
    <form action={action} className="space-y-2">
      {state?.error && <Alert>{state.error}</Alert>}
      <Button type="submit" disabled={pending} className="w-full py-3 text-base">
        {pending ? "Abriendo el pago…" : label}
      </Button>
    </form>
  );
}

export function Cancelar({ code, terms }: { code: string; terms: string }) {
  const [state, action, pending] = useActionState<ActionState>(cancelarTurno.bind(null, code), null);
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Cancelar turno
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-lg border border-danger/40 p-4">
      <p className="text-sm">{terms}</p>
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Cancelando…" : "Sí, cancelar"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
          No, mantener el turno
        </Button>
      </div>
    </form>
  );
}

/** Al volver del pago, el webhook puede tardar unos segundos: se recarga sola un rato. */
export function EsperarPago() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      if (++n > 20) clearInterval(id);
      router.refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [router]);
  return <p className="text-sm text-muted">Esperando la confirmación del pago…</p>;
}
