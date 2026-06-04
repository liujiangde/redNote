"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { NoteStatus, NotificationType } from "@/generated/prisma/client";
import { AuthorizationError, requireUserSession } from "@/lib/auth-boundary";
import { db } from "@/lib/db";

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

export async function createComment(noteIdOrSlug: string, formData: FormData) {
  const session = await requireUserOrRedirect(`/notes/${noteIdOrSlug}`);
  const note = await getPublishedNoteTarget(noteIdOrSlug);

  if (!note) {
    redirect("/");
  }

  // 评论写入前只接受服务端校验后的正文。当前实现一级评论，
  // 回复树、敏感词审核和频控会在后续社区治理阶段补齐。
  const parsed = commentSchema.safeParse({
    content: formData.get("content"),
  });

  if (!parsed.success) {
    return;
  }

  await db.comment.create({
    data: {
      authorId: session.user.id,
      content: parsed.data.content,
      noteId: note.id,
    },
  });
  await createNotificationIfNeeded({
    actorId: session.user.id,
    href: `/notes/${note.slug}`,
    recipientId: note.authorId,
    title: `${session.user.name} 评论了你的笔记`,
    body: parsed.data.content.slice(0, 120),
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
