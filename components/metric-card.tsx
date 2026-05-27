import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  detail,
  icon
}: {
  label: string;
  value: string;
  detail: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink/65">{label}</p>
        {icon ? <span className="text-mint">{icon}</span> : null}
      </div>
      <p className="mt-3 text-3xl font-bold">{value}</p>
      <p className="mt-2 text-sm leading-5 text-ink/62">{detail}</p>
    </div>
  );
}
