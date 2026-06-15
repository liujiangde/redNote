import { NoteStatus } from "@/generated/prisma/client";

import { Button } from "@/components/ui/button";
import {
  archiveAdminNote,
  hideAdminNote,
  restoreAdminNote,
} from "@/lib/moderation-actions";

export function NoteModerationActions({ noteId, status }: { noteId: string; status: string }) {
  const canHide = status === NoteStatus.PUBLISHED;
  const canArchive = status === NoteStatus.PUBLISHED || status === NoteStatus.HIDDEN;
  const canRestore = status === NoteStatus.HIDDEN || status === NoteStatus.ARCHIVED;

  if (!canHide && !canArchive && !canRestore) {
    return <span className="text-xs text-slate-400">暂无动作</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canHide && (
        <form action={hideAdminNote.bind(null, noteId)}>
          <Button className="h-8 px-3 text-xs" type="submit" variant="secondary">
            隐藏
          </Button>
        </form>
      )}
      {canArchive && (
        <form action={archiveAdminNote.bind(null, noteId)}>
          <Button className="h-8 px-3 text-xs" type="submit" variant="ghost">
            归档
          </Button>
        </form>
      )}
      {canRestore && (
        <form action={restoreAdminNote.bind(null, noteId)}>
          <Button className="h-8 px-3 text-xs" type="submit">
            恢复
          </Button>
        </form>
      )}
    </div>
  );
}
