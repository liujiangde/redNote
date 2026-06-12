"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { NoteStatus } from "@/generated/prisma/client";
import { requireUserSession } from "@/lib/auth-boundary";
import { createEmbedding } from "@/lib/ai/embeddings";
import { invalidateFeedCandidateCache } from "@/lib/content-data";
import { db } from "@/lib/db";
import { formatPgVector } from "@/lib/vector";

export type PublishFormState = {
  message: string;
  errors?: {
    title?: string[];
    content?: string[];
    tags?: string[];
    imageUrl?: string[];
  };
};

const publishSchema = z.object({
  title: z.string().trim().min(2, "标题至少需要 2 个字符").max(120, "标题不能超过 120 个字符"),
  content: z.string().trim().min(10, "正文至少需要 10 个字符"),
  tags: z.string().trim().max(200, "标签总长度不能超过 200 个字符").optional(),
  imageUrl: z.union([z.string().trim().url("图片地址无效"), z.literal("")]).optional(),
  imageAlt: z.string().trim().max(120, "图片描述不能超过 120 个字符").optional(),
  intent: z.enum(["draft", "publish"]).default("publish"),
});

function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "note";
}

function parseTags(value: string | undefined) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(/[,\s，#]+/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

export async function publishNote(
  _prevState: PublishFormState,
  formData: FormData,
): Promise<PublishFormState> {
  const session = await requireUserSession();

  // 发布是核心写流程，必须在服务端重新校验登录态、字段长度、图片 URL 和状态。
  // 页面保护只能提升体验，不能作为安全边界。
  const parsed = publishSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    tags: formData.get("tags"),
    imageUrl: formData.get("imageUrl"),
    imageAlt: formData.get("imageAlt"),
    intent: formData.get("intent"),
  });

  if (!parsed.success) {
    return {
      message: "请检查笔记内容。",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const tags = parseTags(parsed.data.tags);
  const status = parsed.data.intent === "publish" ? NoteStatus.PUBLISHED : NoteStatus.DRAFT;
  const slug = `${slugify(parsed.data.title)}-${randomUUID().slice(0, 8)}`;
  const sourceText = `${parsed.data.title}\n${parsed.data.content}`;
  const embedding = await createEmbedding(sourceText);

  const tagRecords = await Promise.all(
    tags.map((name) =>
      db.tag.upsert({
        where: {
          name,
        },
        create: {
          name,
          slug: `${slugify(name)}-${randomUUID().slice(0, 6)}`,
        },
        update: {},
      }),
    ),
  );

  const note = await db.note.create({
    data: {
      authorId: session.user.id,
      title: parsed.data.title,
      slug,
      content: parsed.data.content,
      status,
      publishedAt: status === NoteStatus.PUBLISHED ? new Date() : null,
      ...(parsed.data.imageUrl
        ? {
            images: {
              create: {
                url: parsed.data.imageUrl,
                alt: parsed.data.imageAlt || parsed.data.title,
                sortOrder: 0,
              },
            },
          }
        : {}),
      tags: {
        create: tagRecords.map((tag) => ({
          tag: {
            connect: {
              id: tag.id,
            },
          },
        })),
      },
    },
  });

  await db.$executeRawUnsafe(
    `INSERT INTO "note_embeddings" ("note_id", "embedding", "source_text", "updated_at")
     VALUES ($1, $2::vector, $3, NOW())
     ON CONFLICT ("note_id") DO UPDATE
     SET "embedding" = EXCLUDED."embedding", "source_text" = EXCLUDED."source_text", "updated_at" = NOW()`,
    note.id,
    formatPgVector(embedding),
    sourceText,
  );

  if (status === NoteStatus.PUBLISHED) {
    await invalidateFeedCandidateCache();
  }

  revalidatePath("/");
  revalidatePath("/search");
  revalidatePath(`/users/${session.user.handle}`);

  redirect(status === NoteStatus.PUBLISHED ? `/notes/${note.slug}` : `/users/${session.user.handle}`);
}
