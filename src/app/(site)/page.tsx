import { Sparkles, TrendingUp } from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { NoteCard } from "@/components/note-card";
import { adminMetrics, demoNotes, topicTrends } from "@/lib/mock-data";

export default function HomePage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="space-y-6">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-rose-700">
                <Sparkles className="h-4 w-4" />
                AI 推荐流
              </p>
              <h1 className="mt-2 text-2xl font-bold text-slate-950">
                发现今天值得收藏的生活灵感
              </h1>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-lg bg-rose-50 px-3 py-2">
                <strong className="block text-rose-700">0.35</strong>
                语义
              </div>
              <div className="rounded-lg bg-teal-50 px-3 py-2">
                <strong className="block text-teal-700">0.20</strong>
                标签
              </div>
              <div className="rounded-lg bg-amber-50 px-3 py-2">
                <strong className="block text-amber-700">0.45</strong>
                热度/新鲜度
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {demoNotes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      </section>
      <aside className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-teal-600" />
            <h2 className="text-base font-semibold text-slate-950">趋势话题</h2>
          </div>
          <div className="mt-4 space-y-3">
            {topicTrends.map((topic) => (
              <div className="flex items-center justify-between" key={topic.name}>
                <div>
                  <p className="font-medium text-slate-800">#{topic.name}</p>
                  <p className="text-xs text-slate-500">{topic.heat.toLocaleString()} 热度</p>
                </div>
                <span className="text-sm font-semibold text-emerald-700">
                  {topic.growth}
                </span>
              </div>
            ))}
          </div>
        </section>
        <div className="grid gap-4">
          {adminMetrics.slice(0, 2).map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </aside>
    </div>
  );
}

