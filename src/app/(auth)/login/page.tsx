import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    email?: string;
    registered?: string;
  }>;
}) {
  const { callbackUrl, email, registered } = await searchParams;

  // 当前页面只渲染登录表单。真实登录要在客户端提交到 NextAuth，
  // 服务端 authorize 会校验邮箱、密码和用户角色，并把最小身份写入 session。
  return (
    <main className="grid min-h-screen place-items-center bg-stone-50 px-4">
      <LoginForm
        callbackUrl={callbackUrl ?? "/"}
        defaultEmail={email ?? "admin@rednote.local"}
        registered={registered === "1"}
      />
    </main>
  );
}
