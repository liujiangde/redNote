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
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function getConfiguredSensitiveTerms() {
  // 生产环境可以通过 COMMENT_SENSITIVE_TERMS 覆盖，格式为逗号分隔。
  // 这里保留默认词库是为了让本地和 CI 不依赖外部配置也有基础内容安全能力。
  const configuredTerms = process.env.COMMENT_SENSITIVE_TERMS?.split(",")
    .map((term) => term.trim())
    .filter(Boolean);

  return configuredTerms?.length ? configuredTerms : DEFAULT_SENSITIVE_TERMS;
}

export function findSensitiveCommentTerms(content: string) {
  const normalizedContent = normalizeText(content);

  return getConfiguredSensitiveTerms().filter((term) => {
    const normalizedTerm = normalizeText(term);

    return normalizedTerm.length > 0 && normalizedContent.includes(normalizedTerm);
  });
}

export function hasSensitiveCommentTerms(content: string) {
  return findSensitiveCommentTerms(content).length > 0;
}
