import "@fontsource-variable/big-shoulders-display";
import "@fontsource-variable/figtree";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth/current";
import { logout } from "./cuenta/acciones";

export const metadata: Metadata = {
  title: { default: "Filo Barbería · reserva tu turno", template: "%s · Filo Barbería" },
  description: "Reserva tu turno en Filo Barbería: elige servicio, barbero y hora, y paga un abono que se descuenta del servicio.",
};

export const viewport: Viewport = {
  themeColor: "#0f3b30",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="es">
      <body className="flex min-h-dvh flex-col">
        <header className="bg-brand text-on-brand">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-display text-3xl leading-none font-extrabold tracking-wide uppercase">Filo</span>
              <span className="text-sm text-on-brand-muted">barbería</span>
            </Link>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-medium">
              <Link href="/reservar" className="hover:underline">
                Reservar
              </Link>
              {user ? (
                <>
                  <Link href="/mis-turnos" className="hover:underline">
                    Mis turnos
                  </Link>
                  {user.role === "admin" && (
                    <Link href="/admin" className="hover:underline">
                      Panel
                    </Link>
                  )}
                  <form action={logout}>
                    <button className="text-on-brand-muted hover:text-on-brand hover:underline">Salir</button>
                  </form>
                </>
              ) : (
                <Link href="/entrar" className="hover:underline">
                  Entrar
                </Link>
              )}
            </div>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-2 px-4 py-6 text-sm text-muted sm:px-6">
            <p>Filo Barbería es una barbería ficticia: este sitio es un proyecto de portafolio.</p>
            <p>
              <a href="https://github.com/sebastdv/turno" className="underline underline-offset-2 hover:text-ink">
                Código en GitHub
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
