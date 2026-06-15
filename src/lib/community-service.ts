import { z } from "zod";

import {
  CommentStatus,
  NoteStatus,
  NotificationType,
  ReportStatus,
  ReportTargetType,
  UserRole,
  UserStatus,
} from "@/generated/prisma/client";
import { findSensitiveCommentTerms } from "@/lib/content-safety";
import { db } from "@/lib/db";
import { enforceInteractionGuard } from "@/lib/interaction-guard";

// 社区互动服务层是 Web Server Action 和移动端 /api/v1 的共同业务入口：
// 1. 这里只处理“业务是否允许”和“数据库怎么写”。
// 2. 不做 redirect/revalidate，这些属于页面层职责。
// 3. 所有失败都返回统一的 CommunityServiceResult，方便 API 转成 HTTP 错误。
export const commentSchema = z.object({
  content: z.string().trim().min(1).max(1000),
});

export const commentReportSchema = z.object({
  reason: z.string().trim().min(2).max(120),
  detail: z.string().trim().max(1000).optional(),
});

export type CommunityActor = {
  handle: string;
  id: string;
  name?: string | null;
  role?: string | null;
};

export type PublishedNoteTarget = {
  author: {
    handle: string;
    name: string;
  };
  authorId: string;
  id: string;
  slug: string;
  title: string;
};

type ServiceErrorCode = "FORBIDDEN" | "NOT_FOUND" | "RATE_LIMITED" | "VALIDATION_ERROR";

export type CommunityServiceError = {
  code: ServiceErrorCode;
  details?: unknown;
  message: string;
};

export type CommunityServiceResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: CommunityServiceError;
      ok: false;
    };

// 服务层不直接抛可预期业务错误，而是返回 code/message。
// 这样 Web 表单可以静默处理重复提交，移动端 API 可以返回明确状态码。
function communityError(
  code: ServiceErrorCode,
  message: string,
  details?: unknown,
): CommunityServiceResult<never> {
  return {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
    ok: false,
  };
}

function actorDisplayName(actor: CommunityActor) {
  // NextAuth 的 name 可能为空；通知文案统一回退到 handle，避免移动端看到 undefined。
  return actor.name?.trim() || actor.handle;
}

function canModerate(actor: CommunityActor) {
  return actor.role === "ADMIN" || actor.role === "SUPER_ADMIN";
}

function canManageRoles(actor: CommunityActor) {
  return actor.role === "SUPER_ADMIN";
}

async function getUserBlockState(actorId: string, targetUserId: string) {
  if (actorId === targetUserId) {
    return null;
  }

  // 屏蔽关系是双向安全边界：你屏蔽了对方，或对方屏蔽了你，都不能继续关注或互动。
  return db.userBlock.findFirst({
    where: {
      OR: [
        {
          blockedId: targetUserId,
          blockerId: actorId,
        },
        {
          blockedId: actorId,
          blockerId: targetUserId,
        },
      ],
    },
    select: {
      blockedId: true,
      blockerId: true,
    },
  });
}

async function ensureCanInteractWithUser(actorId: string, targetUserId: string) {
  // 互动前统一检查屏蔽边界，避免点赞、收藏、评论、关注各自漏判断。
  const block = await getUserBlockState(actorId, targetUserId);

  if (!block) {
    return null;
  }

  return communityError("FORBIDDEN", "This interaction is not available for blocked users.");
}

export async function getPublishedNoteTarget(noteIdOrSlug: string) {
  // 互动只允许落在已发布笔记上。客户端可以传 id 或 slug，但不能绕过草稿状态。
  return db.note.findFirst({
    where: {
      OR: [{ id: noteIdOrSlug }, { slug: noteIdOrSlug }],
      status: NoteStatus.PUBLISHED,
    },
    select: {
      author: {
        select: {
          handle: true,
          name: true,
        },
      },
      authorId: true,
      id: true,
      slug: true,
      title: true,
    },
  });
}

