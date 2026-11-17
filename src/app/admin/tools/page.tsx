import { ToolsPanel } from "./tools-panel";

export default function AdminToolsPage() {
  return <section className="space-y-6"><div><h1 className="text-2xl font-bold text-slate-950">后台工具</h1><p className="mt-1 text-sm text-slate-500">文档转换与网盘文件下载。</p></div><ToolsPanel /></section>;
}
