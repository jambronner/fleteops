type StatusPillProps = {
  label: string;
  tone: "inTransit" | "pendingDocs" | "needsReview" | "ready" | "blocked";
};

const toneClasses: Record<StatusPillProps["tone"], string> = {
  inTransit: "border-blue-200 bg-blue-50 text-accent",
  pendingDocs: "border-orange-200 bg-orange-50 text-orange-700",
  needsReview: "border-amber-200 bg-amber-50 text-amber-700",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  blocked: "border-rose-200 bg-rose-50 text-rose-700",
};

export function StatusPill({ label, tone }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
