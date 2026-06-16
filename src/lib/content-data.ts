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
import { createEmbedding } from "@/lib/ai/embeddings";
import { getOptionalRedisClient } from "@/lib/cache";
import { db } from "@/lib/db";
import {
  adminMetrics as fixtureAdminMetrics,
  demoNotes,
  moderationQueue as fixtureModerationQueue,
  topicTrends as fixtureTopicTrends,
} from "@/lib/mock-data";
import { clampRecommendationSignal, scoreRecommendation } from "@/lib/recommendation";
import { formatPgVector } from "@/lib/vector";

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
const DEFAULT_CANDIDATE_POOL_SIZE = 120;
const DEFAULT_SIMILAR_NOTE_LIMIT = 3;
const DEFAULT_PROFILE_RECOMMENDATION_LIMIT = 3;
const SIMILAR_NOTE_CANDIDATE_POOL_SIZE = 48;
const SEARCH_SEMANTIC_RECALL_LIMIT = 40;
const SEARCH_DISCOVERY_LIMIT = 8;
const SEARCH_HISTORY_LIMIT = 8;
const SEARCH_REDIS_TTL_SECONDS = 60 * 60 * 24 * 14;
const SEARCH_CACHE_TTL_SECONDS = 60 * 5;
const FEED_CANDIDATE_CACHE_TTL_SECONDS = 60;
const FEED_CANDIDATE_CACHE_KEY = "rednote:feed:candidates:v1";
const SEARCH_HOT_KEY = "rednote:search:hot:v1";
const SEARCH_CLICK_KEY = "rednote:search:clicks:v1";
const SEARCH_CLICK_DETAIL_KEY = "rednote:search:clicks:details:v1";
const SEARCH_TOPIC_CACHE_KEY = "rednote:search:topics:v1";

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
  recommendationReason?: string;
};

export type SearchNoteData = NoteCardData & {
  matchReasons: string[];
  semanticScore?: number;
};

export type SearchDiscoveryItem = {
  label: string;
  href: string;
  source: "history" | "hot" | "topic";
  heat?: number;
};

export type SearchSuggestion = {
  label: string;
  href: string;
  type: "note" | "topic" | "user";
  description: string;
};

export type SearchCategorySummary = {
  type: "notes" | "topics" | "users";
  label: string;
  count: number;
  samples: string[];
};

