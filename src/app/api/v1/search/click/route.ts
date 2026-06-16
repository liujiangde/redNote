import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { recordSearchResultClick } from "@/lib/content-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const noteId = request.nextUrl.searchParams.get("noteId")?.trim();

  if (!noteId) {
    return NextResponse.redirect(new URL("/search", request.url));
  }

  await recordSearchResultClick(
    request.nextUrl.searchParams.get("q") ?? undefined,
    noteId,
  );

  return NextResponse.redirect(
    new URL(`/notes/${encodeURIComponent(noteId)}`, request.url),
  );
}
