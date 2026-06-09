import net from "node:net";

import { connection } from "next/server";

import {
  CommentStatus,
  NoteStatus,
  Prisma,
  ReportStatus,
  ReportTargetType,
} from "@/generated/prisma/client";
import { createCursorPage, type PageInfo } from "@/lib/api-contract";
import { db } from "@/lib/db";
import {
  adminMetrics as fixtureAdminMetrics,
  demoNotes,
  moderationQueue as fixtureModerationQueue,
  topicTrends as fixtureTopicTrends,
} from "@/lib/mock-data";

// 当前 Web 页面共用的内容读模型层：
// 1. 页面只关心已经整理好的展示 DTO。
// 2. Prisma 查询、fixture fallback、字段裁剪和计数口径都集中在这里。
// 3. 后续接入 Route Handler/BFF、Redis 缓存或移动端 API 时，优先从这里拆服务。
const DEFAULT_NOTE_IMAGE =
  "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80";
const DEFAULT_AVATAR_URL =
  "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?auto=format&fit=crop&w=200&q=80";
const DATABASE_REACHABILITY_TTL_MS = 5000;
const DEFAULT_DETAIL_COMMENT_PAGE_SIZE = 10;
const MAX_DETAIL_COMMENT_PAGE_SIZE = 50;
const COMMENT_REPLY_PREVIEW_LIMIT = 3;

let databaseReachability:
  | {
      checkedAt: number;
      value: boolean;
    }
  | undefined;
let databaseReachabilityPromise: Promise<boolean> | undefined;

// 笔记卡片只取列表页需要展示的字段，避免页面层直接暴露复杂 include。
// 详情页、搜索页、后台笔记列表都复用这个结构，保证互动数和作者字段口径一致。
const noteCardInclude = {
  author: {
    select: {
      name: true,
      handle: true,
      avatarUrl: true,
    },
  },
  images: {
    orderBy: {
      sortOrder: "asc",
    },
    take: 1,
    select: {
      url: true,
      alt: true,
    },
  },
  tags: {
    include: {
      tag: {
        select: {
          name: true,
        },
      },
    },
  },
  _count: {
    select: {
      likes: true,
      favorites: true,
      comments: {
        where: {
          status: CommentStatus.VISIBLE,
        },
      },
    },
  },
} satisfies Prisma.NoteInclude;

const commentAuthorSelect = {
  id: true,
  name: true,
  handle: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

const noteDetailCommentInclude = {
  author: {
    select: {
      ...commentAuthorSelect,
    },
  },
  // 回复预览只取每条一级评论下最近 3 条，避免详情页一次展开完整楼中楼。
  // 后续如果回复量增长，应为单条评论增加独立的 replies cursor API。
  replies: {
    where: {
      status: CommentStatus.VISIBLE,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: COMMENT_REPLY_PREVIEW_LIMIT,
    include: {
      author: {
        select: {
          ...commentAuthorSelect,
        },
      },
    },
  },
  _count: {
    select: {
      replies: {
        where: {
          status: CommentStatus.VISIBLE,
        },
      },
    },
  },
} satisfies Prisma.CommentInclude;

function clampCommentPageSize(value: number | undefined) {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_DETAIL_COMMENT_PAGE_SIZE;
  }

  return Math.max(1, Math.min(MAX_DETAIL_COMMENT_PAGE_SIZE, Math.floor(value)));
}

// 详情页需要完整图片列表，并按 cursor 拉取一级评论。
// 这里用工厂函数生成 include，是因为评论 cursor/limit 来自 URL，不能写成固定常量。
function createNoteDetailInclude({
  commentCursor,
  commentLimit,
}: {
  commentCursor?: string;
  commentLimit?: number;
} = {}) {
  const limit = clampCommentPageSize(commentLimit);

  return {
    ...noteCardInclude,
    images: {
      orderBy: {
        sortOrder: "asc",
      },
      select: {
        url: true,
        alt: true,
      },
    },
    comments: {
      where: {
        parentId: null,
        status: CommentStatus.VISIBLE,
      },
      // createdAt + id 双字段排序让 cursor 分页更稳定，避免同一时间创建的评论顺序抖动。
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(commentCursor
        ? {
            cursor: {
              id: commentCursor,
            },
            skip: 1,
          }
        : {}),
      include: noteDetailCommentInclude,
    },
  } satisfies Prisma.NoteInclude;
}

type NoteCardRecord = Prisma.NoteGetPayload<{ include: typeof noteCardInclude }>;
type NoteDetailRecord = Prisma.NoteGetPayload<{ include: ReturnType<typeof createNoteDetailInclude> }>;

export type NoteCardData = {
  id: string;
  title: string;
  excerpt: string;
  imageUrl: string;
  imageAlt: string;
  author: {
    name: string;
    handle: string;
    avatarUrl: string;
  };
  tags: string[];
  likes: number;
  favorites: number;
  comments: number;
  views: number;
  score: number;
  createdAt: string;
};

export type NoteDetailData = NoteCardData & {
  content: string;
  images: Array<{
    url: string;
    alt: string;
  }>;
  viewerHasLiked: boolean;
  viewerHasFavorited: boolean;
  commentsList: NoteCommentData[];
  commentsPageInfo: PageInfo;
};

export type CommentReplyData = {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    handle: string;
    avatarUrl: string;
  };
};