export type SearchDiscoveryData = {
  categories: SearchCategorySummary[];
  history: SearchDiscoveryItem[];
  hotSearches: SearchDiscoveryItem[];
  suggestions: SearchSuggestion[];
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

export type AdminReportAuditLog = {
  id: string;
  action: string;
  actorName: string;
  actorHandle: string;
  metadata: string | null;
  createdAt: string;
};

export type AdminAuditLogRow = AdminReportAuditLog & {
  entityId: string;
  entityType: string;
};

export type AdminAuditLogFilters = {
  entityType?: string;
  limit?: number;
};

export type AdminReportDetail = AdminReportRow & {
  auditLogs: AdminReportAuditLog[];
  comment: {
    id: string;
    authorName: string;
    authorHandle: string;
    content: string;
    noteHref: string | null;
    noteTitle: string | null;
    status: string;
    createdAt: string;
  } | null;
  note: {
    id: string;
    authorName: string;
    authorHandle: string;
    content: string;
    href: string;
    status: string;
    title: string;
  } | null;
  reportedUser: {
    id: string;
    handle: string;
    name: string;
    role: string;
    createdAt: string;
  } | null;
  reporterEmail: string;
  reporterHandle: string;
  targetHref: string | null;
  updatedAt: string;
};

export type AdminUserRow = {
  id: string;
  name: string;
  handle: string;
  role: string;
  status: string;
  noteCount: number;
  followerCount: number;
  followingCount: number;
  reportCount: number;
  createdAt: string;
};

function formatInteger(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatPercentage(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return "0%";
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
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

function normalizeSearchQuery(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").slice(0, 48) ?? "";
}

function createSearchHref(query: string) {
  return `/search?q=${encodeURIComponent(query)}`;
}

function createSearchItem(
  label: string,
  source: SearchDiscoveryItem["source"],
  heat?: number,
): SearchDiscoveryItem {
  return {
    label,
    href: createSearchHref(label),
    source,
    ...(heat === undefined ? {} : { heat }),
  };
}

function dedupeByLabel<T extends { label: string }>(items: T[], limit: number) {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const key = normalizeSearchText(item.label);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);

    if (deduped.length >= limit) {
      break;
    }
  }

  return deduped;
}

async function readJsonCache<T>(key: string) {
  const client = await getOptionalRedisClient();

  if (!client) {
    return null;
  }

  const rawValue = await client.get(key);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

async function writeJsonCache(key: string, value: unknown, ttlSeconds = SEARCH_CACHE_TTL_SECONDS) {
  const client = await getOptionalRedisClient();

  if (!client) {
    return;
  }

  await client.setEx(key, ttlSeconds, JSON.stringify(value));
}

type RecommendationContext = {
  followingIds: Set<string>;
  preferredTags: Set<string>;
};

type FeedCandidateData = NoteCardData & {
  authorId: string;
  createdAtMs: number;
  engagementRaw: number;
  publishedAtMs: number;
};

type SearchMatchSource = {
  authorHandle: string;
  authorName: string;
  body: string;
  tags: string[];
  title: string;
};

type SemanticSearchRow = {
  id: string;
  semanticScore: number | string;
};

type SearchAnalyticsSummary = {
  clickCount: number;
  hotTermCount: number;
  searchCount: number;
};

function normalizeSearchText(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function getNoteTimestamp(note: Pick<NoteCardRecord, "createdAt" | "publishedAt">) {
  return (note.publishedAt ?? note.createdAt).getTime();
}

function calculateEngagementRaw(note: Pick<NoteCardRecord, "viewCount" | "_count">) {
  // 收藏比点赞更能表达长期兴趣，评论比浏览更能表达参与度，所以权重更高。
  return (
    note._count.favorites * 4 +
    note._count.likes * 3 +
    note._count.comments * 2 +
    note.viewCount / 500
  );
}

function calculateFreshnessSignal(note: Pick<NoteCardRecord, "createdAt" | "publishedAt">) {
  const ageDays = Math.max(0, (Date.now() - getNoteTimestamp(note)) / 86_400_000);

  // 30 天内的新内容有递减加成，超过 30 天后仍可凭互动和标签排序胜出。
  return Math.max(0, Math.min(1, 1 - ageDays / 30));
}

function calculateTagAffinity(note: NoteCardRecord, preferredTags: Set<string>) {
  const noteTags = note.tags.map((item) => item.tag.name.toLowerCase());

  return calculateTagAffinityForTags(noteTags, preferredTags);
}

function calculateTagAffinityForTags(noteTags: string[], preferredTags: Set<string>) {
  const normalizedTags = noteTags.map((tag) => tag.toLowerCase());

  if (!preferredTags.size) {
    return 0.5;
  }

  const overlapCount = normalizedTags.filter((tag) => preferredTags.has(tag)).length;

  return Math.min(1, overlapCount / Math.min(3, preferredTags.size));
}

function explainRecommendation(signal: {
  engagement: number;
  followedAuthor: number;
  freshness: number;
  tagMatch: number;
}) {
  if (signal.followedAuthor > 0) {
    return "关注作者";
  }

  if (signal.tagMatch >= 0.34) {
    return "兴趣标签";
  }

  if (signal.engagement >= 0.65) {
    return "高互动";
  }

  if (signal.freshness >= 0.7) {
    return "近期发布";
  }

  return "综合推荐";
}

function calculateRecommendationForNote({
  context,
  maxEngagement,
  note,
  semanticSimilarity = 0.5,
}: {
  context: RecommendationContext;
  maxEngagement: number;
  note: NoteCardRecord;
  semanticSimilarity?: number;
}) {
  const signal = {
    semanticSimilarity,
    tagMatch: calculateTagAffinity(note, context.preferredTags),
    engagement: maxEngagement > 0 ? calculateEngagementRaw(note) / maxEngagement : 0,
    freshness: calculateFreshnessSignal(note),
    followedAuthor: context.followingIds.has(note.authorId) ? 1 : 0,
  };

  return {
    reason: explainRecommendation(signal),
    score: scoreRecommendation(signal),
    signal,
  };
}

async function getViewerRecommendationContext(
  viewerId: string | undefined,
): Promise<RecommendationContext> {
  if (!viewerId) {
    return {
      followingIds: new Set(),
      preferredTags: new Set(),
    };
  }

  // M4.1 的用户兴趣画像先从关注、点赞、收藏中轻量推导。
  // 后续有曝光/停留日志后，应迁移到独立画像或推荐特征服务。
  const [follows, interactedNotes] = await Promise.all([
    db.follow.findMany({
      where: {
        followerId: viewerId,
      },
      select: {
        followingId: true,
      },
    }),
    db.note.findMany({
      where: {
        status: NoteStatus.PUBLISHED,
        OR: [
          {
            likes: {
              some: {
                userId: viewerId,
              },
            },
          },
          {
            favorites: {
              some: {
                userId: viewerId,
              },
            },
          },
        ],
      },
      select: {
        tags: {
          include: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      take: 30,
    }),
  ]);

  return {
    followingIds: new Set(follows.map((follow) => follow.followingId)),
    preferredTags: new Set(
      interactedNotes.flatMap((note) => note.tags.map((item) => item.tag.name.toLowerCase())),
    ),
  };
}

function sliceAfterCursor<T extends { id: string }>(
  items: T[],
  cursor: string | undefined,
  limit: number,
) {
  if (!cursor) {
    return items.slice(0, limit);
  }

  const cursorIndex = items.findIndex((item) => item.id === cursor);

  if (cursorIndex < 0) {
    return [];
  }

  return items.slice(cursorIndex + 1, cursorIndex + 1 + limit);
}

function calculateRecommendationForFeedCandidate({
  candidate,
  context,
  maxEngagement,
}: {
  candidate: FeedCandidateData;
  context: RecommendationContext;
  maxEngagement: number;
}) {
  const signal = {
    semanticSimilarity: 0.5,
    tagMatch: calculateTagAffinityForTags(candidate.tags, context.preferredTags),
    engagement: maxEngagement > 0 ? candidate.engagementRaw / maxEngagement : 0,
    freshness: calculateFreshnessSignal({
      createdAt: new Date(candidate.createdAtMs),
      publishedAt: new Date(candidate.publishedAtMs),
    }),
    followedAuthor: context.followingIds.has(candidate.authorId) ? 1 : 0,
  };

  return {
    reason: explainRecommendation(signal),
    score: scoreRecommendation(signal),
    signal,
  };
}

function rankFeedCandidateData(candidates: FeedCandidateData[], context: RecommendationContext) {
  const maxEngagement = Math.max(...candidates.map((candidate) => candidate.engagementRaw), 1);

  return candidates
    .map((candidate) => {
      const card: NoteCardData = {
        author: candidate.author,
        comments: candidate.comments,
        createdAt: candidate.createdAt,
        excerpt: candidate.excerpt,
        favorites: candidate.favorites,
        id: candidate.id,
        imageAlt: candidate.imageAlt,
        imageUrl: candidate.imageUrl,
        likes: candidate.likes,
        score: candidate.score,
        tags: candidate.tags,
        title: candidate.title,
        views: candidate.views,
      };
      const recommendation = calculateRecommendationForFeedCandidate({
        candidate,
        context,
        maxEngagement,
      });

      return {
        data: {
          ...card,
          recommendationReason: recommendation.reason,
          score: Math.round(recommendation.score * 100),
        },
        publishedAt: candidate.publishedAtMs || candidate.createdAtMs,
        recommendationScore: recommendation.score,
      };
    })
    .sort(
      (left, right) =>
        right.recommendationScore - left.recommendationScore ||
        right.publishedAt - left.publishedAt ||
        left.data.id.localeCompare(right.data.id),
    )
    .map((item) => item.data);
}

function filterFeedCandidates(candidates: FeedCandidateData[], viewerFilter: ViewerContentFilter) {
  return candidates.filter(
    (candidate) =>
      !viewerFilter.hiddenAuthorIds.includes(candidate.authorId) &&
      !viewerFilter.dismissedNoteIds.includes(candidate.id),
  );
}

function hasViewerContentFilter(filter: ViewerContentFilter) {
  return filter.hiddenAuthorIds.length > 0 || filter.dismissedNoteIds.length > 0;
}

function rankSimilarNoteCandidates({
  authorId,
  notes,
  tagNames,
}: {
  authorId: string;
  notes: NoteCardRecord[];
  tagNames: string[];
}) {
  const tagSet = new Set(tagNames.map((tag) => tag.toLowerCase()));
  const maxEngagement = Math.max(...notes.map(calculateEngagementRaw), 1);

  return notes
    .map((note) => {
      const matchedTags = note.tags
        .map((item) => item.tag.name)
        .filter((tag) => tagSet.has(tag.toLowerCase()));
      const sameAuthor = note.authorId === authorId;
      const engagement = calculateEngagementRaw(note) / maxEngagement;
      const score =
        matchedTags.length * 100 +
        (sameAuthor ? 25 : 0) +
        engagement * 20 +
        calculateFreshnessSignal(note) * 10;

      return {
        data: {
          ...toNoteCard(note),
          recommendationReason: matchedTags.length
            ? `相似标签：${matchedTags.slice(0, 2).join("、")}`
            : sameAuthor
              ? "同作者"
              : "近期热门",
        },
        publishedAt: getNoteTimestamp(note),
        score,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.publishedAt - left.publishedAt ||
        left.data.id.localeCompare(right.data.id),
    )
    .map((item) => item.data);
}

function getSearchMatchSource(note: NoteCardRecord): SearchMatchSource {
  return {
    authorHandle: note.author.handle,
    authorName: note.author.name,
    body: note.content,
    tags: note.tags.map((item) => item.tag.name),
    title: note.title,
  };
}

function getCardSearchMatchSource(note: NoteCardData): SearchMatchSource {
  return {
    authorHandle: note.author.handle,
    authorName: note.author.name,
    body: note.excerpt,
    tags: note.tags,
    title: note.title,
  };
}

function calculateKeywordScore(source: SearchMatchSource, keyword: string | undefined) {
  const normalizedKeyword = normalizeSearchText(keyword);

  if (!normalizedKeyword) {
    return 0;
  }

  let score = 0;

  if (normalizeSearchText(source.title).includes(normalizedKeyword)) {
    score += 4;
  }

  if (normalizeSearchText(source.body).includes(normalizedKeyword)) {
    score += 2;
  }

  if (
    normalizeSearchText(source.authorName).includes(normalizedKeyword) ||
    normalizeSearchText(source.authorHandle).includes(normalizedKeyword)
  ) {
    score += 1;
  }

  score +=
    source.tags.filter((tag) => normalizeSearchText(tag).includes(normalizedKeyword)).length * 3;

  return score;
}

function getSearchMatchReasons({
  keyword,
  semanticScore = 0,
  source,
}: {
  keyword: string | undefined;
  semanticScore?: number;
  source: SearchMatchSource;
}) {
  const normalizedKeyword = normalizeSearchText(keyword);
  const reasons: string[] = [];

  if (normalizedKeyword) {
    if (normalizeSearchText(source.title).includes(normalizedKeyword)) {
      reasons.push("标题命中");
    }

    if (normalizeSearchText(source.body).includes(normalizedKeyword)) {
      reasons.push("正文命中");
    }

    const matchedTags = source.tags.filter((tag) =>
      normalizeSearchText(tag).includes(normalizedKeyword),
    );

    if (matchedTags.length) {
      reasons.push(`标签命中：${matchedTags.slice(0, 2).join("、")}`);
    }

    if (
      normalizeSearchText(source.authorName).includes(normalizedKeyword) ||
      normalizeSearchText(source.authorHandle).includes(normalizedKeyword)
    ) {
      reasons.push("作者命中");
    }
  }

  if (semanticScore >= 0.65) {
    reasons.push("语义相似");
  }

  if (!reasons.length) {
    reasons.push(normalizedKeyword ? "综合召回" : "综合推荐");
  }

  return reasons.slice(0, 3);
}

function summarizeError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return { message: String(error) };
  }

  return {
    code: "code" in error ? String(error.code) : undefined,
    message: "message" in error ? String(error.message) : undefined,
    name: "name" in error ? String(error.name) : undefined,
  };
}

async function getSemanticSearchScores({
  keyword,
  limit,
  viewerFilter,
}: {
  keyword: string | undefined;
  limit: number;
  viewerFilter: ViewerContentFilter;
}) {
  const normalizedKeyword = keyword?.trim();

  if (!normalizedKeyword) {
    return new Map<string, number>();
  }

  try {
    const embedding = await createEmbedding(normalizedKeyword);
    const rows = await db.$queryRawUnsafe<SemanticSearchRow[]>(
      `SELECT n."id", (1 - (ne."embedding" <=> $1::vector)) AS "semanticScore"
       FROM "note_embeddings" ne
       INNER JOIN "notes" n ON n."id" = ne."note_id"
       WHERE n."status" = 'PUBLISHED'
         AND (cardinality($2::text[]) = 0 OR n."author_id" <> ALL($2::text[]))
         AND (cardinality($3::text[]) = 0 OR n."id" <> ALL($3::text[]))
       ORDER BY ne."embedding" <=> $1::vector
       LIMIT $4`,
      formatPgVector(embedding),
      viewerFilter.hiddenAuthorIds,
      viewerFilter.dismissedNoteIds,
      limit,
    );

    return new Map(
      rows.map((row) => [row.id, clampRecommendationSignal(Number(row.semanticScore))]),
    );
  } catch (error) {
    // pgvector、数据库或 embedding 服务不可用时，搜索仍然保留关键词召回。
    // 这让本地开发不被外部服务阻塞，生产环境则应监控语义召回失败率。
    console.warn("[search] Semantic recall failed; falling back to keyword search.", {
      ...summarizeError(error),
      keywordLength: normalizedKeyword.length,
      limit,
    });
    return new Map<string, number>();
  }
}

function buildSearchWhere({
  keyword,
  semanticIds,
  viewerFilter,
}: {
  keyword: string | undefined;
  semanticIds: string[];
  viewerFilter: ViewerContentFilter;
}): Prisma.NoteWhereInput {
  const normalizedKeyword = keyword?.trim();
  const recallClauses: Prisma.NoteWhereInput[] = [];

  if (normalizedKeyword) {
    recallClauses.push(
      { title: { contains: normalizedKeyword, mode: "insensitive" } },
      { content: { contains: normalizedKeyword, mode: "insensitive" } },
      { author: { name: { contains: normalizedKeyword, mode: "insensitive" } } },
      { author: { handle: { contains: normalizedKeyword, mode: "insensitive" } } },
      {
        tags: {
          some: {
            tag: {
              name: { contains: normalizedKeyword, mode: "insensitive" },
            },
          },
        },
      },
    );
  }

  if (semanticIds.length) {
    recallClauses.push({
      id: {
        in: semanticIds,
      },
    });
  }

  return {
    ...createViewerNoteWhere(viewerFilter),
    status: NoteStatus.PUBLISHED,
    ...(recallClauses.length ? { OR: recallClauses } : {}),
  };
}

function rankSearchCandidates({
  context,
  keyword,
  notes,
  semanticScores,
}: {
  context: RecommendationContext;
  keyword: string | undefined;
  notes: NoteCardRecord[];
  semanticScores: Map<string, number>;
}) {
  const maxEngagement = Math.max(...notes.map(calculateEngagementRaw), 1);

  return notes
    .map((note) => {
      const semanticScore = semanticScores.get(note.id) ?? 0;
      const recommendation = calculateRecommendationForNote({
        context,
        maxEngagement,
        note,
        semanticSimilarity: semanticScore || 0.5,
      });
      const source = getSearchMatchSource(note);
      const keywordScore = calculateKeywordScore(source, keyword);

      return {
        data: {
          ...toNoteCard(note),
          matchReasons: getSearchMatchReasons({
            keyword,
            semanticScore,
            source,
          }),
          recommendationReason: recommendation.reason,
          semanticScore: semanticScore ? Number(semanticScore.toFixed(3)) : undefined,
        } satisfies SearchNoteData,
        publishedAt: getNoteTimestamp(note),
        rankingScore: keywordScore * 4 + semanticScore * 3 + recommendation.score,
      };
    })
    .sort(
      (left, right) =>
        right.rankingScore - left.rankingScore ||
        right.publishedAt - left.publishedAt ||
        left.data.id.localeCompare(right.data.id),
    )
    .map((item) => item.data);
}

function getSearchHistoryKey(viewerId: string) {
  return `rednote:search:history:user:${viewerId}:v1`;
}

async function readSearchHistory(viewerId: string | undefined, limit: number) {
  if (!viewerId) {
    return [];
  }

  const client = await getOptionalRedisClient();

  if (!client) {
    return [];
  }

  const queries = await client.lRange(getSearchHistoryKey(viewerId), 0, limit - 1);

  return dedupeByLabel(
    queries.map((query) => createSearchItem(query, "history")),
    limit,
  );
}

async function readHotSearches(limit: number) {
  const client = await getOptionalRedisClient();
  const redisItems = client
    ? await client.zRangeWithScores(SEARCH_HOT_KEY, 0, limit - 1, {
        REV: true,
      })
    : [];

  if (redisItems.length >= limit) {
    return redisItems.map((item) => createSearchItem(item.value, "hot", item.score));
  }

  const topicItems = (await getTrendingTopics(limit)).map((topic) =>
    createSearchItem(topic.name, "topic", topic.heat),
  );

  return dedupeByLabel(
    [
      ...redisItems.map((item) => createSearchItem(item.value, "hot", item.score)),
      ...topicItems,
    ],
    limit,
  );
}

function sumRedisScores(items: Array<{ score: number }>) {
  return items.reduce((total, item) => total + item.score, 0);
}

async function readSearchAnalyticsSummary(): Promise<SearchAnalyticsSummary | null> {
  const client = await getOptionalRedisClient();

  if (!client) {
    return null;
  }

  try {
    const [searchItems, clickItems] = await Promise.all([
      client.zRangeWithScores(SEARCH_HOT_KEY, 0, -1),
      client.zRangeWithScores(SEARCH_CLICK_KEY, 0, -1),
    ]);

    return {
      clickCount: sumRedisScores(clickItems),
      hotTermCount: searchItems.length,
      searchCount: sumRedisScores(searchItems),
    };
  } catch {
    return null;
  }
}

async function getSearchSuggestionsFromDatabase({
  keyword,
  limit,
  viewerFilter,
}: {
  keyword: string;
  limit: number;
  viewerFilter: ViewerContentFilter;
}) {
  if (!keyword) {
    return [];
  }

  const [tags, users, notes] = await Promise.all([
    db.tag.findMany({
      where: {
        name: {
          contains: keyword,
          mode: "insensitive",
        },
      },
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
    }),
    db.user.findMany({
      where: {
        notes: {
          some: {
            status: NoteStatus.PUBLISHED,
          },
        },
        OR: [
          {
            name: {
              contains: keyword,
              mode: "insensitive",
            },
          },
          {
            handle: {
              contains: keyword,
              mode: "insensitive",
            },
          },
        ],
      },
      select: {
        handle: true,
        name: true,
        _count: {
          select: {
            notes: {
              where: {
                status: NoteStatus.PUBLISHED,
              },
            },
          },
        },
      },
      take: limit,
    }),
    db.note.findMany({
      where: {
        ...createViewerNoteWhere(viewerFilter),
        status: NoteStatus.PUBLISHED,
        OR: [
          { title: { contains: keyword, mode: "insensitive" } },
          { content: { contains: keyword, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        title: true,
        author: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    }),
  ]);

  return dedupeByLabel<SearchSuggestion>(
    [
      ...tags.map((tag) => ({
        label: `#${tag.name}`,
        href: createSearchHref(tag.name),
        type: "topic" as const,
        description: `${tag._count.notes} 篇相关笔记`,
      })),
      ...users.map((user) => ({
        label: `@${user.handle}`,
        href: `/users/${user.handle}`,
        type: "user" as const,
        description: `${user.name} · ${user._count.notes} 篇笔记`,
      })),
      ...notes.map((note) => ({
        label: note.title,
        href: `/notes/${note.id}`,
        type: "note" as const,
        description: `来自 ${note.author.name}`,
      })),
    ],
    limit,
  );
}

async function getSearchCategoriesFromDatabase({
  keyword,
  viewerFilter,
}: {
  keyword: string;
  viewerFilter: ViewerContentFilter;
}) {
  if (!keyword) {
    return [];
  }

  const [noteCount, topicCount, userCount, sampleNotes, sampleTags, sampleUsers] =
    await Promise.all([
      db.note.count({
        where: buildSearchWhere({
          keyword,
          semanticIds: [],
          viewerFilter,
        }),
      }),
      db.tag.count({
        where: {
          name: {
            contains: keyword,
            mode: "insensitive",
          },
        },
      }),
      db.user.count({
        where: {
          notes: {
            some: {
              status: NoteStatus.PUBLISHED,
            },
          },
          OR: [
            {
              name: {
                contains: keyword,
                mode: "insensitive",
              },
            },
            {
              handle: {
                contains: keyword,
                mode: "insensitive",
              },
            },
          ],
        },
      }),
      db.note.findMany({
        where: buildSearchWhere({
          keyword,
          semanticIds: [],
          viewerFilter,
        }),
        select: {
          title: true,
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 3,
      }),
      db.tag.findMany({
        where: {
          name: {
            contains: keyword,
            mode: "insensitive",
          },
        },
        select: {
          name: true,
        },
        take: 3,
      }),
      db.user.findMany({
        where: {
          notes: {
            some: {
              status: NoteStatus.PUBLISHED,
            },
          },
          OR: [
            {
              name: {
                contains: keyword,
                mode: "insensitive",
              },
            },
            {
              handle: {
                contains: keyword,
                mode: "insensitive",
              },
            },
          ],
        },
        select: {
          handle: true,
          name: true,
        },
        take: 3,
      }),
    ]);

  return [
    {
      type: "notes" as const,
      label: "笔记",
      count: noteCount,
      samples: sampleNotes.map((note) => note.title),
    },
    {
      type: "topics" as const,
      label: "话题",
      count: topicCount,
      samples: sampleTags.map((tag) => `#${tag.name}`),
    },
    {
      type: "users" as const,
      label: "用户",
      count: userCount,
      samples: sampleUsers.map((user) => `${user.name} @${user.handle}`),
    },
  ];
}

function getFixtureSearchDiscovery({
  keyword,
  limit,
}: {
  keyword: string;
  limit: number;
}): SearchDiscoveryData {
  const fixtureNotes = getFixtureNotes();
  const fixtureTopics = getFixtureTopics(limit);
  const normalizedKeyword = normalizeSearchText(keyword);
  const matchedNotes = normalizedKeyword
    ? fixtureNotes.filter((note) => {
        const source = getCardSearchMatchSource(note);
        return [source.title, source.body, source.authorName, source.authorHandle, ...source.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalizedKeyword);
      })
    : fixtureNotes;
  const matchedTopics = fixtureTopics.filter((topic) =>
    normalizeSearchText(topic.name).includes(normalizedKeyword),
  );
  const matchedUsers = fixtureNotes.filter((note) =>
    [note.author.name, note.author.handle].some((item) =>
      normalizeSearchText(item).includes(normalizedKeyword),
    ),
  );

  return {
    history: [],
    hotSearches: fixtureTopics.map((topic) => createSearchItem(topic.name, "topic", topic.heat)),
    suggestions: dedupeByLabel<SearchSuggestion>(
      [
        ...matchedTopics.map((topic) => ({
          label: `#${topic.name}`,
          href: createSearchHref(topic.name),
          type: "topic" as const,
          description: topic.growth,
        })),
        ...matchedUsers.map((note) => ({
          label: `@${note.author.handle}`,
          href: `/users/${note.author.handle}`,
          type: "user" as const,
          description: note.author.name,
        })),
        ...matchedNotes.map((note) => ({
          label: note.title,
          href: `/notes/${note.id}`,
          type: "note" as const,
          description: note.author.name,
        })),
      ],
      limit,
    ),
    categories: keyword
      ? [
          {
            type: "notes",
            label: "笔记",
            count: matchedNotes.length,
            samples: matchedNotes.slice(0, 3).map((note) => note.title),
          },
          {
            type: "topics",
            label: "话题",
            count: matchedTopics.length,
            samples: matchedTopics.slice(0, 3).map((topic) => `#${topic.name}`),
          },
          {
            type: "users",
            label: "用户",
            count: matchedUsers.length,
            samples: matchedUsers
              .slice(0, 3)
              .map((note) => `${note.author.name} @${note.author.handle}`),
          },
        ]
      : [],
  };
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

async function withDatabaseFallback<T>(query: () => Promise<T>, fallback: () => T | Promise<T>) {
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

type ViewerContentFilter = {
  dismissedNoteIds: string[];
  hiddenAuthorIds: string[];
};

async function getViewerContentFilter(viewerId: string | undefined): Promise<ViewerContentFilter> {
  // viewerId 为空代表游客访问，游客只能应用“公开内容”过滤，不能应用个人屏蔽/不感兴趣。
  if (!viewerId) {
    return {
      dismissedNoteIds: [],
      hiddenAuthorIds: [],
    };
  }

  // 屏蔽关系按双向处理：你屏蔽的人、屏蔽你的人，都不再出现在公共发现链路里。
  // 不感兴趣只过滤具体笔记，后续推荐系统可以把它作为负反馈信号。
  const [blocks, dismissals] = await Promise.all([
    db.userBlock.findMany({
      where: {
        OR: [
          {
            blockedId: viewerId,
          },
          {
            blockerId: viewerId,
          },
        ],
      },
      select: {
        blockedId: true,
        blockerId: true,
      },
    }),
    db.noteDismissal.findMany({
      where: {
        userId: viewerId,
      },
      select: {
        noteId: true,
      },
    }),
  ]);

  return {
    dismissedNoteIds: dismissals.map((dismissal) => dismissal.noteId),
    hiddenAuthorIds: blocks.map((block) =>
      block.blockerId === viewerId ? block.blockedId : block.blockerId,
    ),
  };
}

function createViewerNoteWhere(filter: ViewerContentFilter): Prisma.NoteWhereInput {
  // Prisma 的 where 需要对象拼装。这里把“屏蔽作者”和“不感兴趣笔记”
  // 转成统一 AND 条件，Feed、搜索、详情和主页作品列表都复用同一口径。
  const clauses: Prisma.NoteWhereInput[] = [];

  if (filter.hiddenAuthorIds.length) {
    clauses.push({
      authorId: {
        notIn: filter.hiddenAuthorIds,
      },
    });
  }

  if (filter.dismissedNoteIds.length) {
    clauses.push({
      id: {
        notIn: filter.dismissedNoteIds,
      },
    });
  }

  return clauses.length ? { AND: clauses } : {};
}

async function getViewerBlockState(viewerId: string | undefined, targetUserId: string) {
  // 用户主页需要区分两个方向：
  // - viewerBlocksTarget：我屏蔽了对方，页面仍可打开，方便取消屏蔽。
  // - targetBlocksViewer：对方屏蔽了我，页面直接不可见。
  if (!viewerId || viewerId === targetUserId) {
    return {
      targetBlocksViewer: false,
      viewerBlocksTarget: false,
    };
  }

  const blocks = await db.userBlock.findMany({
    where: {
      OR: [
        {
          blockedId: targetUserId,
          blockerId: viewerId,
        },
        {
          blockedId: viewerId,
          blockerId: targetUserId,
        },
      ],
    },
    select: {
      blockedId: true,
      blockerId: true,
    },
  });

  return {
    targetBlocksViewer: blocks.some(
      (block) => block.blockerId === targetUserId && block.blockedId === viewerId,
    ),
    viewerBlocksTarget: blocks.some(
      (block) => block.blockerId === viewerId && block.blockedId === targetUserId,
    ),
  };
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

  // 数据库字段通常是 normalized 结构，页面需要扁平 DTO。
  // 这里统一补默认图、默认头像、截断摘要和互动计数，页面组件就不用了解 Prisma include。
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

function toFeedCandidateData(note: NoteCardRecord): FeedCandidateData {
  return {
    ...toNoteCard(note),
    authorId: note.authorId,
    createdAtMs: note.createdAt.getTime(),
    engagementRaw: calculateEngagementRaw(note),
    publishedAtMs: getNoteTimestamp(note),
  };
}

function getFeedCandidateCacheKey(poolSize: number) {
  return `${FEED_CANDIDATE_CACHE_KEY}:${poolSize}`;
}

async function readFeedCandidatePoolFromDatabase(poolSize: number, viewerFilter?: ViewerContentFilter) {
  const notes = await db.note.findMany({
    where: {
      ...(viewerFilter ? createViewerNoteWhere(viewerFilter) : {}),
      status: NoteStatus.PUBLISHED,
    },
    include: noteCardInclude,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: poolSize,
  });

  return notes.map(toFeedCandidateData);
}

async function getCachedFeedCandidatePool(poolSize: number) {
  if (poolSize !== DEFAULT_CANDIDATE_POOL_SIZE) {
    return readFeedCandidatePoolFromDatabase(poolSize);
  }

  const cacheKey = getFeedCandidateCacheKey(poolSize);
  const cachedCandidates = await readJsonCache<FeedCandidateData[]>(cacheKey);

  if (cachedCandidates?.length) {
    return cachedCandidates;
  }

  const candidates = await readFeedCandidatePoolFromDatabase(poolSize);
  await writeJsonCache(cacheKey, candidates, FEED_CANDIDATE_CACHE_TTL_SECONDS);

  return candidates;
}

export async function invalidateFeedCandidateCache() {
  const client = await getOptionalRedisClient();

  if (!client) {
    return;
  }

  await client.del(getFeedCandidateCacheKey(DEFAULT_CANDIDATE_POOL_SIZE));
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
  // 详情页 DTO 在卡片基础上增加完整正文、图片列表、当前用户互动状态和评论分页。
  // 这样 NoteDetailPage 只负责布局，不直接读取 Prisma relation。
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

export async function getHomeFeedNotes(
  options: { cursor?: string; limit?: number; viewerId?: string } = {},
) {
  await connection();

  const limit = options.limit ?? 24;

  return withDatabaseFallback(
    async () => {
      const [viewerFilter, recommendationContext] = await Promise.all([
        getViewerContentFilter(options.viewerId),
        getViewerRecommendationContext(options.viewerId),
      ]);
      const poolSize = Math.max(DEFAULT_CANDIDATE_POOL_SIZE, limit * 4);
      const publicCandidates = await getCachedFeedCandidatePool(poolSize);
      let candidates = filterFeedCandidates(publicCandidates, viewerFilter);

      // 公共候选池命中后仍要保证个人过滤不缩短列表。用户屏蔽/不感兴趣很多时，
      // 回源读取一次带过滤候选，避免缓存池前 120 条被过滤后看不到后续内容。
      if (hasViewerContentFilter(viewerFilter) && candidates.length < limit) {
        candidates = await readFeedCandidatePoolFromDatabase(poolSize, viewerFilter);
      }

      return sliceAfterCursor(
        rankFeedCandidateData(candidates, recommendationContext),
        options.cursor,
        limit,
      );
    },
    () =>
      sliceAfterCursor(
        getFixtureNotes().map((note) => ({
          ...note,
          recommendationReason: "综合推荐",
        })),
        options.cursor,
        limit,
      ),
  );
}

export async function searchPublishedNotes(
  query: string | undefined,
  options: { cursor?: string; limit?: number; viewerId?: string } = {},
) {
  await connection();

  const keyword = query?.trim();
  const limit = options.limit ?? 24;

  return withDatabaseFallback(
    async () => {
      const [viewerFilter, recommendationContext] = await Promise.all([
        getViewerContentFilter(options.viewerId),
        getViewerRecommendationContext(options.viewerId),
      ]);
      const semanticScores = await getSemanticSearchScores({
        keyword,
        limit: SEARCH_SEMANTIC_RECALL_LIMIT,
        viewerFilter,
      });
      // M4.1 搜索先做“关键词召回 + pgvector 语义召回”的混合候选集。
      // 排序阶段再叠加关键词命中位置、语义相似度和轻量推荐分，并返回命中解释。
      const notes = await db.note.findMany({
        where: buildSearchWhere({
          keyword,
          semanticIds: [...semanticScores.keys()],
          viewerFilter,
        }),
        include: noteCardInclude,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: Math.max(DEFAULT_CANDIDATE_POOL_SIZE, limit * 4),
      });

      return sliceAfterCursor(
        rankSearchCandidates({
          context: recommendationContext,
          keyword,
          notes,
          semanticScores,
        }),
        options.cursor,
        limit,
      );
    },
    () => {
      const fixtureNotes = getFixtureNotes();
      const matchedNotes = !keyword
        ? fixtureNotes
        : fixtureNotes.filter((note) => {
            const source = getCardSearchMatchSource(note);
            const searchText = [
              source.title,
              source.body,
              source.authorName,
              source.authorHandle,
              ...source.tags,
            ]
              .join(" ")
              .toLowerCase();

            return searchText.includes(keyword.toLowerCase());
          });

      return sliceAfterCursor(
        matchedNotes.map((note) => {
          const source = getCardSearchMatchSource(note);

          return {
            ...note,
            matchReasons: getSearchMatchReasons({
              keyword,
              source,
            }),
            recommendationReason: "综合推荐",
          };
        }),
        options.cursor,
        limit,
      );
    },
  );
}

export async function recordSearchQuery(query: string | undefined, viewerId: string | undefined) {
  const keyword = normalizeSearchQuery(query);

  if (keyword.length < 2) {
    return;
  }

  const client = await getOptionalRedisClient();

  if (!client) {
    return;
  }

  // 搜索热词和个人历史是 M4.2 的轻量行为日志，不写数据库。
  // Redis 不可用时会直接跳过，搜索结果本身仍由 Prisma/fixture 返回。
  await client.zIncrBy(SEARCH_HOT_KEY, 1, keyword);
  await client.expire(SEARCH_HOT_KEY, SEARCH_REDIS_TTL_SECONDS);

  if (!viewerId) {
    return;
  }

  const historyKey = getSearchHistoryKey(viewerId);

  await client.lRem(historyKey, 0, keyword);
  await client.lPush(historyKey, keyword);
  await client.lTrim(historyKey, 0, SEARCH_HISTORY_LIMIT - 1);
  await client.expire(historyKey, SEARCH_REDIS_TTL_SECONDS);
}

export async function recordSearchResultClick(query: string | undefined, noteId: string | undefined) {
  const keyword = normalizeSearchQuery(query);
  const normalizedNoteId = noteId?.trim().slice(0, 96) ?? "";

  if (keyword.length < 2 || !normalizedNoteId) {
    return;
  }

  const client = await getOptionalRedisClient();

  if (!client) {
    return;
  }

  // 点击先用 Redis zset 做轻量行为日志，后续搜索转化率可用搜索量和点击量聚合计算。
  await client.zIncrBy(SEARCH_CLICK_KEY, 1, keyword);
  await client.zIncrBy(SEARCH_CLICK_DETAIL_KEY, 1, `${keyword}\t${normalizedNoteId}`);
  await client.expire(SEARCH_CLICK_KEY, SEARCH_REDIS_TTL_SECONDS);
  await client.expire(SEARCH_CLICK_DETAIL_KEY, SEARCH_REDIS_TTL_SECONDS);
}

export async function getSearchDiscovery(
  options: { limit?: number; query?: string; viewerId?: string } = {},
) {
  await connection();

  const keyword = normalizeSearchQuery(options.query);
  const limit = options.limit ?? SEARCH_DISCOVERY_LIMIT;

  return withDatabaseFallback<SearchDiscoveryData>(
    async () => {
      const viewerFilter = await getViewerContentFilter(options.viewerId);
      const [history, hotSearches, suggestions, categories] = await Promise.all([
        readSearchHistory(options.viewerId, SEARCH_HISTORY_LIMIT),
        readHotSearches(limit),
        getSearchSuggestionsFromDatabase({
          keyword,
          limit,
          viewerFilter,
        }),
        getSearchCategoriesFromDatabase({
          keyword,
          viewerFilter,
        }),
      ]);

      return {
        categories,
        history,
        hotSearches,
        suggestions,
      };
    },
    async () => {
      const fixture = getFixtureSearchDiscovery({
        keyword,
        limit,
      });
      const [history, hotSearches] = await Promise.all([
        readSearchHistory(options.viewerId, SEARCH_HISTORY_LIMIT),
        readHotSearches(limit),
      ]);

      return {
        ...fixture,
        history,
        hotSearches: hotSearches.length ? hotSearches : fixture.hotSearches,
      };
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
      const viewerFilter = await getViewerContentFilter(options.viewerId);
      // 详情页允许用 id 或 slug 打开，但只展示已发布笔记，隐藏/草稿不对外暴露。
      // 如果当前用户已把这篇笔记标为不感兴趣，或和作者存在屏蔽关系，这里会返回 null。
      const loadNote = (commentCursor?: string) =>
        db.note.findFirst({
          where: {
            ...createViewerNoteWhere(viewerFilter),
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

export async function getSimilarPublishedNotes(
  noteIdOrSlug: string,
  options: { limit?: number; viewerId?: string } = {},
) {
  await connection();

  const limit = options.limit ?? DEFAULT_SIMILAR_NOTE_LIMIT;

  return withDatabaseFallback(
    async () => {
      const viewerFilter = await getViewerContentFilter(options.viewerId);
      const note = await db.note.findFirst({
        where: {
          ...createViewerNoteWhere(viewerFilter),
          status: NoteStatus.PUBLISHED,
          OR: [{ id: noteIdOrSlug }, { slug: noteIdOrSlug }],
        },
        select: {
          authorId: true,
          id: true,
          tags: {
            include: {
              tag: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!note) {
        return [];
      }

      const tagNames = note.tags.map((item) => item.tag.name);
      const relatedClauses: Prisma.NoteWhereInput[] = [
        {
          authorId: note.authorId,
        },
      ];

      if (tagNames.length) {
        relatedClauses.unshift({
          tags: {
            some: {
              tag: {
                name: {
                  in: tagNames,
                },
              },
            },
          },
        });
      }

      let candidates = await db.note.findMany({
        where: {
          ...createViewerNoteWhere(viewerFilter),
          id: {
            not: note.id,
          },
          status: NoteStatus.PUBLISHED,
          OR: relatedClauses,
        },
        include: noteCardInclude,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: Math.max(SIMILAR_NOTE_CANDIDATE_POOL_SIZE, limit * 4),
      });

      if (candidates.length < limit) {
        const excludedIds = [note.id, ...candidates.map((candidate) => candidate.id)];
        const recentCandidates = await db.note.findMany({
          where: {
            ...createViewerNoteWhere(viewerFilter),
            id: {
              notIn: excludedIds,
            },
            status: NoteStatus.PUBLISHED,
          },
          include: noteCardInclude,
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          take: limit - candidates.length,
        });

        candidates = [...candidates, ...recentCandidates];
      }

      return rankSimilarNoteCandidates({
        authorId: note.authorId,
        notes: candidates,
        tagNames,
      }).slice(0, limit);
    },
    () => {
      const note = demoNotes.find((item) => item.id === noteIdOrSlug);

      if (!note) {
        return [];
      }

      const tagSet = new Set(note.tags.map((tag) => tag.toLowerCase()));

      return demoNotes
        .filter((item) => item.id !== note.id)
        .map((item) => ({
          data: {
            ...toFixtureNoteCard(item),
            recommendationReason: item.tags.some((tag) => tagSet.has(tag.toLowerCase()))
              ? "相似标签"
              : "近期热门",
          },
          score:
            item.tags.filter((tag) => tagSet.has(tag.toLowerCase())).length * 100 +
            item.score,
        }))
        .sort((left, right) => right.score - left.score)
        .map((item) => item.data)
        .slice(0, limit);
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
      const blockState = await getViewerBlockState(options.viewerId, user.id);

      if (!isSelf && blockState.targetBlocksViewer) {
        // 被对方屏蔽时，主页不可见；这和内容详情过滤保持一致。
        return null;
      }

      const viewerFilter = await getViewerContentFilter(isSelf ? undefined : options.viewerId);
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
        isBlockedByViewer: blockState.viewerBlocksTarget,
        isFollowing: blockState.viewerBlocksTarget ? false : Boolean(follow),
        notes: blockState.viewerBlocksTarget
          ? []
          : user.notes
              // 主页作品也尊重“不感兴趣”，但不按 hiddenAuthorIds 过滤当前主页作者，
              // 因为能进到这里说明没有被对方屏蔽，且用户可能需要查看主页后取消屏蔽。
              .filter((note) => !viewerFilter.dismissedNoteIds.includes(note.id))
              .map(toNoteCard),
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
        isBlockedByViewer: false,
        isFollowing: false,
        notes: notes.map(toFixtureNoteCard),
      };
    },
  );
}

export async function getUserProfileRecommendedNotes(
  handle: string,
  options: { limit?: number; viewerId?: string } = {},
) {
  await connection();

  const limit = options.limit ?? DEFAULT_PROFILE_RECOMMENDATION_LIMIT;

  return withDatabaseFallback(
    async () => {
      const user = await db.user.findUnique({
        where: {
          handle,
        },
        select: {
          id: true,
          notes: {
            where: {
              status: NoteStatus.PUBLISHED,
            },
            select: {
              tags: {
                include: {
                  tag: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!user) {
        return [];
      }

      const blockState = await getViewerBlockState(options.viewerId, user.id);

      if (blockState.targetBlocksViewer || blockState.viewerBlocksTarget) {
        return [];
      }

      const viewerFilter = await getViewerContentFilter(options.viewerId);
      const tagNames = Array.from(
        new Set(
          user.notes.flatMap((note) => note.tags.map((item) => item.tag.name)),
        ),
      );

      let candidates = await db.note.findMany({
        where: {
          ...createViewerNoteWhere(viewerFilter),
          authorId: {
            not: user.id,
          },
          status: NoteStatus.PUBLISHED,
          ...(tagNames.length
            ? {
                tags: {
                  some: {
                    tag: {
                      name: {
                        in: tagNames,
                      },
                    },
                  },
                },
              }
            : {}),
        },
        include: noteCardInclude,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: Math.max(SIMILAR_NOTE_CANDIDATE_POOL_SIZE, limit * 4),
      });

      if (candidates.length < limit) {
        const excludedIds = candidates.map((candidate) => candidate.id);
        const recentCandidates = await db.note.findMany({
          where: {
            ...createViewerNoteWhere(viewerFilter),
            authorId: {
              not: user.id,
            },
            ...(excludedIds.length
              ? {
                  id: {
                    notIn: excludedIds,
                  },
                }
              : {}),
            status: NoteStatus.PUBLISHED,
          },
          include: noteCardInclude,
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          take: limit - candidates.length,
        });

        candidates = [...candidates, ...recentCandidates];
      }

      return rankSimilarNoteCandidates({
        authorId: user.id,
        notes: candidates,
        tagNames,
      }).slice(0, limit);
    },
    () => {
      const notes = demoNotes.filter((note) => note.author.handle === handle);
      const tagSet = new Set(notes.flatMap((note) => note.tags.map((tag) => tag.toLowerCase())));

      return demoNotes
        .filter((note) => note.author.handle !== handle)
        .map((note) => ({
          data: {
            ...toFixtureNoteCard(note),
            recommendationReason: note.tags.some((tag) => tagSet.has(tag.toLowerCase()))
              ? "相似标签"
              : "近期热门",
          },
          score:
            note.tags.filter((tag) => tagSet.has(tag.toLowerCase())).length * 100 +
            note.score,
        }))
        .sort((left, right) => right.score - left.score)
        .map((item) => item.data)
        .slice(0, limit);
    },
  );
}

export async function getTrendingTopics(limit = 5) {
  await connection();

  return withDatabaseFallback(
    async () => {
      const cacheKey = `${SEARCH_TOPIC_CACHE_KEY}:${limit}`;
      const cachedTopics = await readJsonCache<TopicTrend[]>(cacheKey);

      if (cachedTopics) {
        return cachedTopics;
      }

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

      const topics = tags.map((tag): TopicTrend => {
        const noteCount = tag._count.notes;

        return {
          name: tag.name,
          heat: noteCount * 1000,
          noteCount,
          growth: `${noteCount} 篇`,
        };
      });

      await writeJsonCache(cacheKey, topics);

      return topics;
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
      const [
        userCount,
        publishedNoteCount,
        openReportCount,
        likeCount,
        favoriteCount,
        commentCount,
        searchAnalytics,
      ] = await Promise.all([
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
        readSearchAnalyticsSummary(),
      ]);

      const interactionCount = likeCount + favoriteCount + commentCount;
      const searchCount = searchAnalytics?.searchCount ?? 0;
      const clickCount = searchAnalytics?.clickCount ?? 0;
      const redisDelta = searchAnalytics === null ? "Redis 未连接" : "Redis";

      return [
        { label: "用户总数", value: formatInteger(userCount), delta: "实时" },
        { label: "已发布笔记", value: formatInteger(publishedNoteCount), delta: "实时" },
        { label: "待审举报", value: formatInteger(openReportCount), delta: "实时" },
        { label: "互动总数", value: formatInteger(interactionCount), delta: "实时" },
        {
          label: "搜索热词",
          value: formatInteger(searchAnalytics?.hotTermCount ?? 0),
          delta: redisDelta,
        },
        {
          label: "搜索点击率",
          value: formatPercentage(clickCount, searchCount),
          delta: `${formatInteger(clickCount)} / ${formatInteger(searchCount)}`,
        },
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
      // 举报列表把不同目标类型统一压成一行展示数据；详情页再读取目标信息和处理历史。
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

function stringifyAuditMetadata(metadata: Prisma.JsonValue | null) {
  if (metadata === null) {
    return null;
  }

  return JSON.stringify(metadata);
}

export async function getAdminReportDetail(reportId: string): Promise<AdminReportDetail | null> {
  await connection();

  return withDatabaseFallback<AdminReportDetail | null>(
    async () => {
      const report = await db.report.findUnique({
        where: {
          id: reportId,
        },
        include: {
          reporter: {
            select: {
              email: true,
              handle: true,
              name: true,
            },
          },
          note: {
            select: {
              author: {
                select: {
                  handle: true,
                  name: true,
                },
              },
              content: true,
              id: true,
              slug: true,
              status: true,
              title: true,
            },
          },
          comment: {
            select: {
              author: {
                select: {
                  handle: true,
                  name: true,
                },
              },
              content: true,
              createdAt: true,
              id: true,
              note: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                },
              },
              status: true,
            },
          },
          reportedUser: {
            select: {
              createdAt: true,
              handle: true,
              id: true,
              name: true,
              role: true,
            },
          },
        },
      });

      if (!report) {
        return null;
      }

      const auditLogs = await db.adminAuditLog.findMany({
        where: {
          entityId: report.id,
          entityType: "REPORT",
        },
        include: {
          actor: {
            select: {
              handle: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      });
      const targetHref =
        report.targetType === ReportTargetType.NOTE && report.note
          ? `/notes/${report.note.slug || report.note.id}`
          : report.targetType === ReportTargetType.COMMENT && report.comment?.note
            ? `/notes/${report.comment.note.slug || report.comment.note.id}`
            : report.targetType === ReportTargetType.USER && report.reportedUser
              ? `/users/${report.reportedUser.handle}`
              : null;

      return {
        auditLogs: auditLogs.map((log) => ({
          action: log.action,
          actorHandle: log.actor?.handle ?? "system",
          actorName: log.actor?.name ?? "System",
          createdAt: formatDate(log.createdAt),
          id: log.id,
          metadata: stringifyAuditMetadata(log.metadata),
        })),
        comment: report.comment
          ? {
              authorHandle: report.comment.author.handle,
              authorName: report.comment.author.name,
              content: report.comment.content,
              createdAt: formatDate(report.comment.createdAt),
              id: report.comment.id,
              noteHref: report.comment.note
                ? `/notes/${report.comment.note.slug || report.comment.note.id}`
                : null,
              noteTitle: report.comment.note?.title ?? null,
              status: report.comment.status,
            }
          : null,
        commentId: report.comment?.id ?? null,
        createdAt: formatDate(report.createdAt),
        detail: report.detail,
        id: report.id,
        note: report.note
          ? {
              authorHandle: report.note.author.handle,
              authorName: report.note.author.name,
              content: truncateText(report.note.content, 180),
              href: `/notes/${report.note.slug || report.note.id}`,
              id: report.note.id,
              status: report.note.status,
              title: report.note.title,
            }
          : null,
        reason: report.reason,
        reportedUser: report.reportedUser
          ? {
              createdAt: formatDate(report.reportedUser.createdAt),
              handle: report.reportedUser.handle,
              id: report.reportedUser.id,
              name: report.reportedUser.name,
              role: report.reportedUser.role,
            }
          : null,
        reporterEmail: report.reporter.email,
        reporterHandle: report.reporter.handle,
        reporterName: report.reporter.name,
        resolution: report.resolution,
        status: report.status,
        target: getReportTarget(report),
        targetHref,
        targetType: report.targetType,
        updatedAt: formatDate(report.updatedAt),
      };
    },
    () => {
      const report = fixtureModerationQueue.find((item) => item.id === reportId);

      if (!report) {
        return null;
      }

      return {
        auditLogs: [],
        comment: null,
        commentId: null,
        createdAt: "示例数据",
        detail: null,
        id: report.id,
        note: null,
        reason: report.reason,
        reportedUser: null,
        reporterEmail: "fixture@example.com",
        reporterHandle: "fixture",
        reporterName: "Fixture",
        resolution: null,
        status: report.status,
        target: report.target,
        targetHref: null,
        targetType: ReportTargetType.NOTE,
        updatedAt: "示例数据",
      };
    },
  );
}

export async function getAdminAuditLogs({ entityType, limit = 80 }: AdminAuditLogFilters = {}) {
  await connection();

  return withDatabaseFallback<AdminAuditLogRow[]>(
    async () => {
      const logs = await db.adminAuditLog.findMany({
        where: entityType
          ? {
              entityType,
            }
          : undefined,
        include: {
          actor: {
            select: {
              handle: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
      });

      return logs.map((log): AdminAuditLogRow => ({
        action: log.action,
        actorHandle: log.actor?.handle ?? "system",
        actorName: log.actor?.name ?? "System",
        createdAt: formatDate(log.createdAt),
        entityId: log.entityId,
        entityType: log.entityType,
        id: log.id,
        metadata: stringifyAuditMetadata(log.metadata),
      }));
    },
    () => [],
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
        status: user.status,
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
        status: "ACTIVE",
        noteCount: demoNotes.filter((note) => note.author.handle === user.handle).length,
        followerCount: 0,
        followingCount: 0,
        reportCount: 0,
        createdAt: "示例数据",
      }));
    },
  );
}
