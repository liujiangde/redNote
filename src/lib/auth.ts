import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";

import { db } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Web 端认证流程：
// 1. Credentials Provider 接收登录表单的邮箱和密码。
// 2. 只在服务端查询用户并校验 passwordHash，不把密码相关字段写入 session。
// 3. JWT/session 只保留页面授权需要的 id、handle、role，后续保护 /publish 和 /admin 时复用。
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // 先做结构化校验，再查数据库；这样无效输入不会进入密码校验流程。
        const parsed = credentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        });

        if (!user) {
          return null;
        }

        // 密码校验失败和用户不存在都返回 null，避免向客户端暴露账号枚举信息。
        const isValidPassword = await compare(parsed.data.password, user.passwordHash);

        if (!isValidPassword) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
          handle: user.handle,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // 登录成功时把业务身份写入 token，之后服务端权限判断不用重复查用户表。
        token.id = user.id;
        token.handle = user.handle;
        token.role = user.role;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        // 页面组件只拿最小可用身份字段；管理员权限仍应在服务端二次校验。
        session.user.id = token.id;
        session.user.handle = token.handle;
        session.user.role = token.role;
      }

      return session;
    },
  },
};
