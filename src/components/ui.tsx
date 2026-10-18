import Link from "next/link";

const base = "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";
const variants = {
  primary: "bg-signal text-on-signal hover:brightness-95",
  secondary: "border border-line bg-surface text-ink hover:border-ink",
  danger: "border border-danger/40 bg-surface text-danger hover:bg-danger-soft",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; error?: string; hint?: string }) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-ink focus:ring-2 focus:ring-signal/30 aria-invalid:border-danger"
        {...props}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "ok" | "warn"; children: React.ReactNode }) {
  const styles = { danger: "bg-danger-soft text-danger", ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn" }[tone];
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={`rounded-md px-4 py-3 text-sm font-medium ${styles}`}>
      {children}
    </p>
  );
}
