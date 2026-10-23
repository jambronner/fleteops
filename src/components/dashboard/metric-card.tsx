import Link from "next/link";

type MetricCardVariant = "default" | "warning" | "danger" | "success" | "accent";

type MetricCardProps = {
  label: string;
  value: string;
  variant?: MetricCardVariant;
  href?: string;
};

const variantStyles: Record<MetricCardVariant, { bar: string; value: string }> = {
  default: { bar: "from-accent to-muted", value: "text-ink" },
  warning: { bar: "from-amber-400 to-amber-500", value: "text-amber-700" },
  danger:  { bar: "from-rose-500 to-rose-600",   value: "text-rose-700" },
  success: { bar: "from-emerald-400 to-emerald-500", value: "text-emerald-700" },
  accent:  { bar: "from-muted to-ink", value: "text-ink" },
};

export function MetricCard({ label, value, variant = "default", href }: MetricCardProps) {
  const styles = variantStyles[variant];
  const inner = (
    <>
      <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${styles.bar}`} />
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted/60">
        {label}
      </p>
      <p className={`mt-2 font-display text-3xl font-bold tracking-tight tabular-nums ${styles.value}`}>
        {value}
      </p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group relative block overflow-hidden rounded-2xl border border-line bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-blue-100/60"
      >
        {inner}
      </Link>
    );
  }

  return (
    <article className="relative overflow-hidden rounded-2xl border border-line bg-card p-5 shadow-sm transition-shadow hover:shadow-md hover:shadow-blue-100/60">
      {inner}
    </article>
  );
}
