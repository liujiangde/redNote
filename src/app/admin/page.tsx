import { MetricCard } from "@/components/metric-card";
import { adminMetrics, moderationQueue, topicTrends } from "@/lib/mock-data";

export default function AdminDashboardPage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">数据看板</h1>
        <p className="mt-1 text-sm text-slate-500">用户增长、内容生产和治理状态总览。</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {adminMetrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-950">举报处理队列</h2>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">对象</th>
                  <th className="px-4 py-3 font-medium">原因</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {moderationQueue.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">{item.target}</td>
                    <td className="px-4 py-3 text-slate-600">{item.reason}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-950">热门标签</h2>
          <div className="mt-4 space-y-4">
            {topicTrends.map((topic) => (
              <div key={topic.name}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-800">#{topic.name}</span>
                  <span className="text-slate-500">{topic.growth}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-500"
                    style={{ width: `${Math.min(topic.heat / 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

