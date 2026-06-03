import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/auth-boundary";

import { PublishForm } from "./publish-form";

export default async function PublishPage() {
  const session = await getCurrentSession();

  if (!session?.user) {
    redirect("/login?callbackUrl=/publish");
  }

  // 发布页先在服务端保护入口；表单 action 内还会再次校验登录态和字段，
  // 完成预签名上传后的 Note/NoteImage/Tag/embedding 写入。
  return <PublishForm />;
}
