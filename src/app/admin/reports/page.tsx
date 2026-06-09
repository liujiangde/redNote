import { getAdminReports } from "@/lib/content-data";
import {
  hideReportedComment,
  markCommentReportReviewing,
  rejectCommentReport,
} from "@/lib/moderation-actions";
import { Button } from "@/components/ui/button";

export default async function AdminReportsPage() {
  // 举报管理页先展示处理队列，后续详情页会承载状态流转、处理记录和申诉信息。
  const reports = await getAdminReports();

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">举报管理</h1>
        <p className="mt-1 text-sm text-slate-500">处理内容、评论和用户举报。</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {reports.map((item) => {
          const canModerateComment =
            item.targetType === "COMMENT" &&
            item.commentId &&
            item.status !== "RESOLVED" &&
            item.status !== "REJECTED";

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
              {canModerateComment && (
                <div className="mt-4 grid gap-2">
                  <form action={markCommentReportReviewing.bind(null, item.id)}>
                    <Button className="w-full" type="submit" variant="secondary">
                      开始处理
                    </Button>
                  </form>
                  <form action={hideReportedComment.bind(null, item.id)}>
                    <input name="resolution" type="hidden" value="评论已隐藏，举报已处理。" />
                    <Button className="w-full" type="submit">
                      隐藏评论并解决
                    </Button>
                  </form>
                  <form action={rejectCommentReport.bind(null, item.id)}>
                    <input name="resolution" type="hidden" value="暂未发现违规，举报已驳回。" />
                    <Button className="w-full" type="submit" variant="ghost">
                      驳回举报
                    </Button>
                  </form>
                </div>
              )}
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
