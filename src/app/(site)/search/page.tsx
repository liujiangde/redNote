import Link from "next/link";
import { Clock3, Flame, Layers3, Lightbulb, Search } from "lucide-react";

import { NoteCard } from "@/components/note-card";
import { getCurrentSession } from "@/lib/auth-boundary";
import { getSearchDiscovery, recordSearchQuery, searchPublishedNotes } from "@/lib/content-data";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  // 搜索页只传递用户输入的关键词；关键词匹配、公开内容过滤和 fixture fallback
  // 都由 searchPublishedNotes 处理，便于后续替换为全文搜索或 pgvector 召回。
  const session = await getCurrentSession();
  await recordSearchQuery(q, session?.user.id);
  const [notes, discovery] = await Promise.all([
    searchPublishedNotes(q, {
      viewerId: session?.user.id,
    }),
    getSearchDiscovery({
      query: q,
      viewerId: session?.user.id,
    }),
  ]);

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-teal-50 text-teal-700">
            <Search className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-slate-950">AI 混合搜索</h1>
            <p className="mt-1 text-sm text-slate-500">
              当前查询：{q ? `“${q}”` : "周末一个人放松的地方"}
            </p>
          </div>
          <form action="/search" className="flex w-full gap-2 md:max-w-md">
            <input
              className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
              defaultValue={q}
              name="q"
              placeholder="搜索咖啡、路线、轻食"
            />
            <button
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700"
              type="submit"
            >
              搜索
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {q && discovery.categories.length ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {discovery.categories.map((category) => (
                <div
                  className="rounded-lg border border-slate-200 bg-white p-4"
                  key={category.type}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Layers3 className="h-4 w-4 text-teal-600" />
                    {category.label}
                  </div>
                  <strong className="mt-2 block text-2xl text-slate-950">
                    {category.count}
                  </strong>
                  {category.samples.length ? (
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                      {category.samples.join(" / ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {notes.length ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {notes.map((note) => (
                <div key={note.id} className="space-y-2">
                  <NoteCard note={note} />
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    {note.matchReasons.map((reason) => (
                      <span
                        key={reason}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              没有找到匹配的已发布笔记。
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-600" />
              <h2 className="text-base font-semibold text-slate-950">搜索建议</h2>
            </div>
            <div className="mt-4 space-y-2">
              {discovery.suggestions.length ? (
                discovery.suggestions.map((item) => (
                  <Link
                    className="block rounded-lg border border-slate-100 px-3 py-2 transition hover:border-rose-200 hover:bg-rose-50"
                    href={item.href}
                    key={`${item.type}:${item.label}`}
                  >
                    <span className="block text-sm font-medium text-slate-800">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {item.description}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-slate-500">输入关键词后显示匹配建议。</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-rose-600" />
              <h2 className="text-base font-semibold text-slate-950">热搜</h2>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {discovery.hotSearches.map((item) => (
                <Link
                  className="rounded-full bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                  href={item.href}
                  key={`${item.source}:${item.label}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </section>

          {discovery.history.length ? (
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-slate-500" />
                <h2 className="text-base font-semibold text-slate-950">历史搜索</h2>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {discovery.history.map((item) => (
                  <Link
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                    href={item.href}
                    key={item.label}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
