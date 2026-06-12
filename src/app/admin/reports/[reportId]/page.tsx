import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ReportModerationActions } from "@/app/admin/reports/report-moderation-actions";
import { getAdminReportDetail } from "@/lib/content-data";

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-700">{value}</dd>
    </div>
  );
}

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const report = await getAdminReportDetail(reportId);

  if (!report) {
    notFound();
  }

  const canModerateComment = Boolean(
    report.targetType === "COMMENT" &&
      report.commentId &&
      report.status !== "RESOLVED" &&
      report.status !== "REJECTED",
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link className="text-sm font-semibold text-rose-600 hover:text-rose-700" href="/admin/reports">
            返回举报列表
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-slate-950">举报详情</h1>
          <p className="mt-1 text-sm text-slate-500">举报 ID：{report.id}</p>
        </div>
        <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          {report.status}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <article className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">举报信息</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <DetailRow label="类型" value={report.targetType} />
            <DetailRow label="原因" value={report.reason} />
            <DetailRow label="举报人" value={`${report.reporterName} @${report.reporterHandle}`} />
            <DetailRow label="举报时间" value={report.createdAt} />
            <DetailRow label="更新时间" value={report.updatedAt} />
            <DetailRow label="联系邮箱" value={report.reporterEmail} />
          </dl>
          {report.detail && (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
              {report.detail}
            </p>
          )}
          {report.resolution && (
            <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm leading-6 text-emerald-700">
              处理备注：{report.resolution}
            </p>
          )}
        </article>

        <aside className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">处理动作</h2>
          <p className="mt-2 text-sm text-slate-500">
            当前基础版只支持评论举报处理，笔记和用户治理动作会在后续后台闭环中补齐。
          </p>
          <div className="mt-4">
            <ReportModerationActions
              canModerateComment={canModerateComment}
              reportId={report.id}
            />
            {!canModerateComment && (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">暂无可执行动作。</p>
            )}
          </div>
        </aside>
      </div>

      <article className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">目标内容</h2>
            <p className="mt-1 text-sm text-slate-500">{report.target}</p>
          </div>
          {report.targetHref && (
            <Link className="text-sm font-semibold text-rose-600 hover:text-rose-700" href={report.targetHref}>
              打开目标
            </Link>
          )}
        </div>

        {report.comment && (
          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <p>评论作者：{report.comment.authorName} @{report.comment.authorHandle}</p>
            <p>评论状态：{report.comment.status}</p>
            {report.comment.noteTitle && <p>所属笔记：{report.comment.noteTitle}</p>}
            <blockquote className="rounded-lg bg-slate-50 p-3 leading-6">{report.comment.content}</blockquote>
          </div>
        )}

        {report.note && (
          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <p>笔记作者：{report.note.authorName} @{report.note.authorHandle}</p>
            <p>笔记状态：{report.note.status}</p>
            <p className="rounded-lg bg-slate-50 p-3 leading-6">{report.note.content}</p>
          </div>
        )}

        {report.reportedUser && (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <DetailRow label="用户名" value={`${report.reportedUser.name} @${report.reportedUser.handle}`} />
            <DetailRow label="角色" value={report.reportedUser.role} />
            <DetailRow label="注册时间" value={report.reportedUser.createdAt} />
          </dl>
        )}
      </article>

      <article className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">处理历史</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {report.auditLogs.map((log) => (
            <div className="py-3" key={log.id}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-slate-800">{log.action}</p>
                <p className="text-xs text-slate-500">{log.createdAt}</p>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                操作人：{log.actorName} @{log.actorHandle}
              </p>
              {log.metadata && (
                <pre className="mt-2 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                  {log.metadata}
                </pre>
              )}
            </div>
          ))}
          {!report.auditLogs.length && (
            <p className="py-6 text-center text-sm text-slate-500">暂无处理记录。</p>
          )}
        </div>
      </article>
    </section>
  );
}
