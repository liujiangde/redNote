import Image from "next/image";
import { notFound } from "next/navigation";

import { NoteCard } from "@/components/note-card";
import { demoNotes } from "@/lib/mock-data";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const userNote = demoNotes.find((note) => note.author.handle === handle);

  if (!userNote) {
    notFound();
  }

  const userNotes = demoNotes.filter((note) => note.author.handle === handle);

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-4">
          <Image
            src={userNote.author.avatarUrl}
            alt={userNote.author.name}
            width={72}
            height={72}
            className="h-[72px] w-[72px] rounded-full object-cover"
          />
          <div>
            <h1 className="text-2xl font-bold text-slate-950">{userNote.author.name}</h1>
            <p className="mt-1 text-sm text-slate-500">@{userNote.author.handle}</p>
            <p className="mt-2 text-sm text-slate-600">
              分享城市灵感、生活方式和可执行的周末计划。
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {userNotes.map((note) => (
          <NoteCard key={note.id} note={note} />
        ))}
      </div>
    </section>
  );
}
