import { moderationQueue } from "@/lib/mock-data";

export default function AdminReportsPage() {
  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">举报管理</h1>
        <p className="mt-1 text-sm text-slate-500">处理内容、评论和用户举报。</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {moderationQueue.map((item) => (
          <article className="rounded-lg border border-slate-200 bg-white p-4" key={item.id}>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
              {item.status}
            </span>
            <h2 className="mt-4 font-semibold text-slate-950">{item.target}</h2>
            <p className="mt-2 text-sm text-slate-500">{item.reason}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

