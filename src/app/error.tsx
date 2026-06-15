"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] Unhandled route error", {
      digest: error.digest,
      message: error.message,
      name: error.name,
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-rose-600">页面加载失败</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">当前请求没有正常完成</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          可以重试当前页面；如果仍然失败，返回首页继续浏览。
        </p>
        {error.digest && (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            错误编号：{error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button className="w-full" onClick={reset} type="button">
            重试
          </Button>
          <Button
            className="w-full"
            onClick={() => {
              window.location.href = "/";
            }}
            type="button"
            variant="secondary"
          >
            返回首页
          </Button>
        </div>
      </section>
    </main>
  );
}
