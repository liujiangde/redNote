import NextAuth from "next-auth";

import { authOptions } from "@/lib/auth";

// NextAuth 的 GET/POST 统一交给 authOptions 处理：
// GET 负责会话/CSRF 等读取流程，POST 负责 credentials 登录提交。
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
