export const supportedLocales = ["zh-CN", "en-US"] as const;
export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = "zh-CN";

export const messages = {
  "zh-CN": {
    common: {
      appName: "RedNote",
      loading: "加载中",
      empty: "暂无数据",
      retry: "重试",
    },
    navigation: {
      home: "发现",
      search: "搜索",
      publish: "发布",
      admin: "后台",
      profile: "我的",
    },
    auth: {
      login: "登录",
      register: "注册",
      email: "邮箱",
      password: "密码",
    },
    publish: {
      title: "发布图文笔记",
      draft: "保存草稿",
      submit: "发布",
    },
    status: {
      draft: "草稿",
      published: "已发布",
      hidden: "已隐藏",
      archived: "已归档",
    },
  },
  "en-US": {
    common: {
      appName: "RedNote",
      loading: "Loading",
      empty: "No data",
      retry: "Retry",
    },
    navigation: {
      home: "Discover",
      search: "Search",
      publish: "Publish",
      admin: "Admin",
      profile: "Profile",
    },
    auth: {
      login: "Log in",
      register: "Sign up",
      email: "Email",
      password: "Password",
    },
    publish: {
      title: "Publish a note",
      draft: "Save draft",
      submit: "Publish",
    },
    status: {
      draft: "Draft",
      published: "Published",
      hidden: "Hidden",
      archived: "Archived",
    },
  },
} as const;

// i18n 先做轻量骨架：新增页面应从 messages/formatter 取文案和格式化逻辑。
// 真正的 /zh-CN、/en-US 路由迁移放到 M7，避免 M2 继续扩大硬编码中文范围。
export function isSupportedLocale(locale: string | undefined): locale is Locale {
  return Boolean(locale && supportedLocales.includes(locale as Locale));
}

export function resolveLocale(locale: string | undefined): Locale {
  return isSupportedLocale(locale) ? locale : defaultLocale;
}

export function getMessages(locale: string | undefined) {
  return messages[resolveLocale(locale)];
}

export function formatNumber(value: number, locale: string | undefined = defaultLocale) {
  return new Intl.NumberFormat(resolveLocale(locale)).format(value);
}

export function formatDate(
  value: Date,
  locale: string | undefined = defaultLocale,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) {
  return new Intl.DateTimeFormat(resolveLocale(locale), options).format(value);
}
