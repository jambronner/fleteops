type StatBarTone = "default" | "accent" | "warning" | "success" | "danger";

type StatBarItem = {
  label: string;
  value: number | string;
  tone?: StatBarTone;
  href?: string;
};

const toneStyles: Record<StatBarTone, string> = {
  default: "text-ink",
  accent: "text-accent",
  warning: "text-amber-700",
  success: "text-emerald-700",
  danger: "text-rose-700",
};

export function StatBar({ items }: { items: StatBarItem[] }) {
  return (
    <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm shadow-sm sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-x-6">
      {items.map((item) => (
        <span className="inline-flex min-w-0 items-baseline gap-2" key={item.label}>
          <span className={`font-semibold tabular-nums ${toneStyles[item.tone ?? "default"]}`}>
            {item.value}
          </span>
          <span className="min-w-0 text-xs leading-tight text-muted/70">{item.label}</span>
        </span>
      ))}
    </div>
  );
}
