import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  // 当前页面只渲染注册表单。M2 接入时需要服务端校验邮箱/handle 唯一性、
  // 密码强度、昵称长度，并在创建用户后决定是否自动登录。
  return (
    <main className="grid min-h-screen place-items-center bg-stone-50 px-4">
      <RegisterForm />
    </main>
  );
}