export type NoteCommentData = CommentReplyData & {
  replyCount: number;
  replies: CommentReplyData[];
};

export type TopicTrend = {
  name: string;
  heat: number;
  noteCount: number;
  growth: string;
};

export type AdminMetric = {
  label: string;
  value: string;
  delta: string;
};

export type AdminNoteRow = {
  id: string;
  title: string;
  authorName: string;
  status: string;
  score: number;
  interactions: number;
  views: number;
  updatedAt: string;
};

export type AdminReportRow = {
  commentId: string | null;
  id: string;
  detail: string | null;
  resolution: string | null;
  target: string;
  targetType: string;
  reporterName: string;
  reason: string;
  status: string;
  createdAt: string;
};

export type AdminUserRow = {
  id: string;
  name: string;
  handle: string;
  role: string;
  noteCount: number;
  followerCount: number;
  followingCount: number;
  reportCount: number;
  createdAt: string;
};

function formatInteger(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatDate(value: Date | null) {
  if (!value) {
    return "未发布";
  }

  return value.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  const chars = Array.from(normalized);

  if (chars.length <= maxLength) {
    return normalized;
  }

  return `${chars.slice(0, maxLength).join("")}...`;
}

function calculateNoteScore(note: Pick<NoteCardRecord, "viewCount" | "_count">) {
  const interactions = note._count.likes + note._count.favorites + note._count.comments;
  return Math.min(100, Math.round(note.viewCount / 300 + interactions * 5));
}

// 本地开发时 PostgreSQL 可能还没启动；只有连接类错误才进入 fixture fallback，
// 业务错误仍然抛出，避免真实 bug 被示例数据掩盖。
function isDatabaseUnavailable(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";

  return code === "ECONNREFUSED" || code === "P1001" || message.includes("ECONNREFUSED");
}

function isPrismaRecordNotFound(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = "code" in error ? String(error.code) : "";

  return code === "P2025";
}

async function withDatabaseFallback<T>(query: () => Promise<T>, fallback: () => T) {
  if (!(await canReachDatabase())) {
    return fallback();
  }

  try {
    return await query();
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return fallback();
    }

    throw error;
  }
}

// 在真正执行 Prisma 查询前先做一次轻量 TCP 探测，避免数据库关闭时每个页面
// 都刷出 Prisma 连接错误。TTL 很短，只服务于开发期兜底，不作为生产健康检查。
function getDatabaseConnectionTarget() {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://rednote:rednote@localhost:5432/rednote?schema=public";
  const url = new URL(connectionString);

  return {
    host: url.hostname,
    port: Number(url.port || 5432),
  };
}

async function canReachDatabase() {
  if (
    databaseReachability &&
    Date.now() - databaseReachability.checkedAt < DATABASE_REACHABILITY_TTL_MS
  ) {
    return databaseReachability.value;
  }

  databaseReachabilityPromise ??= new Promise<boolean>((resolve) => {
    const { host, port } = getDatabaseConnectionTarget();
    const socket = net.createConnection({ host, port });

    const finish = (value: boolean) => {
      socket.destroy();
      databaseReachability = {
        checkedAt: Date.now(),
        value,
      };
      databaseReachabilityPromise = undefined;
      resolve(value);
    };

    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });

  return databaseReachabilityPromise;
}

