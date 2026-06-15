import { Badge } from "@/components/ui/badge";
import {
  findSensitiveContentTerms,
  getSensitiveContentDictionary,
  type SensitiveContentScope,
} from "@/lib/content-safety";

function normalizeScope(value: string | undefined): SensitiveContentScope {
  return value === "note" ? "note" : "comment";
}

function ScopeDictionary({ scope }: { scope: SensitiveContentScope }) {
  const dictionary = getSensitiveContentDictionary(scope);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            {scope === "comment" ? "评论词库" : "笔记词库"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {scope === "comment" ? "COMMENT_SENSITIVE_TERMS" : "NOTE_SENSITIVE_TERMS"}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {dictionary.source === "env" ? "环境变量" : "默认词库"}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {dictionary.terms.map((term) => (
          <Badge key={term}>{term}</Badge>
        ))}
      </div>
    </section>
  );
}

export default async function AdminSafetyPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; text?: string }>;
}) {
  const params = await searchParams;
  const scope = normalizeScope(params.scope);
  const text = params.text?.trim() ?? "";
  const matches = text ? findSensitiveContentTerms(text, scope) : [];

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">内容安全</h1>
        <p className="mt-1 text-sm text-slate-500">查看当前敏感词配置，并测试文本命中结果。</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ScopeDictionary scope="comment" />
        <ScopeDictionary scope="note" />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-950">命中测试</h2>
        <form className="mt-4 space-y-4" method="get">
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                defaultChecked={scope === "comment"}
                name="scope"
                type="radio"
                value="comment"
              />
              评论
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input defaultChecked={scope === "note"} name="scope" type="radio" value="note" />
              笔记
            </label>
          </div>
          <textarea
            className="min-h-32 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            defaultValue={text}
            name="text"
            placeholder="输入要测试的标题、正文、评论或标签"
          />
          <button
            className="inline-flex h-10 items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700"
            type="submit"
          >
            测试命中
          </button>
        </form>

        {text && (
          <div className="mt-5 rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">
              {matches.length ? `命中 ${matches.length} 个词` : "未命中敏感词"}
            </p>
            {matches.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {matches.map((term) => (
                  <span
                    className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
                    key={term}
                  >
                    {term}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