async function getReplyParentComment({
  noteId,
  parentId,
}: {
  noteId: string;
  parentId: string;
}) {
  // 当前评论区只开放两层结构。回复前必须确认 parentId 属于当前笔记且本身是一级评论，
  // 防止客户端构造跨笔记回复或继续嵌套更深层级。
  return db.comment.findFirst({
    where: {
      id: parentId,
      noteId,
      parentId: null,
      status: CommentStatus.VISIBLE,
    },
    select: {
      authorId: true,
      id: true,
    },
  });
}

async function getVisibleCommentTarget(commentId: string) {
  // 评论治理只对公开可见评论开放。隐藏/删除后的评论不再允许普通用户删除或举报。
  return db.comment.findFirst({
    where: {
      id: commentId,
      status: CommentStatus.VISIBLE,
      note: {
        status: NoteStatus.PUBLISHED,
      },
    },
    select: {
      authorId: true,
      content: true,
      id: true,
      noteId: true,
      parentId: true,
      author: {
        select: {
          handle: true,
          name: true,
        },
      },
      note: {
        select: {
          author: {
            select: {
              handle: true,
              name: true,
            },
          },
          authorId: true,
          id: true,
          slug: true,
          title: true,
        },
      },
    },
  });
}

type VisibleCommentTarget = NonNullable<Awaited<ReturnType<typeof getVisibleCommentTarget>>>;

function noteTargetFromComment(comment: VisibleCommentTarget): PublishedNoteTarget {
  // 评论删除/举报/审核后都需要刷新对应笔记详情页，因此把 comment.note 压成统一笔记目标。
  return {
    author: comment.note.author,
    authorId: comment.note.authorId,
    id: comment.note.id,
    slug: comment.note.slug,
    title: comment.note.title,
  };
}

async function updateCommentThreadStatus({
  comment,
  moderationReason,
  status,
}: {
  comment: VisibleCommentTarget;
  moderationReason?: string;
  status: CommentStatus;
}) {
  const timestamp = new Date();

  // 当前只支持两层评论。隐藏/删除一级评论时同步处理其回复，避免回复脱离上下文。
  const targetWhere = comment.parentId
    ? {
        id: comment.id,
      }
    : {
        OR: [{ id: comment.id }, { parentId: comment.id }],
      };

  await db.comment.updateMany({
    where: {
      ...targetWhere,
      status: CommentStatus.VISIBLE,
    },
    data: {
      status,
      ...(status === CommentStatus.DELETED ? { deletedAt: timestamp } : {}),
      ...(status === CommentStatus.HIDDEN ? { hiddenAt: timestamp } : {}),
      ...(moderationReason ? { moderationReason } : {}),
    },
  });
}

async function createNotificationIfNeeded({
  actorId,
  body,
  href,
  recipientId,
  title,
  type,
}: {
  actorId: string;
  body?: string;
  href: string;
  recipientId: string;
  title: string;
  type: NotificationType;
}) {
  if (recipientId === actorId) {
    // 用户操作自己的内容不生成通知，避免通知中心出现“你评论了自己”的噪声。
    return;
  }

  await db.notification.create({
    data: {
      actorId,
      body,
      href,
      recipientId,
      title,
      type,
    },
  });
}

export async function toggleNoteLike({
  actor,
  noteIdOrSlug,
}: {
  actor: CommunityActor;
  noteIdOrSlug: string;
}): Promise<
  CommunityServiceResult<{
    likeCount: number;
    liked: boolean;
    note: PublishedNoteTarget;
  }>
