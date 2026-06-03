"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function LoginForm({
  callbackUrl,
  defaultEmail,
  registered,
}: {
  callbackUrl: string;
  defaultEmail: string;
  registered: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    const formData = new FormData(event.currentTarget);

    // 登录使用 NextAuth Credentials。这里不直接调用数据库，密码校验统一留在
    // authOptions.authorize，避免客户端表单和服务端鉴权逻辑分叉。
    const result = await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      callbackUrl,
      redirect: false,
    });

    setPending(false);

    if (!result?.ok) {
      setError("邮箱或密码不正确。");
      return;
    }

    router.push(result.url ?? callbackUrl);
    router.refresh();
  }

  return (
    <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-950">登录 RedNote</h1>
      <p className="mt-2 text-sm text-slate-500">使用种子账号或注册账号进入内容社区。</p>
      {registered && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          注册成功，请登录。
        </p>
      )}
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">邮箱</span>
          <input
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            defaultValue={defaultEmail}
            name="email"
            required
            type="email"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">密码</span>
          <input
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            defaultValue={defaultEmail ? "" : "rednote123"}
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>
        {error && (
          <p aria-live="polite" className="text-sm text-rose-600">
            {error}
          </p>
        )}
        <Button className="w-full" disabled={pending} type="submit">
          {pending ? "登录中..." : "登录"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">
        没有账号？
        <Link className="font-semibold text-rose-700" href="/register">
          注册
        </Link>
      </p>
    </section>
  );
}
