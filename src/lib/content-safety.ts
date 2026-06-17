export type SensitiveContentScope = "comment" | "note";

export type SensitiveContentLineResult = {
  lineNumber: number;
  terms: string[];
  text: string;
};

const DEFAULT_SENSITIVE_TERMS = [
  "博彩",
  "赌博",
  "代刷",
  "刷赞",
  "刷粉",
  "裸聊",
  "色情",
  "诈骗",
  "加微信",
  "加vx",
  "vx",
];

function normalizeText(value: string) {
  // 敏感词检查先去掉空白和零宽字符再小写化，避免“加 微 信”这类简单拆字绕过。
  // 这只是 M3.1 基础拦截，后续 M5 应替换为可运营词库和更完整的审核服务。
  return value
    .trim()
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, "")
    .toLowerCase();
}

function parseConfiguredTerms(value: string | undefined) {
  const terms = value
    ?.split(/[,\n，;；]+/)
    .map((term) => term.trim())
    .filter(Boolean);

  return terms ? Array.from(new Set(terms)) : undefined;
}

function getConfiguredSensitiveTerms(scope: SensitiveContentScope) {
  // 生产环境可以通过 COMMENT_SENSITIVE_TERMS / NOTE_SENSITIVE_TERMS 覆盖不同场景词库，
  // 格式为逗号分隔。默认词库让本地和 CI 不依赖外部配置也有基础内容安全能力。
  return getSensitiveContentDictionary(scope).terms;
}

export function getSensitiveContentDictionary(scope: SensitiveContentScope) {
  const configuredTerms = parseConfiguredTerms(
    scope === "comment" ? process.env.COMMENT_SENSITIVE_TERMS : process.env.NOTE_SENSITIVE_TERMS,
  );

  if (configuredTerms?.length) {
    return {
      source: "env",
      terms: configuredTerms,
    } as const;
  }

  return {
    source: "default",
    terms: DEFAULT_SENSITIVE_TERMS,
  } as const;
}

export function findSensitiveContentTerms(content: string, scope: SensitiveContentScope) {
  const normalizedContent = normalizeText(content);

  // 返回命中的词只用于内部判断和调试，不直接暴露给普通用户，避免帮助绕过规则。
  return getConfiguredSensitiveTerms(scope).filter((term) => {
    const normalizedTerm = normalizeText(term);

    return normalizedTerm.length > 0 && normalizedContent.includes(normalizedTerm);
  });
}

export function analyzeSensitiveContentLines(content: string, scope: SensitiveContentScope) {
  return content
    .split(/\r?\n/)
    .map((line, index) => ({
      lineNumber: index + 1,
      text: line.trim(),
    }))
    .filter((line) => line.text.length > 0)
    .map((line): SensitiveContentLineResult => ({
      ...line,
      terms: findSensitiveContentTerms(line.text, scope),
    }));
}

export function findSensitiveCommentTerms(content: string) {
  return findSensitiveContentTerms(content, "comment");
}

export function findSensitiveNoteTerms({
  content,
  tags,
  title,
}: {
  content: string;
  tags?: string;
  title: string;
}) {
  return findSensitiveContentTerms(`${title}\n${content}\n${tags ?? ""}`, "note");
}

export function hasSensitiveCommentTerms(content: string) {
  return findSensitiveCommentTerms(content).length > 0;
}

export function hasSensitiveNoteTerms(input: { content: string; tags?: string; title: string }) {
  return findSensitiveNoteTerms(input).length > 0;
}