> {
  // 点赞完整流程：
  // 查公开笔记 -> 检查屏蔽关系 -> 执行互动风控 -> 按复合主键 toggle -> 必要时通知作者。
  const note = await getPublishedNoteTarget(noteIdOrSlug);

  if (!note) {
    return communityError("NOT_FOUND", "Published note was not found.");
  }

  const blocked = await ensureCanInteractWithUser(actor.id, note.authorId);

  if (blocked) {
    return blocked;
  }

  // 点赞是 toggle 操作，快速重复提交会把状态翻回去；风控层按用户+笔记做短冷却。
  if (
    !(await enforceInteractionGuard({
      kind: "like",
      targetId: note.id,
      userId: actor.id,
    }))
  ) {
    return communityError("RATE_LIMITED", "Too many like requests. Please retry later.");
  }

  const likeKey = {
    userId_noteId: {
      noteId: note.id,
      userId: actor.id,
    },
  };

  const existingLike = await db.like.findUnique({
    where: likeKey,
    select: {
      noteId: true,
    },
  });

  const liked = !existingLike;

  if (existingLike) {
    await db.like.delete({
      where: likeKey,
    });
  } else {
    await db.like.create({
      data: {
        noteId: note.id,
        userId: actor.id,
      },
    });
    await createNotificationIfNeeded({
      actorId: actor.id,
      body: note.title,
      href: `/notes/${note.slug}`,
      recipientId: note.authorId,
      title: `${actorDisplayName(actor)} 点赞了你的笔记`,
      type: NotificationType.LIKE,
    });
  }

  const likeCount = await db.like.count({
    where: {
      noteId: note.id,
    },
  });

  return {
    data: {
      likeCount,
      liked,
      note,
    },
    ok: true,
  };
}

export async function toggleNoteFavorite({
  actor,
  noteIdOrSlug,
}: {
  actor: CommunityActor;
  noteIdOrSlug: string;
}): Promise<
  CommunityServiceResult<{
    favoriteCount: number;
    favorited: boolean;
    note: PublishedNoteTarget;
  }>
> {
  // 收藏和点赞类似，但收藏是更强的内容偏好信号；后续推荐排序可直接消费 favoriteCount。
  const note = await getPublishedNoteTarget(noteIdOrSlug);

  if (!note) {
    return communityError("NOT_FOUND", "Published note was not found.");
  }

  const blocked = await ensureCanInteractWithUser(actor.id, note.authorId);

  if (blocked) {
    return blocked;
  }

  // 收藏也是 toggle 操作，先做目标冷却，避免用户双击造成收藏状态和预期相反。
  if (
    !(await enforceInteractionGuard({
      kind: "favorite",
      targetId: note.id,
      userId: actor.id,
    }))
  ) {
    return communityError("RATE_LIMITED", "Too many favorite requests. Please retry later.");
  }

  const favoriteKey = {
    userId_noteId: {
      noteId: note.id,
      userId: actor.id,
    },
  };

  const existingFavorite = await db.favorite.findUnique({
    where: favoriteKey,
    select: {
      noteId: true,
    },
  });

  const favorited = !existingFavorite;

  if (existingFavorite) {
    await db.favorite.delete({
      where: favoriteKey,
    });
  } else {
    await db.favorite.create({
      data: {
        noteId: note.id,
        userId: actor.id,
      },
    });
    await createNotificationIfNeeded({
      actorId: actor.id,
      body: note.title,
      href: `/notes/${note.slug}`,
      recipientId: note.authorId,
      title: `${actorDisplayName(actor)} 收藏了你的笔记`,
      type: NotificationType.FAVORITE,
    });
  }

  const favoriteCount = await db.favorite.count({
    where: {
      noteId: note.id,
    },
  });

  return {
    data: {
      favoriteCount,
      favorited,
      note,
    },
    ok: true,
  };
}

export async function createNoteComment({
  actor,
  content,
  noteIdOrSlug,
  parentId,
}: {
  actor: CommunityActor;
  content: string;
  noteIdOrSlug: string;
  parentId?: string;
}): Promise<
  CommunityServiceResult<{
    comment: {
      content: string;
      createdAt: Date;
      id: string;
      parentId: string | null;
    };
    commentCount: number;
    note: PublishedNoteTarget;
  }>
