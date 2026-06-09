import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bookmark, EyeOff, Heart, MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentSession } from "@/lib/auth-boundary";
import {
  createComment,
  deleteOwnComment,
  markNoteNotInterested,
  reportVisibleComment,
  toggleFavorite,
  toggleLike,
} from "@/lib/community-actions";
import { getPublishedNoteDetail } from "@/lib/content-data";

function buildCommentPageHref(noteId: string, cursor: string | null) {
  // 评论分页状态放到 URL，用户刷新或复制链接时仍能停留在当前评论页。
  if (!cursor) {
    return `/notes/${noteId}`;
  }

  return `/notes/${noteId}?commentCursor=${encodeURIComponent(cursor)}`;
}

function CommentGovernanceControls({
  commentId,
  isOwn,
}: {
  commentId: string;
  isOwn: boolean;
}) {
  if (isOwn) {
    return (
      <form action={deleteOwnComment.bind(null, commentId)}>
        <Button className="h-8 px-2 text-xs" type="submit" variant="ghost">
          删除
        </Button>
      </form>
    );
  }

  return (
    <form action={reportVisibleComment.bind(null, commentId)}>
      <input name="reason" type="hidden" value="评论内容违规" />
      <Button className="h-8 px-2 text-xs" type="submit" variant="ghost">
        举报
      </Button>
    </form>
  );
}

