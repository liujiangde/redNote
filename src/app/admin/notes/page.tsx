import { getAdminNotes } from "@/lib/content-data";

import { NoteModerationActions } from "./note-moderation-actions";

export default async function AdminNotesPage() {
  // 笔记管理页读取最近内容和推荐分，用于审核巡检；状态流转走 Server Action，
  // 并在服务层写入 AdminAuditLog。
  const notes = await getAdminNotes();

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">笔记管理</h1>
        <p className="mt-1 text-sm text-slate-500">审核状态、推荐分和内容质量巡检。</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">标题</th>
              <th className="px-4 py-3 font-medium">作者</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">推荐分</th>
              <th className="px-4 py-3 font-medium">互动</th>
              <th className="px-4 py-3 font-medium">浏览</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {notes.map((note) => (
              <tr key={note.id}>
                <td className="px-4 py-3 font-semibold text-slate-800">{note.title}</td>
                <td className="px-4 py-3 text-slate-600">{note.authorName}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    {note.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-teal-700">{note.score}</td>
                <td className="px-4 py-3 text-slate-600">{note.interactions}</td>
                <td className="px-4 py-3 text-slate-600">{note.views}</td>
                <td className="px-4 py-3">
                  <NoteModerationActions noteId={note.id} status={note.status} />
                </td>
              </tr>
            ))}
            {!notes.length && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                  暂无笔记数据。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