> {
  // 评论写入顺序很重要：
  // 先做结构校验和敏感词校验，再查笔记/父评论，最后进入频控和写库。
  // 这样无效内容不会占用互动风控额度，也不会产生空通知。
  const parsed = commentSchema.safeParse({
    content,
  });

  if (!parsed.success) {
    return communityError("VALIDATION_ERROR", "Invalid comment content.", parsed.error.flatten());
  }

  const sensitiveTerms = findSensitiveCommentTerms(parsed.data.content);

  if (sensitiveTerms.length) {
    return communityError("VALIDATION_ERROR", "Comment contains sensitive content.", {
      reason: "SENSITIVE_COMMENT_TERM",
    });
  }

  const note = await getPublishedNoteTarget(noteIdOrSlug);

  if (!note) {
    return communityError("NOT_FOUND", "Published note was not found.");
  }

  const blocked = await ensureCanInteractWithUser(actor.id, note.authorId);

  if (blocked) {
    return blocked;
  }

  const parentComment = parentId
    ? await getReplyParentComment({
        noteId: note.id,
        parentId,
      })
    : null;

  if (parentId && !parentComment) {
    // parentId 只接受当前笔记的一层评论，避免用户构造跨笔记回复或多层嵌套。
    return communityError("NOT_FOUND", "Parent comment was not found.");
  }

  // 评论/回复使用用户+笔记/父评论作为目标，并把正文纳入重复内容检查。
  // 这样既能限制刷屏，也能避免网络重试产生重复评论。
  if (
    !(await enforceInteractionGuard({
      content: parsed.data.content,
      kind: "comment",
      targetId: parentComment?.id ?? note.id,
      userId: actor.id,
    }))
  ) {
    return communityError("RATE_LIMITED", "Too many comment requests. Please retry later.");
  }

  const comment = await db.comment.create({
    data: {
      authorId: actor.id,
      content: parsed.data.content,
      noteId: note.id,
      parentId: parentComment?.id,
    },
    select: {
      content: true,
      createdAt: true,
      id: true,
      parentId: true,
    },
  });

  const notificationTarget = parentComment
    ? {
        body: parsed.data.content.slice(0, 120),
        recipientId: parentComment.authorId,
        title: `${actorDisplayName(actor)} 回复了你的评论`,
      }
    : {
        body: parsed.data.content.slice(0, 120),
        recipientId: note.authorId,
        title: `${actorDisplayName(actor)} 评论了你的笔记`,
      };

  await createNotificationIfNeeded({
    actorId: actor.id,
    body: notificationTarget.body,
    href: `/notes/${note.slug}`,
    recipientId: notificationTarget.recipientId,
    title: notificationTarget.title,
    type: NotificationType.COMMENT,
  });

  const commentCount = await db.comment.count({
    where: {
      noteId: note.id,
      status: CommentStatus.VISIBLE,
    },
  });

  return {
    data: {
      comment,
      commentCount,
      note,
    },
    ok: true,
  };
}

export async function deleteComment({
  actor,
  commentId,
}: {
  actor: CommunityActor;
  commentId: string;
}): Promise<
  CommunityServiceResult<{
    commentId: string;
    note: PublishedNoteTarget;
  }>
> {
  // 删除采用软删除，不物理删除行：
  // 评论仍保留给后台审计和举报追踪，公开读链路只过滤非 VISIBLE 状态。
  const comment = await getVisibleCommentTarget(commentId);

  if (!comment) {
    return communityError("NOT_FOUND", "Comment was not found.");
  }

  if (comment.authorId !== actor.id) {
    return communityError("FORBIDDEN", "You can only delete your own comment.");
  }

  await updateCommentThreadStatus({
    comment,
    status: CommentStatus.DELETED,
  });

  return {
    data: {
      commentId: comment.id,
      note: noteTargetFromComment(comment),
    },
    ok: true,
  };
}

export async function reportComment({
  actor,
  commentId,
  detail,
  reason,
}: {
  actor: CommunityActor;
  commentId: string;
  detail?: string;
  reason: string;
}): Promise<
  CommunityServiceResult<{
    report: {
      id: string;
      status: ReportStatus;
    };
  }>
