import { Button } from "@/components/ui/button";
import {
  hideReportedComment,
  markCommentReportReviewing,
  rejectCommentReport,
} from "@/lib/moderation-actions";

export function ReportModerationActions({
  canModerateComment,
  reportId,
}: {
  canModerateComment: boolean;
  reportId: string;
}) {
  if (!canModerateComment) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <form action={markCommentReportReviewing.bind(null, reportId)}>
        <Button className="w-full" type="submit" variant="secondary">
          开始处理
        </Button>
      </form>
      <form action={hideReportedComment.bind(null, reportId)}>
        <input name="resolution" type="hidden" value="评论已隐藏，举报已处理。" />
        <Button className="w-full" type="submit">
          隐藏评论并解决
        </Button>
      </form>
      <form action={rejectCommentReport.bind(null, reportId)}>
        <input name="resolution" type="hidden" value="暂未发现违规，举报已驳回。" />
        <Button className="w-full" type="submit" variant="ghost">
          驳回举报
        </Button>
      </form>
    </div>
  );
}
