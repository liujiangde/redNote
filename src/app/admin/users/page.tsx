import { getAdminUsers } from "@/lib/content-data";

export default async function AdminUsersPage() {
  const users = await getAdminUsers();

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">用户管理</h1>
        <p className="mt-1 text-sm text-slate-500">账号角色、内容贡献和风控状态。</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {users.map((user) => (
          <article className="rounded-lg border border-slate-200 bg-white p-4" key={user.handle}>
            <p className="font-semibold text-slate-950">{user.name}</p>
            <p className="mt-1 text-sm text-slate-500">@{user.handle}</p>
            <div className="mt-4 flex gap-2 text-xs">
              <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                ACTIVE
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                {user.role}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
              <span>{user.noteCount} 笔记</span>
              <span>{user.followerCount} 粉丝</span>
              <span>{user.followingCount} 关注</span>
              <span>{user.reportCount} 举报</span>
            </div>
          </article>
        ))}
        {!users.length && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 lg:col-span-3">
            暂无用户数据。
          </div>
        )}
      </div>
    </section>
  );
}
