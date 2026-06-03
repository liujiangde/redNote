import { z } from "zod";

export const API_VERSION = "v1";
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

export const apiErrorCodes = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ApiErrorCode = (typeof apiErrorCodes)[keyof typeof apiErrorCodes];

export type ApiSuccess<T> = {
  ok: true;
  version: typeof API_VERSION;
  data: T;
};

export type ApiFailure = {
  ok: false;
  version: typeof API_VERSION;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type PageInfo = {
  limit: number;
  nextCursor: string | null;
  hasNextPage: boolean;
};

export type CursorPage<T> = {
  items: T[];
  pageInfo: PageInfo;
};

const paginationSchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

// 跨端 API 的统一响应 envelope。Web Route Handler、未来移动端 BFF 和测试都应
// 复用这里的结构，避免每个接口各自定义 ok/error/pageInfo 字段。
export function apiSuccess<T>(data: T, init?: ResponseInit) {
  return Response.json(
    {
      ok: true,
      version: API_VERSION,
      data,
    } satisfies ApiSuccess<T>,
    init,
  );
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  init?: ResponseInit & { details?: unknown },
) {
  const { details, ...responseInit } = init ?? {};

  return Response.json(
    {
      ok: false,
      version: API_VERSION,
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    } satisfies ApiFailure,
    {
      status: responseInit.status ?? 500,
      ...responseInit,
    },
  );
}

export function parseCursorPagination(searchParams: URLSearchParams) {
  const parsed = paginationSchema.safeParse({
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.flatten().fieldErrors,
    };
  }

  return {
    ok: true as const,
    value: parsed.data,
  };
}

export function createCursorPage<T>(
  items: T[],
  options: {
    limit: number;
    getCursor: (item: T) => string;
  },
): CursorPage<T> {
  const visibleItems = items.slice(0, options.limit);
  const hasNextPage = items.length > options.limit;
  const lastItem = visibleItems.at(-1);

  return {
    items: visibleItems,
    pageInfo: {
      limit: options.limit,
      nextCursor: hasNextPage && lastItem ? options.getCursor(lastItem) : null,
      hasNextPage,
    },
  };
}
