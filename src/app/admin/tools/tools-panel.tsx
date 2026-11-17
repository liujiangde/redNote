"use client";

import { useState } from "react";
import { WordConverter } from "./word-converter";

const inputClass = "mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const buttonClass = "rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export function ToolsPanel() {
  const [share, setShare] = useState("");
  const [code, setCode] = useState("");
  const [shareError, setShareError] = useState("");

  function openShare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShareError("");
    try {
      const url = new URL(share.trim());
      if (url.protocol !== "https:" || url.hostname !== "pan.baidu.com" || !url.pathname.startsWith("/s/")) throw new Error();
      if (code.trim()) url.searchParams.set("pwd", code.trim());
      window.open(url.toString(), "_blank", "noopener,noreferrer");
    } catch {
      setShareError("请输入 https://pan.baidu.com/s/ 开头的分享链接。");
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <WordConverter />
      <form className="space-y-4 rounded-lg border border-slate-200 bg-white p-5" onSubmit={openShare}>
        <div><h2 className="font-semibold text-slate-950">百度网盘下载</h2><p className="mt-2 text-sm text-slate-500">打开百度网盘分享页面，按提示提取和下载文件，可能需要登录百度账号。</p></div>
        <label className="block text-sm font-medium">分享链接<input className={inputClass} type="url" value={share} onChange={(e) => setShare(e.target.value)} placeholder="https://pan.baidu.com/s/..." required /></label>
        <label className="block text-sm font-medium">提取码（如有）<input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} /></label>
        <button className={buttonClass} type="submit">打开百度网盘</button>
        {shareError && <p role="alert" className="text-sm text-rose-600">{shareError}</p>}
      </form>
    </div>
  );
}