function toFixtureNoteCard(note: (typeof demoNotes)[number]): NoteCardData {
  return {
    ...note,
    imageAlt: note.title,
  };
}

function getFixtureNotes() {
  return demoNotes.map(toFixtureNoteCard);
}

function getFixtureTopics(limit = 5) {
  return fixtureTopicTrends.slice(0, limit).map((topic, index): TopicTrend => ({
    name: topic.name,
    heat: topic.heat,
    noteCount: Math.max(1, fixtureTopicTrends.length - index),
    growth: topic.growth,
  }));
}

function toNoteCard(note: NoteCardRecord): NoteCardData {
  const image = note.images[0];

  return {
    id: note.id,
    title: note.title,
    excerpt: truncateText(note.content, 72),
    imageUrl: image?.url ?? DEFAULT_NOTE_IMAGE,
    imageAlt: image?.alt ?? note.title,
    author: {
      name: note.author.name,
      handle: note.author.handle,
      avatarUrl: note.author.avatarUrl ?? DEFAULT_AVATAR_URL,
    },
    tags: note.tags.map((item) => item.tag.name),
    likes: note._count.likes,
    favorites: note._count.favorites,
    comments: note._count.comments,
    views: note.viewCount,
    score: calculateNoteScore(note),
    createdAt: formatDate(note.publishedAt ?? note.createdAt),
  };
}

function toCommentAuthor(author: {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
}) {
  return {
    id: author.id,
    name: author.name,
    handle: author.handle,
    avatarUrl: author.avatarUrl ?? DEFAULT_AVATAR_URL,
  };
}

function toCommentReplyData(
  comment: Pick<NoteDetailRecord["comments"][number], "id" | "content" | "createdAt" | "author">,
): CommentReplyData {
  return {
    id: comment.id,
    content: comment.content,
    createdAt: formatDate(comment.createdAt),
    author: toCommentAuthor(comment.author),
  };
}

function toNoteCommentData(comment: NoteDetailRecord["comments"][number]): NoteCommentData {
  return {
    ...toCommentReplyData(comment),
    replyCount: comment._count.replies,
    // Prisma 为了取“最近回复”按倒序查询；页面展示时反转为时间正序，阅读更自然。
    replies: comment.replies.map(toCommentReplyData).reverse(),
  };
}

function toNoteDetail(
  note: NoteDetailRecord,
  viewCount: number,
  viewerState: { hasLiked: boolean; hasFavorited: boolean },
  commentLimit: number,
): NoteDetailData {
  const card = toNoteCard({
    ...note,
    images: note.images.slice(0, 1),
    viewCount,
  });
  const commentPage = createCursorPage(note.comments.map(toNoteCommentData), {
    limit: commentLimit,
    getCursor: (comment) => comment.id,
  });

  return {
    ...card,
    content: note.content,
    images: note.images.length
      ? note.images.map((image) => ({
          url: image.url,
          alt: image.alt ?? note.title,
        }))
      : [{ url: DEFAULT_NOTE_IMAGE, alt: note.title }],
    viewerHasLiked: viewerState.hasLiked,
    viewerHasFavorited: viewerState.hasFavorited,
    commentsList: commentPage.items,
    commentsPageInfo: commentPage.pageInfo,
  };
}

export async function getHomeFeedNotes(options: { limit?: number } = {}) {
  await connection();

  const limit = options.limit ?? 24;

  return withDatabaseFallback(
    async () => {
      // 首页 Feed 只展示已发布内容。当前按发布时间倒序，后续推荐流可以在
      // 这个入口接入 Redis 候选池、推荐分排序或个性化过滤。
      const notes = await db.note.findMany({
        where: {
          status: NoteStatus.PUBLISHED,
        },
        include: noteCardInclude,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: limit,
      });

      return notes.map(toNoteCard);
    },
    () => getFixtureNotes().slice(0, limit),
  );
}

