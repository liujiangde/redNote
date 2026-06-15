export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-2 w-24 rounded-full bg-rose-100" />
        <h1 className="mt-4 text-xl font-bold text-slate-950">正在加载</h1>
        <div className="mt-5 space-y-3">
          <div className="h-3 w-full rounded-full bg-slate-100" />
          <div className="h-3 w-5/6 rounded-full bg-slate-100" />
          <div className="h-3 w-2/3 rounded-full bg-slate-100" />
        </div>
      </section>
    </main>
  );
}
