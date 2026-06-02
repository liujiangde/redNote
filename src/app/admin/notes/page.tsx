import { demoNotes } from "@/lib/mock-data";

export default function AdminNotesPage() {
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
              <th className="px-4 py-3 font-medium">推荐分</th>
              <th className="px-4 py-3 font-medium">互动</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {demoNotes.map((note) => (
              <tr key={note.id}>
                <td className="px-4 py-3 font-semibold text-slate-800">{note.title}</td>
                <td className="px-4 py-3 text-slate-600">{note.author.name}</td>
                <td className="px-4 py-3 text-teal-700">{note.score}</td>
                <td className="px-4 py-3 text-slate-600">
                  {note.likes + note.favorites + note.comments}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
