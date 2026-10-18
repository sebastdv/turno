import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="tabular font-display text-8xl font-extrabold">404</p>
      <h1 className="mt-2 text-xl font-semibold">Esta página no existe.</h1>
      <p className="mt-2 text-muted">Puede que el enlace esté mal escrito o que el turno no sea de tu cuenta.</p>
      <ButtonLink href="/reservar" className="mt-6">
        Reservar un turno
      </ButtonLink>
    </main>
  );
}
