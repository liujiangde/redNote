"use server";

import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";

export type RegisterFormState = {
  message: string;
  errors?: {
    name?: string[];
    handle?: string[];
    email?: string[];
    password?: string[];
  };
};

const registerSchema = z.object({
  name: z.string().trim().min(2, "昵称至少需要 2 个字符").max(40, "昵称不能超过 40 个字符"),
  handle: z
    .string()
    .trim()
    .min(3, "用户名至少需要 3 个字符")
    .max(32, "用户名不能超过 32 个字符")
    .regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线")
    .transform((value) => value.toLowerCase()),
  email: z.string().trim().email("请输入有效邮箱").transform((value) => value.toLowerCase()),
  password: z.string().min(8, "密码至少需要 8 个字符").max(72, "密码不能超过 72 个字符"),
});

export async function registerUser(
  _prevState: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  // 注册是账号系统入口，必须在服务端校验字段和唯一性；客户端校验只能作为体验增强。
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    handle: formData.get("handle"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      message: "请检查注册信息。",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const existingUser = await db.user.findFirst({
    where: {
      OR: [{ email: parsed.data.email }, { handle: parsed.data.handle }],
    },
    select: {
      email: true,
      handle: true,
    },
  });

  if (existingUser) {
    return {
      message: "账号信息已被使用。",
      errors: {
        ...(existingUser.email === parsed.data.email ? { email: ["该邮箱已注册"] } : {}),
        ...(existingUser.handle === parsed.data.handle ? { handle: ["该用户名已被占用"] } : {}),
      },
    };
  }

  const passwordHash = await hash(parsed.data.password, 10);

  await db.user.create({
    data: {
      email: parsed.data.email,
      handle: parsed.data.handle,
      name: parsed.data.name,
      passwordHash,
    },
  });

  redirect(`/login?registered=1&email=${encodeURIComponent(parsed.data.email)}`);
}
