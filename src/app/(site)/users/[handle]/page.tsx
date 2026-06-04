import Image from "next/image";
import { notFound } from "next/navigation";

import { NoteCard } from "@/components/note-card";
import { Button } from "@/components/ui/button";
import { getCurrentSession } from "@/lib/auth-boundary";
import { toggleFollow } from "@/lib/community-actions";
import { getUserProfile } from "@/lib/content-data";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const [{ handle }, session] = await Promise.all([params, getCurrentSession()]);
  // 用户主页按 handle 聚合公开资料、作品列表和关注/粉丝统计。
  // 未找到用户时走 notFound，让 Next.js 统一渲染 404。
  const user = await getUserProfile(handle, {
    viewerId: session?.user.id,
  });

  if (!user) {
    notFound();
  }

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <Image
              src={user.avatarUrl}
              alt={user.name}
              width={72}
              height={72}
              className="h-[72px] w-[72px] rounded-full object-cover"
            />
            <div>
              <h1 className="text-2xl font-bold text-slate-950">{user.name}</h1>
              <p className="mt-1 text-sm text-slate-500">@{user.handle}</p>
              <p className="mt-2 text-sm text-slate-600">{user.bio}</p>
              <div className="mt-3 flex gap-4 text-xs font-medium text-slate-500">
                <span>{user.noteCount} 笔记</span>
                <span>{user.followerCount} 粉丝</span>
                <span>{user.followingCount} 关注</span>
              </div>
            </div>
          </div>
          {!user.isSelf && (
            <form action={toggleFollow.bind(null, user.handle)}>
              <Button
                className="w-full sm:w-auto"
                type="submit"
                variant={user.isFollowing ? "secondary" : "primary"}
              >
                {user.isFollowing ? "已关注" : "关注"}
              </Button>
            </form>
          )}
        </div>
      </div>
      {user.notes.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {user.notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          这个用户还没有发布笔记。
        </div>
      )}
    </section>
  );
}
