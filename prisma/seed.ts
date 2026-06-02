import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

import {
  NoteStatus,
  NotificationType,
  PrismaClient,
  ReportStatus,
  ReportTargetType,
  UserRole,
} from "../src/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://rednote:rednote@localhost:5432/rednote?schema=public",
});

const prisma = new PrismaClient({ adapter });

function demoVector(seed: string) {
  // pgvector is represented as Unsupported in Prisma, so seed uses a stable
  // local vector and writes it with raw SQL below.
  return Array.from({ length: 1536 }, (_, index) => {
    const code = seed.charCodeAt(index % seed.length);
    return ((code + index) % 31) / 31;
  });
}

async function main() {
  await prisma.$executeRawUnsafe(`DELETE FROM "note_embeddings"`);
  await prisma.adminAuditLog.deleteMany();
  await prisma.report.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.noteTag.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.like.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.noteImage.deleteMany();
  await prisma.note.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hash("rednote123", 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@rednote.local",
      passwordHash,
      name: "RedNote 管理员",
      handle: "admin",
      role: UserRole.SUPER_ADMIN,
      avatarUrl:
        "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80",
      bio: "负责内容治理、推荐配置和用户运营。",
    },
  });

  const alan = await prisma.user.create({
    data: {
      email: "alan@rednote.local",
      passwordHash,
      name: "阿岚",
      handle: "alan",
      avatarUrl:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
      bio: "城市漫游和咖啡店收藏者。",
    },
  });

  const taro = await prisma.user.create({
    data: {
      email: "taro@rednote.local",
      passwordHash,
      name: "芋圆",
      handle: "taro",
      avatarUrl:
        "https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=200&q=80",
      bio: "轻食备餐和新手健身记录。",
    },
  });

  const nanqiao = await prisma.user.create({
    data: {
      email: "nanqiao@rednote.local",
      passwordHash,
      name: "南桥",
      handle: "nanqiao",
      avatarUrl:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
      bio: "路线规划、手机摄影和城市光线。",
    },
  });

  const tags = await Promise.all(
    ["城市漫游", "咖啡", "周末", "轻食", "备餐", "摄影", "上海", "路线"].map(
      (name) =>
        prisma.tag.create({
          data: {
            name,
            slug: name.toLowerCase().replace(/\s+/g, "-"),
          },
        }),
    ),
  );

  const tagByName = new Map(tags.map((tag) => [tag.name, tag]));

  const notes = await Promise.all([
    prisma.note.create({
      data: {
        authorId: alan.id,
        title: "周末一个人去的安静咖啡店",
        slug: "quiet-cafes-for-weekend",
        content:
          "靠窗座位很适合写计划，下午四点的光线刚好。收藏了三家适合阅读和低声聊天的店。",
        status: NoteStatus.PUBLISHED,
        viewCount: 18400,
        publishedAt: new Date(),
        images: {
          create: {
            url: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=80",
            alt: "咖啡店窗边座位",
            width: 900,
            height: 675,
          },
        },
        tags: {
          create: ["城市漫游", "咖啡", "周末"].map((name) => ({
            tag: { connect: { id: tagByName.get(name)!.id } },
          })),
        },
      },
    }),
    prisma.note.create({
      data: {
        authorId: taro.id,
        title: "新手友好的 7 天轻食备餐",
        slug: "seven-day-meal-prep",
        content:
          "用可复用的基础食材做变化，早餐、午餐和加餐都覆盖，预算控制在 260 元以内。",
        status: NoteStatus.PUBLISHED,
        viewCount: 12100,
        publishedAt: new Date(),
        images: {
          create: {
            url: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=80",
            alt: "轻食备餐盒",
            width: 900,
            height: 675,
          },
        },
        tags: {
          create: ["轻食", "备餐"].map((name) => ({
            tag: { connect: { id: tagByName.get(name)!.id } },
          })),
        },
      },
    }),
    prisma.note.create({
      data: {
        authorId: nanqiao.id,
        title: "上海一日摄影路线",
        slug: "shanghai-photo-route",
        content: "从老码头到苏州河，按光线顺序安排机位，适合 35mm 镜头和手机拍摄。",
        status: NoteStatus.PUBLISHED,
        viewCount: 24600,
        publishedAt: new Date(),
        images: {
          create: {
            url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
            alt: "城市街景",
            width: 900,
            height: 675,
          },
        },
        tags: {
          create: ["摄影", "上海", "路线"].map((name) => ({
            tag: { connect: { id: tagByName.get(name)!.id } },
          })),
        },
      },
    }),
  ]);

  await prisma.follow.createMany({
    data: [
      { followerId: alan.id, followingId: nanqiao.id },
      { followerId: taro.id, followingId: alan.id },
      { followerId: nanqiao.id, followingId: alan.id },
    ],
  });

  await prisma.like.createMany({
    data: [
      { userId: alan.id, noteId: notes[1].id },
      { userId: alan.id, noteId: notes[2].id },
      { userId: taro.id, noteId: notes[0].id },
      { userId: nanqiao.id, noteId: notes[0].id },
    ],
  });

  await prisma.favorite.createMany({
    data: [
      { userId: alan.id, noteId: notes[2].id },
      { userId: taro.id, noteId: notes[0].id },
      { userId: nanqiao.id, noteId: notes[1].id },
    ],
  });

  const comment = await prisma.comment.create({
    data: {
      noteId: notes[0].id,
      authorId: taro.id,
      content: "收藏了，周末正好想找一个安静地方写计划。",
    },
  });

  await prisma.report.create({
    data: {
      reporterId: admin.id,
      targetType: ReportTargetType.COMMENT,
      commentId: comment.id,
      reason: "示例举报",
      detail: "用于后台举报处理队列演示。",
      status: ReportStatus.OPEN,
    },
  });

  await prisma.notification.create({
    data: {
      recipientId: alan.id,
      actorId: taro.id,
      type: NotificationType.COMMENT,
      title: "你的笔记有新评论",
      body: "芋圆评论了你的咖啡店笔记。",
      href: `/notes/${notes[0].id}`,
    },
  });

  await prisma.adminAuditLog.create({
    data: {
      actorId: admin.id,
      action: "seed",
      entityType: "database",
      entityId: "rednote",
      metadata: { version: "initial" },
    },
  });

  for (const note of notes) {
    const sourceText = `${note.title}\n${note.content}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "note_embeddings" ("note_id", "embedding", "source_text", "updated_at")
       VALUES ($1, $2::vector, $3, NOW())
       ON CONFLICT ("note_id") DO UPDATE
       SET "embedding" = EXCLUDED."embedding", "source_text" = EXCLUDED."source_text", "updated_at" = NOW()`,
      note.id,
      `[${demoVector(sourceText).join(",")}]`,
      sourceText,
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
