import Image from "next/image";
import { notFound } from "next/navigation";
import { Bookmark, Heart, MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { demoNotes } from "@/lib/mock-data";

export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const { noteId } = await params;
  const note = demoNotes.find((item) => item.id === noteId);

  if (!note) {
    notFound();
  }

  return (
    <article className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="relative aspect-[16/10] bg-slate-100">
          <Image src={note.imageUrl} alt={note.title} fill className="object-cover" priority />
        </div>
      </div>
      <aside className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <Image
            src={note.author.avatarUrl}
            alt={note.author.name}
            width={44}
            height={44}
            className="h-11 w-11 rounded-full object-cover"
          />
          <div>
            <p className="font-semibold text-slate-950">{note.author.name}</p>
            <p className="text-sm text-slate-500">@{note.author.handle}</p>
          </div>
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-950">{note.title}</h1>
        <p className="mt-3 leading-7 text-slate-600">{note.excerpt}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {note.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-lg bg-rose-50 p-3 text-rose-700">
            <Heart className="mx-auto h-4 w-4" />
            <strong className="mt-1 block">{note.likes}</strong>
          </div>
          <div className="rounded-lg bg-amber-50 p-3 text-amber-700">
            <Bookmark className="mx-auto h-4 w-4" />
            <strong className="mt-1 block">{note.favorites}</strong>
          </div>
          <div className="rounded-lg bg-teal-50 p-3 text-teal-700">
            <MessageCircle className="mx-auto h-4 w-4" />
            <strong className="mt-1 block">{note.comments}</strong>
          </div>
        </div>
      </aside>
    </article>
  );
}
