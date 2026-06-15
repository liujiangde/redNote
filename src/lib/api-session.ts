import { AuthorizationError, requireUserSession } from "@/lib/auth-boundary";

export async function getApiSession() {
  // 当前 M3.1 API 先复用 Web NextAuth session。
  // M8 移动端接入 token/session refresh 时，可以只替换这个认证入口。
  try {
    return await requireUserSession();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return null;
    }

    throw error;
  }
}
