import { z } from "zod";

import { NoteStatus, NotificationType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { enforceInteractionGuard } from "@/lib/interaction-guard";

export const commentSchema = z.object({
  content: z.string().trim().min(1).max(1000),
});

export type CommunityActor = {
  handle: string;
  id: string;
  name?: string | null;
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

type ServiceErrorCode = "NOT_FOUND" | "RATE_LIMITED" | "VALIDATION_ERROR";

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
    },
    select: {
      authorId: true,
      id: true,
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
