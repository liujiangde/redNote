"use client";

import { ImagePlus, Send } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/api-contract";
import {
  isAllowedUploadImageContentType,
  MAX_UPLOAD_IMAGE_SIZE_BYTES,
  MAX_UPLOAD_IMAGE_SIZE_MB,
  uploadImageAccept,
} from "@/lib/upload-policy";

import { publishNote, type PublishFormState } from "./actions";

const initialState: PublishFormState = {
  message: "",
};

type UploadResponse = {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  expiresIn: number;
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="mt-1 text-xs text-rose-600">{errors[0]}</p>;
}

export function PublishForm() {
  const [state, formAction, pending] = useActionState(publishNote, initialState);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [uploadState, setUploadState] = useState("");
  const [uploading, setUploading] = useState(false);

  async function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!isAllowedUploadImageContentType(file.type)) {
      setUploadState("仅支持 JPEG、PNG、WebP 或 GIF 图片。");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_UPLOAD_IMAGE_SIZE_BYTES) {
      setUploadState(`图片不能超过 ${MAX_UPLOAD_IMAGE_SIZE_MB}MB。`);
      event.target.value = "";
      return;
    }

    setUploading(true);
    setUploadState("正在上传图片...");

    try {
      // 图片先通过服务端签发预签名 URL，再由浏览器直传对象存储。
      // 服务器只在发布提交时保存 publicUrl，避免未提交草稿提前写 note_images。
      const signResponse = await fetch("/api/v1/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const signed = (await signResponse.json()) as ApiResponse<UploadResponse>;

      if (!signed.ok) {
        setUploadState(signed.error.message);
        return;
      }

      const uploadResponse = await fetch(signed.data.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        setUploadState("图片上传失败，请确认 MinIO 已启动并配置 CORS。");
        return;
      }

      setImageUrl(signed.data.publicUrl);
      setImageAlt(file.name);
      setUploadState("图片上传完成。");
    } catch {
      setUploadState("图片上传失败，请稍后重试。");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-950">发布图文笔记</h1>
          <p className="mt-1 text-sm text-slate-500">填写内容、上传图片，可保存草稿或发布。</p>
        </div>
      </div>
      <form action={formAction} className="mt-5 space-y-5">
        <input name="imageUrl" type="hidden" value={imageUrl} />
        <input name="imageAlt" type="hidden" value={imageAlt} />
        <label className="block">
          <span className="text-sm font-medium text-slate-700">标题</span>
          <input
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            maxLength={120}
            name="title"
            required
          />
          <FieldError errors={state.errors?.title} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">正文</span>
          <textarea
            className="mt-2 min-h-44 w-full rounded-lg border border-slate-200 p-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            name="content"
            required
          />
          <FieldError errors={state.errors?.content} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">标签</span>
          <input
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            name="tags"
            placeholder="咖啡, 周末, 上海"
          />
          <FieldError errors={state.errors?.tags} />
        </label>
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">
          <div className="text-center">
            <ImagePlus className="mx-auto h-8 w-8" />
            <p className="mt-2 text-sm font-medium">图片上传区</p>
            <input
              accept={uploadImageAccept}
              className="mt-4 text-sm"
              disabled={uploading}
              onChange={handleImageChange}
              type="file"
            />
            {uploadState && <p className="mt-3 text-sm text-slate-600">{uploadState}</p>}
            {imageUrl && (
              <p className="mt-2 break-all text-xs text-emerald-700">已绑定图片：{imageUrl}</p>
            )}
          </div>
          <FieldError errors={state.errors?.imageUrl} />
        </div>
        {state.message && (
          <p aria-live="polite" className="text-sm text-rose-600">
            {state.message}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button disabled={pending || uploading} name="intent" type="submit" value="draft" variant="secondary">
            保存草稿
          </Button>
          <Button disabled={pending || uploading} name="intent" type="submit" value="publish">
            <Send className="h-4 w-4" />
            {pending ? "发布中..." : "发布"}
          </Button>
        </div>
      </form>
    </section>
  );
}
