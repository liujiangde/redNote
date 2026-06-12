"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthorizationError, requireAdminSession } from "@/lib/auth-boundary";
import { moderateCommentReport } from "@/lib/community-service";
import { invalidateFeedCandidateCache } from "@/lib/content-data";

async function requireAdminOrRedirect() {
  try {
    return await requireAdminSession();
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) {
      redirect("/login?callbackUrl=/admin/reports");
    }

    if (error instanceof AuthorizationError) {
      redirect("/");
    }

    throw error;
  }
}

function revalidateModerationPaths(note: { id: string; slug: string } | null) {
  revalidatePath("/admin");
  revalidatePath("/admin/reports");

  if (note) {
    revalidatePath(`/notes/${note.id}`);
    revalidatePath(`/notes/${note.slug}`);
  }
}

export async function markCommentReportReviewing(reportId: string) {
  const session = await requireAdminOrRedirect();
  const result = await moderateCommentReport({
    actor: session.user,
    reportId,
    type: "review",
  });

  if (result.ok) {
    revalidateModerationPaths(result.data.note);
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
    revalidateModerationPaths(result.data.note);
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

    revalidateModerationPaths(result.data.note);
  }
}
