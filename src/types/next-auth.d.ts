import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      handle: string;
      role: "USER" | "ADMIN" | "SUPER_ADMIN";
    } & DefaultSession["user"];
  }

  interface User {
    handle: string;
    role: "USER" | "ADMIN" | "SUPER_ADMIN";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    handle: string;
    role: "USER" | "ADMIN" | "SUPER_ADMIN";
  }
}