> {
  // 举报只创建 Report，不直接隐藏内容。
  // 是否隐藏由管理员在后台处理，避免普通用户通过批量举报直接下架内容。
  const parsed = commentReportSchema.safeParse({
    detail,
    reason,
  });

  if (!parsed.success) {
    return communityError("VALIDATION_ERROR", "Invalid report payload.", parsed.error.flatten());
  }

  const comment = await getVisibleCommentTarget(commentId);

  if (!comment) {
    return communityError("NOT_FOUND", "Comment was not found.");
  }

  if (comment.authorId === actor.id) {
    return communityError("VALIDATION_ERROR", "You cannot report your own comment.");
  }

  const report = await db.report.create({
    data: {
      commentId: comment.id,
      detail: parsed.data.detail || null,
      noteId: comment.noteId,
      reason: parsed.data.reason,
      reportedUserId: comment.authorId,
      reporterId: actor.id,
      targetType: ReportTargetType.COMMENT,
    },
    select: {
      id: true,
      status: true,
    },
  });

  return {
    data: {
      report,
    },
    ok: true,
  };
}

export async function moderateCommentReport({
  actor,
  reportId,
  resolution,
  type,
}: {
  actor: CommunityActor;
  reportId: string;
  resolution?: string;
  type: "hide" | "reject" | "review";
}): Promise<
  CommunityServiceResult<{
    commentId: string | null;
    note: PublishedNoteTarget | null;
    reportId: string;
    status: ReportStatus;
  }>
> {
  // 后台评论举报处理有三种状态流转：
  // review 进入处理中，reject 驳回举报，hide 隐藏评论并解决举报。
  // 每次处理都写 AdminAuditLog，便于之后追踪管理员操作。
  if (!canModerate(actor)) {
    return communityError("FORBIDDEN", "Admin permission is required.");
  }

  const report = await db.report.findUnique({
    where: {
      id: reportId,
    },
    include: {
      comment: {
        select: {
          authorId: true,
          content: true,
          id: true,
          noteId: true,
          parentId: true,
          status: true,
          author: {
            select: {
              handle: true,
              name: true,
            },
          },
          note: {
            select: {
              author: {
                select: {
                  handle: true,
                  name: true,
                },
              },
              authorId: true,
              id: true,
              slug: true,
              title: true,
            },
          },
        },
      },
    },
  });

  if (!report) {
    return communityError("NOT_FOUND", "Report was not found.");
  }

  if (report.targetType !== ReportTargetType.COMMENT) {
    return communityError("VALIDATION_ERROR", "Only comment reports can be moderated here.");
  }

  const trimmedResolution = resolution?.trim();
  let status: ReportStatus;
  let auditAction: string;
  let note: PublishedNoteTarget | null = null;

  if (type === "review") {
    status = ReportStatus.REVIEWING;
    auditAction = "REPORT_MARK_REVIEWING";
  } else if (type === "reject") {
    status = ReportStatus.REJECTED;
    auditAction = "REPORT_REJECT";
  } else {
    status = ReportStatus.RESOLVED;
    auditAction = "COMMENT_HIDE_FROM_REPORT";
  }

  if (type === "hide" && report.comment?.status === CommentStatus.VISIBLE) {
    await updateCommentThreadStatus({
      comment: report.comment,
      moderationReason: trimmedResolution || report.reason,
      status: CommentStatus.HIDDEN,
    });
  }

  if (report.comment) {
    note = noteTargetFromComment(report.comment);
  }

  const updatedReport = await db.report.update({
    where: {
      id: report.id,
    },
    data: {
      resolution: trimmedResolution || null,
      status,
    },
    select: {
      id: true,
      status: true,
    },
  });

  await db.adminAuditLog.create({
    data: {
      action: auditAction,
      actorId: actor.id,
      entityId: report.id,
      entityType: "REPORT",
      metadata: {
        commentId: report.commentId,
        decision: type,
        resolution: trimmedResolution ?? null,
        targetType: report.targetType,
      },
    },
  });

  await createNotificationIfNeeded({
    actorId: actor.id,
    body: trimmedResolution || "你的举报已有处理结果。",
    href: "/notifications",
    recipientId: report.reporterId,
    title: type === "reject" ? "你的举报未被采纳" : "你的举报已处理",
    type: NotificationType.REPORT_UPDATE,
  });

  return {
    data: {
      commentId: report.commentId,
      note,
      reportId: updatedReport.id,
      status: updatedReport.status,
    },
    ok: true,
  };
}

