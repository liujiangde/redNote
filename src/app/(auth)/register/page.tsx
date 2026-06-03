import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  // 当前页面只渲染注册表单。M2 接入时需要服务端校验邮箱/handle 唯一性、
  // 密码强度、昵称长度，并在创建用户后决定是否自动登录。
  return (
    <main className="grid min-h-screen place-items-center bg-stone-50 px-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">创建账号</h1>
        <form className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">昵称</span>
            <input className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">邮箱</span>
            <input className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">密码</span>
            <input
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              type="password"
            />
          </label>
          <Button className="w-full">注册</Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          已有账号？
          <Link className="font-semibold text-rose-700" href="/login">
            登录
          </Link>
        </p>
      </section>
    </main>
  );
}
