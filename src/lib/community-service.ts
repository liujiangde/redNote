import { z } from "zod";

import {
  CommentStatus,
  NoteStatus,
  NotificationType,
  ReportStatus,
  ReportTargetType,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { enforceInteractionGuard } from "@/lib/interaction-guard";

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
  const note = await getPublishedNoteTarget(noteIdOrSlug);

  if (!note) {
    return communityError("NOT_FOUND", "Published note was not found.");
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
  const note = await getPublishedNoteTarget(noteIdOrSlug);

  if (!note) {
    return communityError("NOT_FOUND", "Published note was not found.");
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
  const parsed = commentSchema.safeParse({
    content,
  });

  if (!parsed.success) {
    return communityError("VALIDATION_ERROR", "Invalid comment content.", parsed.error.flatten());
  }

  const note = await getPublishedNoteTarget(noteIdOrSlug);

  if (!note) {
    return communityError("NOT_FOUND", "Published note was not found.");
  }

  const parentComment = parentId
    ? await getReplyParentComment({
        noteId: note.id,
        parentId,
      })
    : null;

  if (parentId && !parentComment) {
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