export async function moderateNoteStatus({
  actor,
  noteId,
  resolution,
  type,
}: {
  actor: CommunityActor;
  noteId: string;
  resolution?: string;
  type: "archive" | "hide" | "restore";
}): Promise<
  CommunityServiceResult<{
    note: PublishedNoteTarget & {
      status: NoteStatus;
    };
  }>
> {
  // 管理员笔记治理只改变公开状态，不删除内容；每次状态流转都写审计日志，
  // 便于后续接入举报、申诉和恢复流程时追踪操作来源。
  if (!canModerate(actor)) {
    return communityError("FORBIDDEN", "Admin permission is required.");
  }

  const note = await db.note.findUnique({
    where: {
      id: noteId,
    },
    select: {
      author: {
        select: {
          handle: true,
          name: true,
        },
      },
      authorId: true,
      id: true,
      publishedAt: true,
      slug: true,
      status: true,
      title: true,
    },
  });

  if (!note) {
    return communityError("NOT_FOUND", "Note was not found.");
  }

  let nextStatus: NoteStatus;
  let auditAction: string;

  if (type === "hide") {
    nextStatus = NoteStatus.HIDDEN;
    auditAction = "NOTE_HIDE";
  } else if (type === "archive") {
    nextStatus = NoteStatus.ARCHIVED;
    auditAction = "NOTE_ARCHIVE";
  } else {
    nextStatus = NoteStatus.PUBLISHED;
    auditAction = "NOTE_RESTORE";
  }

  if (note.status === nextStatus) {
    return {
      data: {
        note: {
          author: note.author,
          authorId: note.authorId,
          id: note.id,
          slug: note.slug,
          status: note.status,
          title: note.title,
        },
      },
      ok: true,
    };
  }

  const trimmedResolution = resolution?.trim();
  const updatedNote = await db.note.update({
    where: {
      id: note.id,
    },
    data: {
      publishedAt:
        nextStatus === NoteStatus.PUBLISHED ? (note.publishedAt ?? new Date()) : note.publishedAt,
      status: nextStatus,
    },
    select: {
      author: {
        select: {
          handle: true,
          name: true,
        },
      },
      authorId: true,
      id: true,
      slug: true,
      status: true,
      title: true,
    },
  });

  await db.adminAuditLog.create({
    data: {
      action: auditAction,
      actorId: actor.id,
      entityId: note.id,
      entityType: "NOTE",
      metadata: {
        fromStatus: note.status,
        resolution: trimmedResolution ?? null,
        toStatus: nextStatus,
      },
    },
  });

  return {
    data: {
      note: updatedNote,
    },
    ok: true,
  };
}

export async function updateUserRole({
  actor,
  role,
  userId,
}: {
  actor: CommunityActor;
  role: Extract<UserRole, "ADMIN" | "USER">;
  userId: string;
}): Promise<
  CommunityServiceResult<{
    user: {
      handle: string;
      id: string;
      role: UserRole;
    };
  }>
