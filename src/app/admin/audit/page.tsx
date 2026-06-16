import Link from "next/link";

import { getAdminAuditLogs, type AdminAuditLogRow } from "@/lib/content-data";

function getEntityHref(log: AdminAuditLogRow) {
  if (log.entityType === "REPORT") {
    return `/admin/reports/${log.entityId}`;
  }

  return null;
}

export default async function AdminAuditPage() {
  const logs = await getAdminAuditLogs();

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">审计日志</h1>
        <p className="mt-1 text-sm text-slate-500">追踪后台治理动作、操作人和目标实体。</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">动作</th>
              <th className="px-4 py-3 font-medium">实体</th>
              <th className="px-4 py-3 font-medium">操作人</th>
              <th className="px-4 py-3 font-medium">时间</th>
              <th className="px-4 py-3 font-medium">元数据</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => {
              const href = getEntityHref(log);

              return (
                <tr key={log.id}>
                  <td className="px-4 py-3 font-semibold text-slate-800">{log.action}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div className="space-y-1">
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        {log.entityType}
                      </span>
                      <p className="font-mono text-xs text-slate-500">{log.entityId}</p>
                      {href && (
                        <Link className="text-xs font-semibold text-rose-600 hover:text-rose-700" href={href}>
                          打开详情
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{log.actorName}</p>
                    <p className="text-xs text-slate-400">@{log.actorHandle}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{log.createdAt}</td>
                  <td className="max-w-md px-4 py-3">
                    {log.metadata ? (
                      <pre className="max-h-32 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                        {log.metadata}
                      </pre>
                    ) : (
                      <span className="text-slate-400">无</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!logs.length && (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                  暂无审计日志。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
