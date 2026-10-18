"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { login, register, type FormState } from "./acciones";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state?.error && <Alert>{state.error}</Alert>}
      <Field label="Correo" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} error={state?.errors?.email} />
      <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required error={state?.errors?.password} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
      <p className="text-center text-sm text-muted">
        ¿Primera vez?{" "}
        <Link href={`/registro?siguiente=${encodeURIComponent(next)}`} className="font-medium text-ink underline underline-offset-2">
          Crea tu cuenta
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(register, null);
  const v = state?.values;
  const e = state?.errors;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state?.error && <Alert>{state.error}</Alert>}
      <Field label="Nombre" name="name" autoComplete="name" required defaultValue={v?.name} error={e?.name} />
      <Field label="Correo" name="email" type="email" autoComplete="email" required defaultValue={v?.email} error={e?.email} />
      <Field
        label="Celular"
        name="phone"
        type="tel"
        autoComplete="tel-national"
        inputMode="tel"
        required
        defaultValue={v?.phone}
        error={e?.phone}
        hint="Por si hay que avisarte de un cambio en tu turno."
      />
      <Field label="Contraseña" name="password" type="password" autoComplete="new-password" required minLength={10} error={e?.password} hint="Mínimo 10 caracteres." />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creando tu cuenta…" : "Crear cuenta"}
      </Button>
      <p className="text-center text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href={`/entrar?siguiente=${encodeURIComponent(next)}`} className="font-medium text-ink underline underline-offset-2">
          Entra
        </Link>
      </p>
    </form>
  );
}
