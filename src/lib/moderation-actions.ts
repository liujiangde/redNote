"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { UserRole, UserStatus } from "@/generated/prisma/client";
import { AuthorizationError, requireAdminSession } from "@/lib/auth-boundary";
import {
  moderateCommentReport,
  moderateNoteStatus,
  updateUserRole,
  updateUserStatus,
} from "@/lib/community-service";
import { invalidateFeedCandidateCache } from "@/lib/content-data";

async function requireAdminOrRedirect(callbackUrl = "/admin/reports") {
  try {
    return await requireAdminSession();
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) {
      redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }

    if (error instanceof AuthorizationError) {
      redirect("/");
    }

    throw error;
  }
}

function revalidateModerationPaths(reportId: string, note: { id: string; slug: string } | null) {
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
  revalidatePath(`/admin/reports/${reportId}`);

  if (note) {
    revalidatePath(`/notes/${note.id}`);
    revalidatePath(`/notes/${note.slug}`);
  }
}

function revalidateNoteModerationPaths(note: {
  author: {
    handle: string;
  };
  id: string;
  slug: string;
}) {
  revalidatePath("/admin");
  revalidatePath("/admin/notes");
  revalidatePath(`/notes/${note.id}`);
  revalidatePath(`/notes/${note.slug}`);
  revalidatePath(`/users/${note.author.handle}`);
}

function revalidateUserModerationPaths(user: { handle: string }) {
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath(`/users/${user.handle}`);
}

export async function markCommentReportReviewing(reportId: string) {
  const session = await requireAdminOrRedirect();
  const result = await moderateCommentReport({
    actor: session.user,
    reportId,
    type: "review",
  });

  if (result.ok) {
    revalidateModerationPaths(result.data.reportId, result.data.note);
  }
}

export async function markCommentReportsReviewing(formData: FormData) {
  const reportIds = Array.from(new Set(formData.getAll("reportId")))
    .filter((reportId): reportId is string => typeof reportId === "string")
    .filter(Boolean)
    .slice(0, 50);

  if (!reportIds.length) {
    return;
  }

  const session = await requireAdminOrRedirect();

  for (const reportId of reportIds) {
    const result = await moderateCommentReport({
      actor: session.user,
      reportId,
      type: "review",
    });

    if (result.ok) {
      revalidateModerationPaths(result.data.reportId, result.data.note);
    }
  }
}

export async function rejectCommentReport(reportId: string, formData: FormData) {
  const session = await requireAdminOrRedirect();
  const resolution = formData.get("resolution");
  const result = await moderateCommentReport({
    actor: session.user,
    reportId,
    resolution: typeof resolution === "string" ? resolution : undefined,
    type: "reject",
  });

  if (result.ok) {
    revalidateModerationPaths(result.data.reportId, result.data.note);
  }
}

export async function hideReportedComment(reportId: string, formData: FormData) {
  const session = await requireAdminOrRedirect();
  const resolution = formData.get("resolution");
  const result = await moderateCommentReport({
    actor: session.user,
    reportId,
    resolution: typeof resolution === "string" ? resolution : undefined,
    type: "hide",
  });

  if (result.ok) {
    if (result.data.note) {
      await invalidateFeedCandidateCache();
    }

    revalidateModerationPaths(result.data.reportId, result.data.note);
  }
}

async function updateNoteModerationStatus({
  noteId,
  resolution,
  type,
}: {
  noteId: string;
  resolution: string;
  type: "archive" | "hide" | "restore";
}) {
  const session = await requireAdminOrRedirect("/admin/notes");
  const result = await moderateNoteStatus({
    actor: session.user,
    noteId,
    resolution,
    type,
  });

  if (result.ok) {
    await invalidateFeedCandidateCache();
    revalidateNoteModerationPaths(result.data.note);
  }
}

export async function hideAdminNote(noteId: string) {
  await updateNoteModerationStatus({
    noteId,
    resolution: "管理员隐藏笔记。",
    type: "hide",
  });
}

export async function archiveAdminNote(noteId: string) {
  await updateNoteModerationStatus({
    noteId,
    resolution: "管理员归档笔记。",
    type: "archive",
  });
}

export async function restoreAdminNote(noteId: string) {
  await updateNoteModerationStatus({
    noteId,
    resolution: "管理员恢复笔记公开状态。",
    type: "restore",
  });
}

async function updateAdminUserRole(userId: string, role: Extract<UserRole, "ADMIN" | "USER">) {
  const session = await requireAdminOrRedirect("/admin/users");
  const result = await updateUserRole({
    actor: session.user,
    role,
    userId,
  });

  if (result.ok) {
    revalidateUserModerationPaths(result.data.user);
  }
}

export async function promoteAdminUser(userId: string) {
  await updateAdminUserRole(userId, UserRole.ADMIN);
}

export async function demoteAdminUser(userId: string) {
  await updateAdminUserRole(userId, UserRole.USER);
}

async function updateAdminUserStatus(
  userId: string,
  status: Extract<UserStatus, "ACTIVE" | "BANNED">,
) {
  const session = await requireAdminOrRedirect("/admin/users");
  const result = await updateUserStatus({
    actor: session.user,
    status,
    userId,
  });

  if (result.ok) {
    revalidateUserModerationPaths(result.data.user);
  }
}

export async function banAdminUser(userId: string) {
  await updateAdminUserStatus(userId, UserStatus.BANNED);
}

export async function unbanAdminUser(userId: string) {
  await updateAdminUserStatus(userId, UserStatus.ACTIVE);
}
