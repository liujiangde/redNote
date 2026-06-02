// Temporary UI fixture data. Keep this small and deterministic until the pages
// are migrated to Prisma-backed queries.
export type DemoNote = {
  id: string;
  title: string;
  excerpt: string;
  imageUrl: string;
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

export const demoNotes: DemoNote[] = [
  {
    id: "n1",
    title: "周末一个人去的安静咖啡店",
    excerpt: "靠窗座位很适合写计划，下午四点的光线刚好。收藏了三家适合阅读和低声聊天的店。",
    imageUrl:
      "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=80",
    author: {
      name: "阿岚",
      handle: "alan",
      avatarUrl:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
    },
    tags: ["城市漫游", "咖啡", "周末"],
    likes: 1284,
    favorites: 632,
    comments: 88,
    views: 18400,
    score: 92,
    createdAt: "今天 14:20",
  },
  {
    id: "n2",
    title: "新手友好的 7 天轻食备餐",
    excerpt: "用可复用的基础食材做变化，早餐、午餐和加餐都覆盖，预算控制在 260 元以内。",
    imageUrl:
      "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=80",
    author: {
      name: "芋圆",
      handle: "taro",
      avatarUrl:
        "https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=200&q=80",
    },
    tags: ["轻食", "自律", "备餐"],
    likes: 905,
    favorites: 714,
    comments: 61,
    views: 12100,
    score: 88,
    createdAt: "昨天 21:08",
  },
  {
    id: "n3",
    title: "上海一日摄影路线",
    excerpt: "从老码头到苏州河，按光线顺序安排机位，适合 35mm 镜头和手机拍摄。",
    imageUrl:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
    author: {
      name: "南桥",
      handle: "nanqiao",
      avatarUrl:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
    },
    tags: ["摄影", "上海", "路线"],
    likes: 1688,
    favorites: 941,
    comments: 124,
    views: 24600,
    score: 95,
    createdAt: "2 天前",
  },
];

export const topicTrends = [
  { name: "城市漫游", growth: "+24%", heat: 9860 },
  { name: "低成本改造", growth: "+18%", heat: 8120 },
  { name: "新手健身", growth: "+13%", heat: 7340 },
  { name: "通勤穿搭", growth: "+9%", heat: 6550 },
];

export const adminMetrics = [
  { label: "新增用户", value: "1,248", delta: "+12.4%" },
  { label: "新增笔记", value: "486", delta: "+8.2%" },
  { label: "待审举报", value: "23", delta: "-6.1%" },
  { label: "搜索转化", value: "38.7%", delta: "+3.5%" },
];

export const moderationQueue = [
  { id: "r1", target: "周末一个人去的安静咖啡店", reason: "疑似广告", status: "OPEN" },
  { id: "r2", target: "7 天轻食备餐", reason: "健康建议需复核", status: "REVIEWING" },
  { id: "r3", target: "上海一日摄影路线", reason: "图片版权", status: "OPEN" },
];
