import Image from "next/image";
import Link from "next/link";
import { Bookmark, Heart, MessageCircle, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { NoteCardData } from "@/lib/content-data";

export function NoteCard({ note }: Readonly<{ note: NoteCardData }>) {
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <Link href={`/notes/${note.id}`} className="block">
        <div className="relative aspect-[4/3] bg-slate-100">
          <Image
            src={note.imageUrl}
            alt={note.imageAlt}
            fill
            loading="eager"
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      </Link>
      <div className="space-y-4 p-4">
        <div>
          <Link href={`/notes/${note.id}`}>
            <h2 className="line-clamp-2 text-base font-semibold text-slate-950">
              {note.title}
            </h2>
          </Link>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
            {note.excerpt}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {note.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
        {note.recommendationReason ? (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">
            <Sparkles className="h-3.5 w-3.5" />
            {note.recommendationReason}
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <Link
            href={`/users/${note.author.handle}`}
            className="flex min-w-0 items-center gap-2"
          >
            <Image
              src={note.author.avatarUrl}
              alt={note.author.name}
              width={28}
              height={28}
              className="h-7 w-7 rounded-full object-cover"
            />
            <span className="truncate text-sm font-medium text-slate-700">
              {note.author.name}
            </span>
          </Link>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" />
              {note.likes}
            </span>
            <span className="inline-flex items-center gap-1">
              <Bookmark className="h-3.5 w-3.5" />
              {note.favorites}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" />
              {note.comments}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
