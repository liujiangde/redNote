import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function LoginPage() {
  // 当前页面只渲染登录表单。真实登录要在客户端提交到 NextAuth，
  // 服务端 authorize 会校验邮箱、密码和用户角色，并把最小身份写入 session。
  return (
    <main className="grid min-h-screen place-items-center bg-stone-50 px-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">登录 RedNote</h1>
        <p className="mt-2 text-sm text-slate-500">使用种子账号或后续注册账号进入内容社区。</p>
        <form className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">邮箱</span>
            <input
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              defaultValue="admin@rednote.local"
              type="email"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">密码</span>
            <input
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              defaultValue="rednote123"
              type="password"
            />
          </label>
          <Button className="w-full">登录</Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          没有账号？
          <Link className="font-semibold text-rose-700" href="/register">
            注册
          </Link>
        </p>
      </section>
    </main>
  );
}
