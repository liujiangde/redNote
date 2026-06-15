import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-rose-600">404</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">没有找到这个页面</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          目标内容可能已被移除、隐藏，或链接地址有误。
        </p>
        <div className="mt-6">
          <Link
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700"
            href="/"
          >
            返回首页
          </Link>
        </div>
      </section>
    </main>
  );
}
