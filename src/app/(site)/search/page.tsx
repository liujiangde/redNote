import { Search } from "lucide-react";

import { NoteCard } from "@/components/note-card";
import { searchPublishedNotes } from "@/lib/content-data";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const notes = await searchPublishedNotes(q);

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-teal-50 text-teal-700">
            <Search className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-950">AI 混合搜索</h1>
            <p className="mt-1 text-sm text-slate-500">
              当前查询：{q ? `“${q}”` : "周末一个人放松的地方"}
            </p>
          </div>
        </div>
      </div>
      {notes.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          没有找到匹配的已发布笔记。
        </div>
      )}
    </section>
  );
}
