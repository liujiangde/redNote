import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

const adminRoles = new Set(["ADMIN", "SUPER_ADMIN"]);

export async function proxy(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const loginUrl = new URL("/login", request.url);

    loginUrl.searchParams.set("callbackUrl", "/admin");

    return NextResponse.redirect(loginUrl);
  }

  if (!adminRoles.has(String(token.role))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
