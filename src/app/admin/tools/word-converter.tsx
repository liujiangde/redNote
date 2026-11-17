"use client";

import { useRef, useState } from "react";
import { zipSync } from "fflate";

const maxFiles = 10;
const maxBytes = 20 * 1024 * 1024;
type Item = { id: string; file: File; status: "等待中" | "转换中" | "成功" | "失败"; result?: Blob; error?: string };

function download(blob: Blob, name: string) {
  // 使用临时对象 URL 触发浏览器下载，并延迟释放以便下载有时间开始。
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function WordConverter() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const [items, setItems] = useState<Item[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function addFiles(files: FileList | File[]) {
    // 选择和拖放共用校验；整批无效时不向队列加入任何文件。
    const added = Array.from(files);
    if (items.length + added.length > maxFiles) { setError(`最多上传 ${maxFiles} 个文件。`); return; }
    if (added.some((file) => !/\.docx?$/i.test(file.name) || file.size === 0 || file.size > maxBytes)) {
      setError("请选择不超过 20 MB 的有效 .doc 或 .docx 文件。"); return;
    }
    setError("");
    const entries = added.map((file) => ({ id: String(nextId.current++), file, status: "等待中" as const }));
    setItems((current) => [...current, ...entries]);
    // 清空 input，允许用户随后再次选择同一个文件。
    if (input.current) input.current.value = "";
  }

  async function convert() {
    setPending(true);
    setError("");
    // 顺序处理以限制服务器上的 LibreOffice 并发；重试时跳过已成功的文件。
    for (const item of items.filter((entry) => entry.status !== "成功")) {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "转换中", error: undefined } : entry));
      try {
        const body = new FormData();
        body.append("file", item.file);
        const response = await fetch("/api/admin/tools/word-to-pdf", { method: "POST", body });
        if (!response.ok) { const data = await response.json(); throw new Error(data.error || "转换失败"); }
        const result = await response.blob();
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "成功", result } : entry));
      } catch (e) {
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "失败", error: e instanceof Error ? e.message : "转换失败" } : entry));
      }
    }
    setPending(false);
  }

  async function downloadAll() {
    // 只打包已成功的结果；同名文件追加序号，避免 ZIP 条目互相覆盖。
    const files: Record<string, Uint8Array> = {};
    const used = new Set<string>();
    for (const item of items) {
      if (!item.result) continue;
      const base = item.file.name.replace(/\.docx?$/i, "");
      let name = `${base}.pdf`;
      let index = 2;
      while (used.has(name)) name = `${base} (${index++}).pdf`;
      used.add(name);
      files[name] = new Uint8Array(await item.result.arrayBuffer());
    }
    // PDF 通常已压缩，这里不再压缩，减少浏览器端的额外开销。
    const zip = zipSync(files, { level: 0 });
    download(new Blob([new Uint8Array(zip)], { type: "application/zip" }), "转换结果.zip");
  }

  return <>
    <article className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div><h2 className="font-semibold text-slate-950">多页面 Word 转 PDF</h2><p className="mt-2 text-sm text-slate-500">支持一个或多个 Word 文件，转换所有页面。</p></div>
      <button className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => dialog.current?.showModal()} type="button">打开转换工具</button>
    </article>
    <dialog ref={dialog} aria-labelledby="word-title" onCancel={(event) => { if (pending) event.preventDefault(); }} className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-auto rounded-xl p-0 shadow-xl backdrop:bg-black/50">
      <div className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-4"><div><h2 id="word-title" className="text-lg font-bold">Word 转 PDF</h2><p className="mt-1 text-sm text-slate-500">最多 {maxFiles} 个文件，每个不超过 20 MB；每个 Word 生成一个 PDF。</p></div><button type="button" aria-label="关闭" disabled={pending} onClick={() => dialog.current?.close()} className="text-xl text-slate-500 disabled:opacity-40">×</button></div>
        <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!pending) addFiles(event.dataTransfer.files); }} className="rounded-lg border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
          <label className="cursor-pointer font-medium text-rose-700">选择 Word 文件<input ref={input} type="file" accept=".doc,.docx" multiple disabled={pending} className="sr-only" onChange={(event) => { if (event.target.files) addFiles(event.target.files); }} /></label><span> 或拖放到这里</span>
        </div>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <ul className="max-h-72 space-y-2 overflow-auto" aria-live="polite">{items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><div className="min-w-0"><p className="break-all font-medium">{item.file.name}</p><p className="text-slate-500">{(item.file.size / 1024 / 1024).toFixed(2)} MB · {item.status}{item.error ? `：${item.error}` : ""}</p></div><div className="flex gap-3">{item.result && <button type="button" onClick={() => download(item.result!, item.file.name.replace(/\.docx?$/i, ".pdf"))} className="text-rose-700">下载</button>}<button type="button" disabled={pending} onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} className="text-slate-500 disabled:opacity-40">移除</button></div></li>)}</ul>
        <div className="flex flex-wrap gap-3"><button type="button" disabled={pending || !items.some((item) => item.status !== "成功")} onClick={convert} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "转换中..." : "开始转换"}</button><button type="button" disabled={pending || !items.some((item) => item.result)} onClick={downloadAll} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">打包下载成功的 PDF</button></div>
      </div>
    </dialog>
  </>;
}
