import Link from "next/link";

import { ReportModerationActions } from "@/app/admin/reports/report-moderation-actions";
import { Button } from "@/components/ui/button";
import { getAdminReports } from "@/lib/content-data";
import { markCommentReportsReviewing } from "@/lib/moderation-actions";

export default async function AdminReportsPage() {
  // 举报管理页先展示处理队列，后续详情页会承载状态流转、处理记录和申诉信息。
  const reports = await getAdminReports();
  const reviewableCommentReportIds = reports
    .filter(
      (item) =>
        item.targetType === "COMMENT" &&
        item.commentId &&
        item.status !== "RESOLVED" &&
        item.status !== "REJECTED",
    )
    .map((item) => item.id);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">举报管理</h1>
          <p className="mt-1 text-sm text-slate-500">处理内容、评论和用户举报。</p>
        </div>
        {reviewableCommentReportIds.length > 0 && (
          <form action={markCommentReportsReviewing}>
            {reviewableCommentReportIds.map((reportId) => (
              <input key={reportId} name="reportId" type="hidden" value={reportId} />
            ))}
            <Button type="submit" variant="secondary">
              批量开始处理
            </Button>
          </form>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {reports.map((item) => {
          const canModerateComment = Boolean(
            item.targetType === "COMMENT" &&
              item.commentId &&
              item.status !== "RESOLVED" &&
              item.status !== "REJECTED",
          );

          return (
            <article className="rounded-lg border border-slate-200 bg-white p-4" key={item.id}>
              <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                {item.status}
              </span>
              <h2 className="mt-4 font-semibold text-slate-950">{item.target}</h2>
              <p className="mt-2 text-sm text-slate-500">{item.reason}</p>
              {item.detail && <p className="mt-2 text-sm text-slate-500">{item.detail}</p>}
              {item.resolution && (
                <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
                  处理备注：{item.resolution}
                </p>
              )}
              <div className="mt-4 space-y-1 text-xs text-slate-500">
                <p>类型：{item.targetType}</p>
                <p>举报人：{item.reporterName}</p>
                <p>时间：{item.createdAt}</p>
              </div>
              <div className="mt-4 grid gap-2">
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                  href={`/admin/reports/${item.id}`}
                >
                  查看详情
                </Link>
                <ReportModerationActions canModerateComment={canModerateComment} reportId={item.id} />
              </div>
            </article>
          );
        })}
        {!reports.length && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 lg:col-span-3">
            当前没有举报数据。
          </div>
        )}
      </div>
    </section>
  );
}
