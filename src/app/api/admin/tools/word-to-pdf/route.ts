import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { AuthorizationError, requireAdminSession } from "@/lib/auth-boundary";
import { normalizeWordFonts } from "@/lib/word-font-compat";

const execFileAsync = promisify(execFile);
const maxBytes = 20 * 1024 * 1024;

export async function POST(request: Request) {
  // 转换会在服务器启动外部进程，先确认管理员身份，再处理上传数据。
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AuthorizationError) return Response.json({ error: "请使用管理员账号登录。" }, { status: error.status });
    throw error;
  }

  // 校验浏览器来源，避免其他站点借用已登录管理员的会话发起转换。
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try {
    const url = new URL(origin ?? "");
    sameOrigin = ["http:", "https:"].includes(url.protocol) && url.host === request.headers.get("host");
  } catch {
    // 缺失或无法解析的 Origin 一律拒绝。
  }
  if (!sameOrigin) return Response.json({ error: "请求来源无效。" }, { status: 403 });
  // Content-Length 包含 multipart 边界，预留 1 MB；实际文件大小仍需单独校验。
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes + 1024 * 1024) return Response.json({ error: "文件不能超过 20 MB。" }, { status: 413 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "无法读取上传文件。" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || !/\.docx?$/i.test(file.name) || file.size === 0 || file.size > maxBytes) {
    return Response.json({ error: "请选择不超过 20 MB 的 .doc 或 .docx 文件。" }, { status: 400 });
  }

  // 每次请求使用独立目录和固定输入文件名，避免文件名冲突及上传文件名影响路径。
  const directory = await mkdtemp(path.join(tmpdir(), "rednote-word-"));
  try {
    const extension = path.extname(file.name).toLowerCase();
    const input = path.join(directory, `document${extension}`);
    const original = new Uint8Array(await file.arrayBuffer());
    let document: Uint8Array = original;
    // DOCX 是 ZIP 格式，可在转换前修复特定字体声明；旧版 DOC 保持原样。
    if (extension === ".docx") {
      try {
        document = normalizeWordFonts(original);
      } catch {
        return Response.json({ error: "无法读取 Word 文件，请检查文件格式或大小。" }, { status: 400 });
      }
    }
    await writeFile(input, document);
    // 独立的 LibreOffice 用户配置目录避免并发请求争用同一个进程或配置锁。
    // execFile 直接传参而不经过 shell；超时和输出上限限制异常进程的资源占用。
    await execFileAsync(process.env.SOFFICE_PATH || "soffice", [
      `-env:UserInstallation=${pathToFileURL(path.join(directory, "profile")).href}`,
      "--headless", "--convert-to", "pdf", "--outdir", directory, input,
    ], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        // macOS 默认使用项目提供的字体回退配置；显式配置优先。
        ...(process.platform === "darwin" && !process.env.FONTCONFIG_FILE
          ? { FONTCONFIG_FILE: path.join(process.cwd(), "config", "word-fonts-macos.conf") }
          : {}),
      },
    });
    const pdf = await readFile(path.join(directory, "document.pdf"));
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=converted.pdf", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Word conversion failed:", error);
    return Response.json({ error: "转换失败，请确认文件有效且服务器已安装 LibreOffice。" }, { status: 500 });
  } finally {
    // 无论转换、读取或响应构造是否失败，都删除上传文件及临时配置。
    await rm(directory, { recursive: true, force: true });
  }
}