export async function searchPublishedNotes(
  query: string | undefined,
  options: { limit?: number } = {},
) {
  await connection();

  const keyword = query?.trim();
  const limit = options.limit ?? 24;

  return withDatabaseFallback(
    async () => {
      // 第一版搜索覆盖标题、正文、作者和标签，保持查询结果仍然只返回公开内容。
      // 后续生活搜索可以在这里替换为全文索引、pgvector 语义召回或搜索服务。
      const notes = await db.note.findMany({
        where: {
          status: NoteStatus.PUBLISHED,
          ...(keyword
            ? {
                OR: [
                  { title: { contains: keyword, mode: "insensitive" } },
                  { content: { contains: keyword, mode: "insensitive" } },
                  { author: { name: { contains: keyword, mode: "insensitive" } } },
                  { author: { handle: { contains: keyword, mode: "insensitive" } } },
                  {
                    tags: {
                      some: {
                        tag: {
                          name: { contains: keyword, mode: "insensitive" },
                        },
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        include: noteCardInclude,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: limit,
      });

      return notes.map(toNoteCard);
    },
    () => {
      const fixtureNotes = getFixtureNotes();

      if (!keyword) {
        return fixtureNotes.slice(0, limit);
      }

      return fixtureNotes.filter((note) => {
        const searchText = [
          note.title,
          note.excerpt,
          note.author.name,
          note.author.handle,
          ...note.tags,
        ]
          .join(" ")
          .toLowerCase();

        return searchText.includes(keyword.toLowerCase());
      }).slice(0, limit);
    },
  );
}

export async function getPublishedNoteDetail(
  noteIdOrSlug: string,
  options: { commentCursor?: string; commentLimit?: number; viewerId?: string } = {},
) {
  await connection();
  const commentLimit = clampCommentPageSize(options.commentLimit);

  return withDatabaseFallback(
    async () => {
      // 详情页允许用 id 或 slug 打开，但只展示已发布笔记，隐藏/草稿不对外暴露。
      const loadNote = (commentCursor?: string) =>
        db.note.findFirst({
          where: {
            status: NoteStatus.PUBLISHED,
            OR: [{ id: noteIdOrSlug }, { slug: noteIdOrSlug }],
          },
          include: createNoteDetailInclude({
            commentCursor,
            commentLimit,
          }),
        });

      let note: Awaited<ReturnType<typeof loadNote>>;

      try {
        note = await loadNote(options.commentCursor);
      } catch (error) {
        if (!options.commentCursor || !isPrismaRecordNotFound(error)) {
          throw error;
        }

        // 用户可能复制了过期的 commentCursor，或者手写了不存在的 cursor。
        // 这种情况不应该让详情页 500，直接回退到最新评论页即可。
        note = await loadNote();
      }

      if (!note) {
        return null;
      }

      // MVP 阶段直接递增浏览量。进入公开测试前应替换为 Redis 聚合或去重计数，
      // 避免热点笔记每次访问都产生数据库写入竞争。
      const [updated, viewerLike, viewerFavorite] = await Promise.all([
        db.note.update({
          where: {
            id: note.id,
          },
          data: {
            viewCount: {
              increment: 1,
            },
          },
          select: {
            viewCount: true,
          },
        }),
        options.viewerId
          ? db.like.findUnique({
              where: {
                userId_noteId: {
                  userId: options.viewerId,
                  noteId: note.id,
                },
              },
              select: {
                noteId: true,
              },
            })
          : null,
        options.viewerId
          ? db.favorite.findUnique({
              where: {
                userId_noteId: {
                  userId: options.viewerId,
                  noteId: note.id,
                },
              },
              select: {
                noteId: true,
              },
            })
          : null,
      ]);

      return toNoteDetail(
        note,
        updated.viewCount,
        {
          hasLiked: Boolean(viewerLike),
          hasFavorited: Boolean(viewerFavorite),
        },
        commentLimit,
      );
    },
    () => {
      const note = demoNotes.find((item) => item.id === noteIdOrSlug);

      if (!note) {
        return null;
      }

      return {
        ...toFixtureNoteCard(note),
        content: note.excerpt,
        images: [{ url: note.imageUrl, alt: note.title }],
        viewerHasLiked: false,
        viewerHasFavorited: false,
        commentsList: [],
        commentsPageInfo: {
          limit: commentLimit,
          nextCursor: null,
          hasNextPage: false,
        },
      };
    },
  );
}

export async function getUserProfile(handle: string, options: { viewerId?: string } = {}) {
  await connection();

  return withDatabaseFallback(
    async () => {
      // 用户主页按 handle 查公开资料和已发布作品。后续作品增多后，这里需要
      // 改为 cursor pagination，避免一次拉取该用户全部笔记。
      const user = await db.user.findUnique({
        where: {
          handle,
        },
        include: {
          notes: {
            where: {
              status: NoteStatus.PUBLISHED,
            },
            include: noteCardInclude,
            orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          },
          _count: {
            select: {
              followers: true,
              following: true,
              notes: true,
            },
          },
        },
      });

      if (!user) {
        return null;
      }

      const isSelf = options.viewerId === user.id;
      const follow = options.viewerId
        ? await db.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: options.viewerId,
                followingId: user.id,
              },
            },
            select: {
              followingId: true,
            },
          })
        : null;

      return {
        id: user.id,
        name: user.name,
        handle: user.handle,
        bio: user.bio ?? "分享城市灵感、生活方式和可执行的周末计划。",
        avatarUrl: user.avatarUrl ?? DEFAULT_AVATAR_URL,
        followerCount: user._count.followers,
        followingCount: user._count.following,
        noteCount: user._count.notes,
        isSelf,
        isFollowing: Boolean(follow),
        notes: user.notes.map(toNoteCard),
      };
    },
    () => {
      const notes = demoNotes.filter((note) => note.author.handle === handle);
      const firstNote = notes[0];

      if (!firstNote) {
        return null;
      }

      return {
        id: firstNote.author.handle,
        name: firstNote.author.name,
        handle: firstNote.author.handle,
        bio: "分享城市灵感、生活方式和可执行的周末计划。",
        avatarUrl: firstNote.author.avatarUrl,
        followerCount: 0,
        followingCount: 0,
        noteCount: notes.length,
        isSelf: false,
        isFollowing: false,
        notes: notes.map(toFixtureNoteCard),
      };
    },
  );
}

export async function getTrendingTopics(limit = 5) {
  await connection();

  return withDatabaseFallback(
    async () => {
      // 趋势话题当前用标签关联笔记数量近似热度；后续可叠加搜索量、曝光、
      // 互动增长和运营活动权重。
      const tags = await db.tag.findMany({
        select: {
          name: true,
          _count: {
            select: {
              notes: true,
            },
          },
        },
        orderBy: {
          notes: {
            _count: "desc",
          },
        },
        take: limit,
      });

      return tags.map((tag): TopicTrend => {
        const noteCount = tag._count.notes;

        return {
          name: tag.name,
          heat: noteCount * 1000,
          noteCount,
          growth: `${noteCount} 篇`,
        };
      });
    },
    () => getFixtureTopics(limit),
  );
}

export async function getAdminMetrics() {
  await connection();

  return withDatabaseFallback(
    async () => {
      // 后台看板读取实时 count，适合 MVP 和小规模试用。数据量变大后应改为
      // 定时聚合或缓存，避免管理员每次打开页面触发多次全局统计。
      const [userCount, publishedNoteCount, openReportCount, likeCount, favoriteCount, commentCount] =
        await Promise.all([
          db.user.count(),
          db.note.count({ where: { status: NoteStatus.PUBLISHED } }),
          db.report.count({
            where: {
              status: {
                in: [ReportStatus.OPEN, ReportStatus.REVIEWING],
              },
            },
          }),
          db.like.count(),
          db.favorite.count(),
          db.comment.count({
            where: {
              status: CommentStatus.VISIBLE,
            },
          }),
        ]);

      const interactionCount = likeCount + favoriteCount + commentCount;

      return [
        { label: "用户总数", value: formatInteger(userCount), delta: "实时" },
        { label: "已发布笔记", value: formatInteger(publishedNoteCount), delta: "实时" },
        { label: "待审举报", value: formatInteger(openReportCount), delta: "实时" },
        { label: "互动总数", value: formatInteger(interactionCount), delta: "实时" },
      ] satisfies AdminMetric[];
    },
    () => fixtureAdminMetrics,
  );
}

export async function getAdminNotes() {
  await connection();

  return withDatabaseFallback(
    async () => {
      // 笔记管理页展示最近更新内容，管理员后续在这里处理隐藏、归档、恢复
      // 和推荐分巡检。写操作必须另走带审计日志的管理服务。
      const notes = await db.note.findMany({
        include: noteCardInclude,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 50,
      });

      return notes.map((note): AdminNoteRow => {
        const interactions = note._count.likes + note._count.favorites + note._count.comments;

        return {
          id: note.id,
          title: note.title,
          authorName: note.author.name,
          status: note.status,
          score: calculateNoteScore(note),
          interactions,
          views: note.viewCount,
          updatedAt: formatDate(note.updatedAt),
        };
      });
    },
    () =>
      demoNotes.map((note): AdminNoteRow => ({
        id: note.id,
        title: note.title,
        authorName: note.author.name,
        status: NoteStatus.PUBLISHED,
        score: note.score,
        interactions: note.likes + note.favorites + note.comments,
        views: note.views,
        updatedAt: note.createdAt,
      })),
  );
}

function getReportTarget(report: {
  targetType: ReportTargetType;
  note: { title: string } | null;
  comment: { content: string; status: CommentStatus } | null;
  reportedUser: { name: string; handle: string } | null;
}) {
  if (report.targetType === ReportTargetType.NOTE && report.note) {
    return report.note.title;
  }

  if (report.targetType === ReportTargetType.COMMENT && report.comment) {
    const statusLabel =
      report.comment.status === CommentStatus.VISIBLE ? "" : `（${report.comment.status}）`;

    return `${truncateText(report.comment.content, 32)}${statusLabel}`;
  }

  if (report.targetType === ReportTargetType.USER && report.reportedUser) {
    return `${report.reportedUser.name} (@${report.reportedUser.handle})`;
  }

  return report.targetType;
}

export async function getAdminReports(limit = 50) {
  await connection();

  return withDatabaseFallback(
    async () => {
      // 举报列表把不同目标类型统一压成一行展示数据，方便后台队列先跑起来；
      // 详情、状态流转和处理历史后续应拆到独立治理服务。
      const reports = await db.report.findMany({
        include: {
          reporter: {
            select: {
              name: true,
            },
          },
          note: {
            select: {
              title: true,
            },
          },
          comment: {
            select: {
              id: true,
              content: true,
              status: true,
            },
          },
          reportedUser: {
            select: {
              name: true,
              handle: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: limit,
      });

      return reports.map((report): AdminReportRow => ({
        id: report.id,
        commentId: report.comment?.id ?? null,
        detail: report.detail,
        resolution: report.resolution,
        target: getReportTarget(report),
        targetType: report.targetType,
        reporterName: report.reporter.name,
        reason: report.reason,
        status: report.status,
        createdAt: formatDate(report.createdAt),
      }));
    },
    () =>
      fixtureModerationQueue.slice(0, limit).map((report): AdminReportRow => ({
        commentId: null,
        detail: null,
        id: report.id,
        resolution: null,
        target: report.target,
        targetType: ReportTargetType.NOTE,
        reporterName: "Fixture",
        reason: report.reason,
        status: report.status,
        createdAt: "示例数据",
      })),
  );
}

export async function getAdminUsers() {
  await connection();

  return withDatabaseFallback(
    async () => {
      // 用户管理页先聚合账号角色、内容贡献和被举报数量。封禁、角色变更等
      // 修改类操作后续必须集中校验权限并写入 AdminAuditLog。
      const users = await db.user.findMany({
        include: {
          _count: {
            select: {
              notes: true,
              followers: true,
              following: true,
              reportsReceived: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 50,
      });

      return users.map((user): AdminUserRow => ({
        id: user.id,
        name: user.name,
        handle: user.handle,
        role: user.role,
        noteCount: user._count.notes,
        followerCount: user._count.followers,
        followingCount: user._count.following,
        reportCount: user._count.reportsReceived,
        createdAt: formatDate(user.createdAt),
      }));
    },
    () => {
      const users = new Map<string, (typeof demoNotes)[number]["author"]>();

      for (const note of demoNotes) {
        users.set(note.author.handle, note.author);
      }

      return Array.from(users.values()).map((user): AdminUserRow => ({
        id: user.handle,
        name: user.name,
        handle: user.handle,
        role: "USER",
        noteCount: demoNotes.filter((note) => note.author.handle === user.handle).length,
        followerCount: 0,
        followingCount: 0,
        reportCount: 0,
        createdAt: "示例数据",
      }));
    },
  );
}
