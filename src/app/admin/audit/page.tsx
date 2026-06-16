import Link from "next/link";

import { getAdminAuditLogs, type AdminAuditLogRow } from "@/lib/content-data";

const entityTypeFilters = [
  { href: "/admin/audit", label: "全部", value: undefined },
  { href: "/admin/audit?entityType=REPORT", label: "举报", value: "REPORT" },
  { href: "/admin/audit?entityType=NOTE", label: "笔记", value: "NOTE" },
  { href: "/admin/audit?entityType=USER", label: "用户", value: "USER" },
  { href: "/admin/audit?entityType=database", label: "系统", value: "database" },
];

function normalizeEntityType(value: string | string[] | undefined) {
  const entityType = Array.isArray(value) ? value[0] : value;

  if (entityTypeFilters.some((filter) => filter.value === entityType)) {
    return entityType;
  }

  return undefined;
}

function getEntityHref(log: AdminAuditLogRow) {
  if (log.entityType === "REPORT") {
    return `/admin/reports/${log.entityId}`;
  }

  return null;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string | string[] }>;
}) {
  const { entityType } = await searchParams;
  const selectedEntityType = normalizeEntityType(entityType);
  const logs = await getAdminAuditLogs({ entityType: selectedEntityType });

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">审计日志</h1>
          <p className="mt-1 text-sm text-slate-500">追踪后台治理动作、操作人和目标实体。</p>
        </div>
        <nav aria-label="审计实体筛选" className="flex flex-wrap gap-2">
          {entityTypeFilters.map((filter) => {
            const isActive = filter.value === selectedEntityType;

            return (
              <Link
                className={
                  isActive
                    ? "inline-flex h-9 items-center rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white"
                    : "inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                }
                href={filter.href}
                key={filter.label}
              >
                {filter.label}
              </Link>
            );
          })}
        </nav>
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
                  当前筛选下暂无审计日志。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
