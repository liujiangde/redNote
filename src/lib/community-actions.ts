"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthorizationError, requireUserSession } from "@/lib/auth-boundary";
import type { PublishedNoteTarget } from "@/lib/community-service";
import {
  createNoteComment,
  deleteComment,
  dismissNote,
  reportComment,
  toggleNoteFavorite,
  toggleNoteLike,
  toggleUserBlock,
  toggleUserFollow,
} from "@/lib/community-service";
import { invalidateFeedCandidateCache } from "@/lib/content-data";

// 这个文件是 Web 表单的 Server Action 边界：
// - 负责把未登录用户 redirect 到登录页。
// - 负责从 FormData 取字段。
// - 负责在写入成功后 revalidate 页面。
// 真正的业务校验和数据库写入都委托给 community-service.ts，避免 Web 和 /api/v1 逻辑分叉。
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

async function revalidateNoteInteractionPaths(note: PublishedNoteTarget) {
  // 互动会影响详情页、作者页和列表页计数；MVP 先精准刷新这些路径。
  // Feed 候选池缓存保存互动计数，写入成功后先清缓存再刷新页面。
  await invalidateFeedCandidateCache();
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

  await revalidateNoteInteractionPaths(result.data.note);
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

  await revalidateNoteInteractionPaths(result.data.note);
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

  await revalidateNoteInteractionPaths(result.data.note);
}

export async function deleteOwnComment(commentId: string) {
  // 删除按钮不传 noteId，服务层会通过 commentId 找回所属笔记，并返回需要刷新的页面路径。
  const session = await requireUserOrRedirect("/");
  const result = await deleteComment({
    actor: session.user,
    commentId,
  });

  if (!result.ok) {
    return;
  }

  await revalidateNoteInteractionPaths(result.data.note);
}

export async function reportVisibleComment(commentId: string, formData: FormData) {
  // 举报入口来自公开评论区。Web 当前只传固定 reason，移动端 API 可以传更细 detail。
  const session = await requireUserOrRedirect("/");
  const reason = formData.get("reason");
  const detail = formData.get("detail");

  if (typeof reason !== "string") {
    return;
  }

  const result = await reportComment({
    actor: session.user,
    commentId,
    detail: typeof detail === "string" ? detail : undefined,
    reason,
  });

  if (!result.ok) {
    return;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/reports");
  revalidatePath("/notifications");
}

export async function markNoteNotInterested(noteIdOrSlug: string, formData?: FormData) {
  // 不感兴趣是当前用户私有反馈。刷新详情页后，该笔记会因 viewerFilter 返回 404。
  const session = await requireUserOrRedirect(`/notes/${noteIdOrSlug}`);
  const reason = formData?.get("reason");
  const result = await dismissNote({
    actor: session.user,
    noteIdOrSlug,
    reason: typeof reason === "string" ? reason : undefined,
  });

  if (!result.ok) {
    if (result.error.code === "NOT_FOUND") {
      redirect("/");
    }

    return;
  }

  // 不感兴趣会影响发现页、搜索页和当前详情页；刷新后用户不再看到该笔记。
  revalidatePath("/");
  revalidatePath("/search");
  revalidatePath(`/notes/${result.data.note.id}`);
  revalidatePath(`/notes/${result.data.note.slug}`);
}

export async function toggleBlock(handle: string) {
  // 屏蔽/取消屏蔽复用一个按钮。服务层负责 toggle 和切断关注关系。
  const session = await requireUserOrRedirect(`/users/${handle}`);
  const result = await toggleUserBlock({
    actor: session.user,
    handle,
  });

  if (!result.ok) {
    if (result.error.code === "NOT_FOUND") {
      redirect("/");
    }

    return;
  }

  // 屏蔽关系影响双方主页、发现页和搜索页展示。
  revalidatePath("/");
  revalidatePath("/search");
  revalidatePath(`/users/${result.data.targetUser.handle}`);
  revalidatePath(`/users/${session.user.handle}`);
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
