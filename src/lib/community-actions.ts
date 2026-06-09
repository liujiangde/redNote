"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { NoteStatus, NotificationType } from "@/generated/prisma/client";
import { AuthorizationError, requireUserSession } from "@/lib/auth-boundary";
import { db } from "@/lib/db";
import { enforceInteractionGuard } from "@/lib/interaction-guard";

const commentSchema = z.object({
  content: z.string().trim().min(1).max(1000),
});

type PublishedNoteTarget = {
  id: string;
  slug: string;
  title: string;
  authorId: string;
  author: {
    handle: string;
    name: string;
  };
};

function redirectToLogin(callbackUrl: string): never {
  redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
}

async function requireUserOrRedirect(callbackUrl: string) {
  try {
    return await requireUserSession();
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) {
      redirectToLogin(callbackUrl);
    }

    throw error;
  }
}

async function getPublishedNoteTarget(noteIdOrSlug: string) {
  return db.note.findFirst({
    where: {
      status: NoteStatus.PUBLISHED,
      OR: [{ id: noteIdOrSlug }, { slug: noteIdOrSlug }],
    },
    select: {
      id: true,
      slug: true,
      title: true,
      authorId: true,
      author: {
        select: {
          handle: true,
          name: true,
        },
      },
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
  return db.comment.findFirst({
    where: {
      id: parentId,
      noteId,
      parentId: null,
    },
    select: {
      id: true,
      authorId: true,
      author: {
        select: {
          name: true,
        },
      },
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

function revalidateNoteInteractionPaths(note: PublishedNoteTarget) {
  // 互动会影响详情页、作者页和列表页计数；MVP 先精准刷新这些路径。
  // 后续接入推荐缓存后，应在这里扩展标签缓存或 Redis 计数失效逻辑。
  revalidatePath("/");
  revalidatePath("/search");
  revalidatePath(`/notes/${note.id}`);
  revalidatePath(`/notes/${note.slug}`);
  revalidatePath(`/users/${note.author.handle}`);
}

export async function toggleLike(noteIdOrSlug: string) {
  const session = await requireUserOrRedirect(`/notes/${noteIdOrSlug}`);
  const note = await getPublishedNoteTarget(noteIdOrSlug);

  if (!note) {
    redirect("/");
  }

  // 点赞是 toggle 操作，快速重复提交会把状态翻回去；风控层按用户+笔记做短冷却。
  if (
    !(await enforceInteractionGuard({
      kind: "like",
      targetId: note.id,
      userId: session.user.id,
    }))
  ) {
    return;
  }

  const likeKey = {
    userId_noteId: {
      userId: session.user.id,
      noteId: note.id,
    },
  };

  const existingLike = await db.like.findUnique({
    where: likeKey,
    select: {
      noteId: true,
    },
  });

  if (existingLike) {
    await db.like.delete({
      where: likeKey,
    });
  } else {
    await db.like.create({
      data: {
        noteId: note.id,
        userId: session.user.id,
      },
    });
    await createNotificationIfNeeded({
      actorId: session.user.id,
      href: `/notes/${note.slug}`,
      recipientId: note.authorId,
      title: `${session.user.name} 点赞了你的笔记`,
      body: note.title,
      type: NotificationType.LIKE,
    });
  }

  revalidateNoteInteractionPaths(note);
}

export async function toggleFavorite(noteIdOrSlug: string) {
  const session = await requireUserOrRedirect(`/notes/${noteIdOrSlug}`);
  const note = await getPublishedNoteTarget(noteIdOrSlug);

  if (!note) {
    redirect("/");
  }

  // 收藏同样是 toggle 操作，先做目标冷却，避免用户双击造成收藏状态和预期相反。
  if (
    !(await enforceInteractionGuard({
      kind: "favorite",
      targetId: note.id,
      userId: session.user.id,
    }))
  ) {
    return;
  }

  const favoriteKey = {
    userId_noteId: {
      userId: session.user.id,
      noteId: note.id,
    },
  };

  const existingFavorite = await db.favorite.findUnique({
    where: favoriteKey,
    select: {
      noteId: true,
    },
  });

  if (existingFavorite) {
    await db.favorite.delete({
      where: favoriteKey,
    });
  } else {
    await db.favorite.create({
      data: {
        noteId: note.id,
        userId: session.user.id,
      },
    });
    await createNotificationIfNeeded({
      actorId: session.user.id,
      href: `/notes/${note.slug}`,
      recipientId: note.authorId,
      title: `${session.user.name} 收藏了你的笔记`,
      body: note.title,
      type: NotificationType.FAVORITE,
    });
  }

  revalidateNoteInteractionPaths(note);
}

export async function createComment(
  noteIdOrSlug: string,
  parentIdOrFormData: string | FormData,
  maybeFormData?: FormData,
) {
  const session = await requireUserOrRedirect(`/notes/${noteIdOrSlug}`);
  const note = await getPublishedNoteTarget(noteIdOrSlug);

  if (!note) {
    redirect("/");
  }

  // 这个 Server Action 同时支持一级评论和二级回复：
  // - 一级评论表单只 bind noteId，第二个参数就是 FormData。
  // - 回复表单 bind noteId + parentId，第三个参数才是 FormData。
  // 这样页面无需新增客户端状态，也能保持无 JS 时的表单可提交能力。
  const parentId = typeof parentIdOrFormData === "string" ? parentIdOrFormData : undefined;
  const formData = parentIdOrFormData instanceof FormData ? parentIdOrFormData : maybeFormData;

  if (!formData) {
    return;
  }

  // 评论写入前只接受服务端校验后的正文。敏感词审核、频控和删除/隐藏策略
  // 会在后续互动风控和内容治理阶段补齐。
  const parsed = commentSchema.safeParse({
    content: formData.get("content"),
  });

  if (!parsed.success) {
    return;
  }

  const parentComment = parentId
    ? await getReplyParentComment({
        noteId: note.id,
        parentId,
      })
    : null;

  if (parentId && !parentComment) {
    return;
  }

  // 评论/回复使用用户+笔记/父评论作为目标，并把正文纳入重复内容检查。
  // 这样既能限制刷屏，也能避免网络重试产生重复评论。
  if (
    !(await enforceInteractionGuard({
      content: parsed.data.content,
      kind: "comment",
      targetId: parentComment?.id ?? note.id,
      userId: session.user.id,
    }))
  ) {
    return;
  }

  await db.comment.create({
    data: {
      authorId: session.user.id,
      content: parsed.data.content,
      noteId: note.id,
      parentId: parentComment?.id,
    },
  });

  const notificationTarget = parentComment
    ? {
        recipientId: parentComment.authorId,
        title: `${session.user.name} 回复了你的评论`,
        body: parsed.data.content.slice(0, 120),
      }
    : {
        recipientId: note.authorId,
        title: `${session.user.name} 评论了你的笔记`,
        body: parsed.data.content.slice(0, 120),
      };

  await createNotificationIfNeeded({
    actorId: session.user.id,
    href: `/notes/${note.slug}`,
    recipientId: notificationTarget.recipientId,
    title: notificationTarget.title,
    body: notificationTarget.body,
    type: NotificationType.COMMENT,
  });

  revalidateNoteInteractionPaths(note);
}

export async function toggleFollow(handle: string) {
  const session = await requireUserOrRedirect(`/users/${handle}`);
  const targetUser = await db.user.findUnique({
    where: {
      handle,
    },
    select: {
      id: true,
      handle: true,
      name: true,
    },
  });

  if (!targetUser) {
    redirect("/");
  }

  if (targetUser.id === session.user.id) {
    return;
  }

  // 关注关系会影响社交图谱和通知，按目标用户做短冷却，并限制单位时间关注数量。
  if (
    !(await enforceInteractionGuard({
      kind: "follow",
      targetId: targetUser.id,
      userId: session.user.id,
    }))
  ) {
    return;
  }

  const followKey = {
    followerId_followingId: {
      followerId: session.user.id,
      followingId: targetUser.id,
    },
  };

  const existingFollow = await db.follow.findUnique({
    where: followKey,
    select: {
      followingId: true,
    },
  });

  if (existingFollow) {
    await db.follow.delete({
      where: followKey,
    });
  } else {
    await db.follow.create({
      data: {
        followerId: session.user.id,
        followingId: targetUser.id,
      },
    });
    await createNotificationIfNeeded({
      actorId: session.user.id,
      href: `/users/${session.user.handle}`,
      recipientId: targetUser.id,
      title: `${session.user.name} 关注了你`,
      body: "进入个人主页查看新的关注者。",
      type: NotificationType.FOLLOW,
    });
  }

  // 关注数会影响双方主页：被关注者粉丝数和当前用户关注数都要刷新。
  revalidatePath(`/users/${targetUser.handle}`);
  revalidatePath(`/users/${session.user.handle}`);
}
