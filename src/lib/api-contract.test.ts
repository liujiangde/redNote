import assert from "node:assert/strict";
import test from "node:test";

import { createCursorPage, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, parseCursorPagination } from "./api-contract";

test("parseCursorPagination uses defaults when params are omitted", () => {
  const result = parseCursorPagination(new URLSearchParams());

  assert.deepEqual(result, {
    ok: true,
    value: {
      cursor: undefined,
      limit: DEFAULT_PAGE_SIZE,
    },
  });
});

test("parseCursorPagination coerces and validates limit", () => {
  const valid = parseCursorPagination(new URLSearchParams({ cursor: "note_1", limit: "12" }));
  const invalid = parseCursorPagination(new URLSearchParams({ limit: String(MAX_PAGE_SIZE + 1) }));

  assert.deepEqual(valid, {
    ok: true,
    value: {
      cursor: "note_1",
      limit: 12,
    },
  });
  assert.equal(invalid.ok, false);
});

test("createCursorPage exposes only visible items and next cursor", () => {
  const page = createCursorPage(
    [
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ],
    {
      getCursor: (item) => item.id,
      limit: 2,
    },
  );

  assert.deepEqual(page, {
    items: [{ id: "a" }, { id: "b" }],
    pageInfo: {
      hasNextPage: true,
      limit: 2,
      nextCursor: "b",
    },
  });
});