> {
  // 角色变更比普通治理动作更敏感：只允许 SUPER_ADMIN 操作，且不能修改自己
  // 或其他 SUPER_ADMIN，避免误操作导致后台权限不可恢复。
  if (!canManageRoles(actor)) {
    return communityError("FORBIDDEN", "Super admin permission is required.");
  }

  if (actor.id === userId) {
    return communityError("VALIDATION_ERROR", "You cannot change your own role.");
  }

  const user = await db.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      handle: true,
      id: true,
      role: true,
    },
  });

  if (!user) {
    return communityError("NOT_FOUND", "User was not found.");
  }

  if (user.role === UserRole.SUPER_ADMIN) {
    return communityError("FORBIDDEN", "Super admin role cannot be changed here.");
  }

  if (user.role === role) {
    return {
      data: {
        user,
      },
      ok: true,
    };
  }

  const updatedUser = await db.user.update({
    where: {
      id: user.id,
    },
    data: {
      role,
    },
    select: {
      handle: true,
      id: true,
      role: true,
    },
  });

  await db.adminAuditLog.create({
    data: {
      action: "USER_ROLE_UPDATE",
      actorId: actor.id,
      entityId: user.id,
      entityType: "USER",
      metadata: {
        fromRole: user.role,
        toRole: role,
      },
    },
  });

  return {
    data: {
      user: updatedUser,
    },
    ok: true,
  };
}

export async function updateUserStatus({
  actor,
  status,
  userId,
}: {
  actor: CommunityActor;
  status: Extract<UserStatus, "ACTIVE" | "BANNED">;
  userId: string;
}): Promise<
  CommunityServiceResult<{
    user: {
      handle: string;
      id: string;
      status: UserStatus;
    };
  }>
> {
  // 封禁会直接阻断登录和主要写入口，先限制为 SUPER_ADMIN 操作。
  // 普通管理员封禁、申诉和处罚时长后续再接入更完整的风控流程。
  if (!canManageRoles(actor)) {
    return communityError("FORBIDDEN", "Super admin permission is required.");
  }

  if (actor.id === userId) {
    return communityError("VALIDATION_ERROR", "You cannot change your own account status.");
  }

  const user = await db.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      handle: true,
      id: true,
      role: true,
      status: true,
    },
  });

  if (!user) {
    return communityError("NOT_FOUND", "User was not found.");
  }

  if (user.role === UserRole.SUPER_ADMIN) {
    return communityError("FORBIDDEN", "Super admin account cannot be banned here.");
  }

  if (user.status === status) {
    return {
      data: {
        user,
      },
      ok: true,
    };
  }

  const updatedUser = await db.user.update({
    where: {
      id: user.id,
    },
    data: {
      status,
    },
    select: {
      handle: true,
      id: true,
      status: true,
    },
  });

  await db.adminAuditLog.create({
    data: {
      action: "USER_STATUS_UPDATE",
      actorId: actor.id,
      entityId: user.id,
      entityType: "USER",
      metadata: {
        fromStatus: user.status,
        toStatus: status,
      },
    },
  });

  return {
    data: {
      user: updatedUser,
    },
    ok: true,
  };
}

export async function dismissNote({
  actor,
  noteIdOrSlug,
  reason,
}: {
  actor: CommunityActor;
  noteIdOrSlug: string;
  reason?: string;
}): Promise<
  CommunityServiceResult<{
    dismissed: true;
    note: PublishedNoteTarget;
  }>
> {
  // 不感兴趣是推荐负反馈，不改变 Note.status。
  // 这样不会影响其他用户，只影响当前用户的发现、搜索和详情读取。
  const note = await getPublishedNoteTarget(noteIdOrSlug);

  if (!note) {
    return communityError("NOT_FOUND", "Published note was not found.");
  }

  if (note.authorId === actor.id) {
    return communityError("VALIDATION_ERROR", "You cannot dismiss your own note.");
  }

  // “不感兴趣”是用户维度的轻量负反馈，不删除内容，只让后续 Feed/Search/详情过滤该笔记。
  await db.noteDismissal.upsert({
    where: {
      userId_noteId: {
        noteId: note.id,
        userId: actor.id,
      },
    },
    create: {
      noteId: note.id,
      reason: reason?.trim().slice(0, 120) || null,
      userId: actor.id,
    },
    update: {
      reason: reason?.trim().slice(0, 120) || null,
    },
  });

  return {
    data: {
      dismissed: true,
      note,
    },
    ok: true,
  };
}

export async function toggleUserBlock({
  actor,
  handle,
}: {
  actor: CommunityActor;
  handle: string;
}): Promise<
  CommunityServiceResult<{
    blocked: boolean;
    targetUser: {
      handle: string;
      id: string;
      name: string;
    };
  }>
