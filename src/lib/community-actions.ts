"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthorizationError, requireUserSession } from "@/lib/auth-boundary";
import type { PublishedNoteTarget } from "@/lib/community-service";
import {
  createNoteComment,
  toggleNoteFavorite,
  toggleNoteLike,
  toggleUserFollow,
} from "@/lib/community-service";

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
  const result = await toggleNoteLike({
    actor: session.user,
    noteIdOrSlug,
  });

  if (!result.ok) {
    // Web 表单保持原来的体验：目标不存在回首页；频控命中时静默丢弃本次重复提交。
    if (result.error.code === "NOT_FOUND") {
      redirect("/");
    }

    return;
  }

  revalidateNoteInteractionPaths(result.data.note);
}

export async function toggleFavorite(noteIdOrSlug: string) {
  const session = await requireUserOrRedirect(`/notes/${noteIdOrSlug}`);
  const result = await toggleNoteFavorite({
    actor: session.user,
    noteIdOrSlug,
  });

  if (!result.ok) {
    // Web 表单保持原来的体验：目标不存在回首页；频控命中时静默丢弃本次重复提交。
    if (result.error.code === "NOT_FOUND") {
      redirect("/");
    }

    return;
  }

  revalidateNoteInteractionPaths(result.data.note);
}

export async function createComment(
  noteIdOrSlug: string,
  parentIdOrFormData: string | FormData,
  maybeFormData?: FormData,
) {
  const session = await requireUserOrRedirect(`/notes/${noteIdOrSlug}`);

  // 这个 Server Action 同时支持一级评论和二级回复：
  // - 一级评论表单只 bind noteId，第二个参数就是 FormData。
  // - 回复表单 bind noteId + parentId，第三个参数才是 FormData。
  // 这样页面无需新增客户端状态，也能保持无 JS 时的表单可提交能力。
  const parentId = typeof parentIdOrFormData === "string" ? parentIdOrFormData : undefined;
  const formData = parentIdOrFormData instanceof FormData ? parentIdOrFormData : maybeFormData;

  if (!formData) {
    return;
  }

  const content = formData.get("content");

  if (typeof content !== "string") {
    return;
  }

  const result = await createNoteComment({
    actor: session.user,
    content,
    noteIdOrSlug,
    parentId,
  });

  if (!result.ok) {
    // 评论表单对校验/频控错误保持无 JS 友好处理；不存在的笔记按详情页失效处理。
    if (result.error.code === "NOT_FOUND" && result.error.message.includes("note")) {
      redirect("/");
    }

    return;
  }

  revalidateNoteInteractionPaths(result.data.note);
}

export async function toggleFollow(handle: string) {
  const session = await requireUserOrRedirect(`/users/${handle}`);
  const result = await toggleUserFollow({
    actor: session.user,
    handle,
  });

  if (!result.ok) {
    if (result.error.code === "NOT_FOUND") {
      redirect("/");
    }

    return;
  }

  // 关注数会影响双方主页：被关注者粉丝数和当前用户关注数都要刷新。
  revalidatePath(`/users/${result.data.targetUser.handle}`);
  revalidatePath(`/users/${session.user.handle}`);
}
