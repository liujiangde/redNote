import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeSensitiveContentLines,
  findSensitiveCommentTerms,
  findSensitiveNoteTerms,
  getSensitiveContentDictionary,
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

test("findSensitiveCommentTerms detects zero-width character bypasses", () => {
  const terms = withEnv({ COMMENT_SENSITIVE_TERMS: undefined }, () =>
    findSensitiveCommentTerms("想加\u200b微\u200d信了解"),
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

test("getSensitiveContentDictionary exposes configured dictionary source", () => {
  const dictionary = withEnv({ COMMENT_SENSITIVE_TERMS: "广告,导流, 广告" }, () =>
    getSensitiveContentDictionary("comment"),
  );

  assert.deepEqual(dictionary, {
    source: "env",
    terms: ["广告", "导流"],
  });
});

test("getSensitiveContentDictionary supports pasted multiline dictionaries", () => {
  const dictionary = withEnv({ COMMENT_SENSITIVE_TERMS: "广告，导流\n站外交易;广告；刷量" }, () =>
    getSensitiveContentDictionary("comment"),
  );

  assert.deepEqual(dictionary, {
    source: "env",
    terms: ["广告", "导流", "站外交易", "刷量"],
  });
});

test("analyzeSensitiveContentLines returns per-line matches", () => {
  const results = withEnv({ COMMENT_SENSITIVE_TERMS: "广告,导流" }, () =>
    analyzeSensitiveContentLines("第一条正常\n第二条包含导流\n\n第三条广告", "comment"),
  );

  assert.deepEqual(results, [
    {
      lineNumber: 1,
      terms: [],
      text: "第一条正常",
    },
    {
      lineNumber: 2,
      terms: ["导流"],
      text: "第二条包含导流",
    },
    {
      lineNumber: 4,
      terms: ["广告"],
      text: "第三条广告",
    },
  ]);
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
