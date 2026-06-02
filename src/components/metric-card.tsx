export function MetricCard({
  label,
  value,
  delta,
}: Readonly<{
  label: string;
  value: string;
  delta: string;
}>) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <div className="mt-3 flex items-end justify-between">
        <strong className="text-2xl font-semibold text-slate-950">{value}</strong>
        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
          {delta}
        </span>
      </div>
    </section>
  );
}

