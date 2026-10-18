import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/admin", label: "Agenda" },
  { href: "/admin/turnos", label: "Turnos y reembolsos" },
  { href: "/admin/servicios", label: "Servicios" },
  { href: "/admin/barberos", label: "Barberos" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <nav aria-label="Panel" className="border-b border-line bg-surface">
        <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="block border-b-2 border-transparent px-3 py-3 text-sm font-medium whitespace-nowrap text-muted hover:border-line hover:text-ink">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  );
}
