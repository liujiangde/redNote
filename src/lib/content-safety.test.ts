import assert from "node:assert/strict";
import test from "node:test";

import {
  findSensitiveCommentTerms,
  findSensitiveNoteTerms,
  hasSensitiveNoteTerms,
} from "./content-safety";

function withEnv<T>(values: Record<string, string | undefined>, run: () => T) {
  const previousValues = Object.fromEntries(
    Object.keys(values).map((name) => [name, process.env[name]]),
  );

  try {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }

    return run();
  } finally {
    for (const [name, value] of Object.entries(previousValues)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

test("findSensitiveCommentTerms detects simple whitespace bypasses", () => {
  const terms = withEnv({ COMMENT_SENSITIVE_TERMS: undefined }, () =>
    findSensitiveCommentTerms("想加 微 信了解"),
  );

  assert.deepEqual(terms, ["加微信"]);
});

test("findSensitiveNoteTerms uses the note-specific configured dictionary", () => {
  const terms = withEnv({ NOTE_SENSITIVE_TERMS: "引流词,站外交易" }, () =>
    findSensitiveNoteTerms({
      content: "这是一篇普通正文，但包含站外交易提示。",
      tags: "生活",
      title: "周末记录",
    }),
  );

  assert.deepEqual(terms, ["站外交易"]);
});

test("hasSensitiveNoteTerms falls back to default terms when no note dictionary is configured", () => {
  const result = withEnv({ NOTE_SENSITIVE_TERMS: undefined }, () =>
    hasSensitiveNoteTerms({
      content: "不要相信诈骗信息",
      title: "安全提醒",
    }),
  );

  assert.equal(result, true);
});