> {
  // 屏蔽是 toggle 语义，便于 Web 按钮和移动端一个接口处理屏蔽/取消屏蔽。
  // 新增屏蔽时同时删除双向关注，保证社交图谱和可见性状态一致。
  const targetUser = await db.user.findUnique({
    where: {
      handle,
    },
    select: {
      handle: true,
      id: true,
      name: true,
    },
  });

  if (!targetUser) {
    return communityError("NOT_FOUND", "User was not found.");
  }

  if (targetUser.id === actor.id) {
    return communityError("VALIDATION_ERROR", "You cannot block yourself.");
  }

  const blockKey = {
    blockerId_blockedId: {
      blockedId: targetUser.id,
      blockerId: actor.id,
    },
  };
  const existingBlock = await db.userBlock.findUnique({
    where: blockKey,
    select: {
      blockedId: true,
    },
  });
  const blocked = !existingBlock;

  if (existingBlock) {
    await db.userBlock.delete({
      where: blockKey,
    });
  } else {
    // 屏蔽会切断双方关注关系，避免主页继续显示“已关注”或产生后续社交通知。
    await db.$transaction([
      db.userBlock.create({
        data: {
          blockedId: targetUser.id,
          blockerId: actor.id,
        },
      }),
      db.follow.deleteMany({
        where: {
          OR: [
            {
              followerId: actor.id,
              followingId: targetUser.id,
            },
            {
              followerId: targetUser.id,
              followingId: actor.id,
            },
          ],
        },
      }),
    ]);
  }

  return {
    data: {
      blocked,
      targetUser,
    },
    ok: true,
  };
}

export async function toggleUserFollow({
  actor,
  handle,
}: {
  actor: CommunityActor;
  handle: string;
}): Promise<
  CommunityServiceResult<{
    followerCount: number;
    following: boolean;
    targetUser: {
      handle: string;
      id: string;
      name: string;
    };
  }>
> {
  // 关注也是 toggle 语义。屏蔽关系检查放在风控之前：
  // 被屏蔽的双方不应该因为重复点击进入频控或产生通知。
  const targetUser = await db.user.findUnique({
    where: {
      handle,
    },
    select: {
      handle: true,
      id: true,
      name: true,
    },
  });

  if (!targetUser) {
    return communityError("NOT_FOUND", "User was not found.");
  }

  if (targetUser.id === actor.id) {
    return communityError("VALIDATION_ERROR", "You cannot follow yourself.");
  }

  const blocked = await ensureCanInteractWithUser(actor.id, targetUser.id);

  if (blocked) {
    return blocked;
  }

  // 关注关系会影响社交图谱和通知，按目标用户做短冷却，并限制单位时间关注数量。
  if (
    !(await enforceInteractionGuard({
      kind: "follow",
      targetId: targetUser.id,
      userId: actor.id,
    }))
  ) {
    return communityError("RATE_LIMITED", "Too many follow requests. Please retry later.");
  }

  const followKey = {
    followerId_followingId: {
      followerId: actor.id,
      followingId: targetUser.id,
    },
  };

  const existingFollow = await db.follow.findUnique({
    where: followKey,
    select: {
      followingId: true,
    },
  });

  const following = !existingFollow;

  if (existingFollow) {
    await db.follow.delete({
      where: followKey,
    });
  } else {
    await db.follow.create({
      data: {
        followerId: actor.id,
        followingId: targetUser.id,
      },
    });
    await createNotificationIfNeeded({
      actorId: actor.id,
      body: "进入个人主页查看新的关注者。",
      href: `/users/${actor.handle}`,
      recipientId: targetUser.id,
      title: `${actorDisplayName(actor)} 关注了你`,
      type: NotificationType.FOLLOW,
    });
  }

  const followerCount = await db.follow.count({
    where: {
      followingId: targetUser.id,
    },
  });

  return {
    data: {
      followerCount,
      following,
      targetUser,
    },
    ok: true,
  };
}
