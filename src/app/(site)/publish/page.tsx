import { ImagePlus, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function PublishPage() {
  // 当前是发布流程的 UI 骨架。M2 接入真实提交后，流程应为：
  // 登录校验 -> 表单校验 -> 预签名上传图片 -> 写入 Note/NoteImage/Tag -> 生成 embedding。
  return (
    <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-950">发布图文笔记</h1>
          <p className="mt-1 text-sm text-slate-500">MVP 表单骨架，后续接入 MinIO 上传和草稿保存。</p>
        </div>
        <Button>
          <Send className="h-4 w-4" />
          发布
        </Button>
      </div>
      <form className="mt-5 space-y-5">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">标题</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">正文</span>
          <textarea className="mt-2 min-h-44 w-full rounded-lg border border-slate-200 p-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100" />
        </label>
        <div className="grid aspect-[16/7] place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500">
          <div className="text-center">
            <ImagePlus className="mx-auto h-8 w-8" />
            <p className="mt-2 text-sm font-medium">图片上传区</p>
          </div>
        </div>
      </form>
    </section>
  );
}