export default async function NoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ noteId: string }>;
  searchParams: Promise<{ commentCursor?: string }>;
}) {
  const [{ noteId }, { commentCursor }, session] = await Promise.all([
    params,
    searchParams,
    getCurrentSession(),
  ]);
  // 详情页只允许展示已发布笔记；服务层会同时支持 id/slug 查询并处理浏览量。
  // 传入 viewerId 后，服务层会额外返回当前用户是否点赞/收藏，供按钮状态使用。
  // commentCursor 来自 URL，只影响一级评论分页，不影响笔记主体和互动状态。
  const note = await getPublishedNoteDetail(noteId, {
    commentCursor,
    viewerId: session?.user.id,
  });

  if (!note) {
    notFound();
  }

  return (
    <article className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="relative aspect-[16/10] bg-slate-100">
            <Image src={note.imageUrl} alt={note.imageAlt} fill className="object-cover" priority />
          </div>
        </div>
        {note.images.length > 1 && (
          <div className="grid grid-cols-3 gap-3">
            {note.images.slice(1, 4).map((image) => (
              <div
                className="relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                key={image.url}
              >
                <Image src={image.url} alt={image.alt} fill className="object-cover" />
              </div>
            ))}
          </div>
        )}
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-teal-600" />
            <h2 className="text-base font-semibold text-slate-950">评论</h2>
            <span className="text-sm text-slate-500">({note.comments})</span>
          </div>
          {session?.user ? (
            // 一级评论表单只绑定 note.id；Server Action 会把提交内容写成 parentId=null。
            <form action={createComment.bind(null, note.id)} className="mt-4 space-y-3">
              <textarea
                className="min-h-24 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                maxLength={1000}
                name="content"
                placeholder="写下你的评论"
                required
              />
              <div className="flex justify-end">
                <Button type="submit">发布评论</Button>
              </div>
            </form>
          ) : (
            <Link
              className="mt-4 inline-flex h-10 items-center rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
              href={`/login?callbackUrl=${encodeURIComponent(`/notes/${note.id}`)}`}
            >
              登录后评论
            </Link>
          )}
          <div className="mt-5 space-y-4">
            {note.commentsList.map((comment) => {
              const isOwnComment = session?.user.id === comment.author.id;

              return (
                <div className="border-t border-slate-100 pt-4" key={comment.id}>
                  <div className="flex items-start gap-3">
                    <Image
                      src={comment.author.avatarUrl}
                      alt={comment.author.name}
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          className="font-medium text-slate-900"
                          href={`/users/${comment.author.handle}`}
                        >
                          {comment.author.name}
                        </Link>
                        <span className="text-xs text-slate-400">{comment.createdAt}</span>
                        {session?.user && (
                          <CommentGovernanceControls
                            commentId={comment.id}
                            isOwn={isOwnComment}
                          />
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">
                        {comment.content}
                      </p>
                      {comment.replies.length > 0 && (
                        // 每条一级评论只展示最近几条回复；完整楼中楼后续用独立分页 API 承接。
                        <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
                          {comment.replies.map((reply) => {
                            const isOwnReply = session?.user.id === reply.author.id;

                            return (
                              <div className="flex items-start gap-2" key={reply.id}>
                                <Image
                                  src={reply.author.avatarUrl}
                                  alt={reply.author.name}
                                  width={28}
                                  height={28}
                                  className="h-7 w-7 rounded-full object-cover"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Link
                                      className="text-sm font-medium text-slate-800"
                                      href={`/users/${reply.author.handle}`}
                                    >
                                      {reply.author.name}
                                    </Link>
                                    <span className="text-xs text-slate-400">
                                      {reply.createdAt}
                                    </span>
                                    {session?.user && (
                                      <CommentGovernanceControls
                                        commentId={reply.id}
                                        isOwn={isOwnReply}
                                      />
                                    )}
                                  </div>
                                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">
                                    {reply.content}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                          {comment.replyCount > comment.replies.length && (
                            <p className="text-xs text-slate-400">
                              还有 {comment.replyCount - comment.replies.length} 条更早回复暂未展开。
                            </p>
                          )}
                        </div>
                      )}
                      {session?.user && (
                        // 回复表单额外绑定 comment.id；服务端会验证 parentId 属于当前笔记。
                        <form
                          action={createComment.bind(null, note.id, comment.id)}
                          className="mt-3 space-y-2"
                        >
                          <textarea
                            className="min-h-16 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                            maxLength={1000}
                            name="content"
                            placeholder={`回复 ${comment.author.name}`}
                            required
                          />
                          <div className="flex justify-end">
                            <Button type="submit" variant="secondary">
                              回复
                            </Button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {!note.commentsList.length && (
              <p className="border-t border-slate-100 pt-4 text-sm text-slate-500">
                还没有评论，来写第一条。
              </p>
            )}
          </div>
          {(note.commentsPageInfo.hasNextPage || commentCursor) && (
            // 下一页评论只翻评论列表，不重新设计为客户端无限滚动，先保证 SSR 和移动端 API 口径一致。
            <div className="mt-5 flex flex-wrap justify-center gap-3 border-t border-slate-100 pt-4">
              {commentCursor && (
                <Link
                  className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  href={buildCommentPageHref(note.id, null)}
                >
                  返回最新评论
                </Link>
              )}
              {note.commentsPageInfo.hasNextPage && (
                <Link
                  className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  href={buildCommentPageHref(note.id, note.commentsPageInfo.nextCursor)}
                >
                  下一页评论
                </Link>
              )}
            </div>
          )}
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
        <p className="mt-3 whitespace-pre-line leading-7 text-slate-600">{note.content}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {note.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
        <div className="mt-6 grid gap-3">
          <form action={toggleLike.bind(null, note.id)}>
            <Button
              className="w-full"
              type="submit"
              variant={note.viewerHasLiked ? "primary" : "secondary"}
            >
              <Heart className="h-4 w-4" />
              {note.viewerHasLiked ? "已点赞" : "点赞"} {note.likes}
            </Button>
          </form>
          <form action={toggleFavorite.bind(null, note.id)}>
            <Button
              className="w-full"
              type="submit"
              variant={note.viewerHasFavorited ? "primary" : "secondary"}
            >
              <Bookmark className="h-4 w-4" />
              {note.viewerHasFavorited ? "已收藏" : "收藏"} {note.favorites}
            </Button>
          </form>
          <div className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-50 px-4 text-sm font-semibold text-teal-700">
            <MessageCircle className="h-4 w-4" />
            评论 {note.comments}
          </div>
          {session?.user && (
            <form action={markNoteNotInterested.bind(null, note.id)}>
              <input name="reason" type="hidden" value="不感兴趣" />
              <Button className="w-full" type="submit" variant="ghost">
                <EyeOff className="h-4 w-4" />
                不感兴趣
              </Button>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          {note.views.toLocaleString()} 次浏览 · {note.createdAt}
        </p>
      </aside>
    </article>
  );
}
