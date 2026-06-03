"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { registerUser, type RegisterFormState } from "./actions";

const initialState: RegisterFormState = {
  message: "",
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="mt-1 text-xs text-rose-600">{errors[0]}</p>;
}

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerUser, initialState);

  return (
    <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-950">创建账号</h1>
      <form action={formAction} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">昵称</span>
          <input
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            name="name"
            required
          />
          <FieldError errors={state.errors?.name} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">用户名</span>
          <input
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            name="handle"
            pattern="[A-Za-z0-9_]+"
            required
          />
          <FieldError errors={state.errors?.handle} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">邮箱</span>
          <input
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            name="email"
            required
            type="email"
          />
          <FieldError errors={state.errors?.email} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">密码</span>
          <input
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            minLength={8}
            name="password"
            required
            type="password"
          />
          <FieldError errors={state.errors?.password} />
        </label>
        {state.message && (
          <p aria-live="polite" className="text-sm text-rose-600">
            {state.message}
          </p>
        )}
        <Button className="w-full" disabled={pending} type="submit">
          {pending ? "注册中..." : "注册"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">
        已有账号？
        <Link className="font-semibold text-rose-700" href="/login">
          登录
        </Link>
      </p>
    </section>
  );
}
