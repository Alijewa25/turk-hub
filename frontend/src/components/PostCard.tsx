import React, { useState } from 'react';
import { Bookmark, FileText, Heart, MessageCircle, Share2, Sparkles } from 'lucide-react';
import { mediaUrl } from '../api';
import { flagOf, useI18n } from '../i18n';

export interface PostMedia {
  title?: string;
  description?: string;
  badge?: string;
  image?: string;
  fileUrl?: string;
  fileName?: string;
}

export interface PostData {
  id: string;
  authorId?: number;
  author: string;
  country: string;
  role: string;
  time: string;
  body: string;
  media?: PostMedia;
  likes: number;
  comments: number;
}

interface PostCardProps {
  post: PostData;
  onJoin?: () => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, onJoin }) => {
  const { t } = useI18n();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState('');

  const likeCount = post.likes + (liked ? 1 : 0);
  const flag = flagOf(post.country);
  const imageSrc = mediaUrl(post.media?.image);
  const fileHref = mediaUrl(post.media?.fileUrl);
  const isPdf =
    Boolean(fileHref) &&
    (post.media?.fileName?.toLowerCase().endsWith('.pdf') ||
      fileHref.toLowerCase().includes('.pdf') ||
      (!post.media?.image && Boolean(post.media?.fileUrl)));

  return (
    <article className="bg-neutral-900/60 border border-neutral-800 rounded-2xl mb-4 overflow-hidden shadow-lg shadow-black/40 transition-colors duration-200 hover:border-neutral-700">
      <div className="p-3 flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-black border border-skyBlue/40 text-lg flex items-center justify-center">
          {flag}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold text-slate-100 truncate">{post.author}</h3>
          <p className="text-[10px] text-slate-500">
            {post.country} • {post.role} • {post.time}
          </p>
        </div>
        <button
          onClick={() => setSaved((s) => !s)}
          aria-label="Yadda saxla"
          className={`transition-colors ${saved ? 'text-skyBlue' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <Bookmark className="w-5 h-5" fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      {post.body && <p className="px-3 pb-3 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{post.body}</p>}

      {imageSrc && (
        <div className="mx-3 mb-3 overflow-hidden rounded-xl border border-neutral-800">
          <img src={imageSrc} alt={post.media?.title || 'Post media'} className="w-full max-h-96 object-cover" />
        </div>
      )}

      {isPdf && fileHref && (
        <a
          href={fileHref}
          target="_blank"
          rel="noreferrer"
          className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-neutral-800 bg-black/60 px-3 py-2.5 text-xs text-emerald-400 hover:border-emerald-500/40 transition-colors"
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span className="truncate">{post.media?.fileName || 'PDF sənədi'}</span>
        </a>
      )}

      {!imageSrc && !isPdf && post.media && (post.media.title || post.media.description || post.media.badge) && (
        <div className="mx-3 mb-3 bg-gradient-to-br from-neutral-900 via-neutral-900 to-skyBlue/10 rounded-xl p-5 flex flex-col items-center text-center border border-neutral-800">
          <Sparkles className="w-8 h-8 text-skyBlue mb-2 animate-pulse" />
          {post.media.title && <h4 className="text-sm font-bold text-slate-100">{post.media.title}</h4>}
          {post.media.description && (
            <p className="text-xs text-slate-400 mt-1 max-w-xs">{post.media.description}</p>
          )}
          {post.media.badge && (
            <span className="mt-3 text-[10px] bg-skyBlue/10 text-skyBlue border border-skyBlue/30 px-3 py-1 rounded-full">
              {post.media.badge}
            </span>
          )}
        </div>
      )}

      <div className="px-3 pb-2 flex items-center gap-4 text-slate-400">
        <button
          onClick={() => setLiked((l) => !l)}
          className={`flex items-center gap-1.5 text-xs transition-colors ${liked ? 'text-red-500' : 'hover:text-red-500'}`}
        >
          <Heart className="w-5 h-5 transition-transform duration-200 active:scale-125" fill={liked ? 'currentColor' : 'none'} />
          {likeCount}
        </button>
        <button
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1.5 text-xs hover:text-skyBlue transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          {post.comments}
        </button>
        <button className="flex items-center gap-1.5 text-xs hover:text-skyBlue transition-colors" aria-label="Paylaş">
          <Share2 className="w-5 h-5" />
        </button>
        {onJoin && (
          <button
            onClick={onJoin}
            className="ml-auto px-3 py-1 bg-skyBlue hover:bg-skyBlue-hover text-black font-bold text-xs rounded-lg transition-colors duration-200 active:scale-95"
          >
            {t('joinTeam')}
          </button>
        )}
      </div>

      {showComments && (
        <div className="px-3 pb-3 border-t border-neutral-800 pt-3 space-y-2">
          <p className="text-xs text-slate-400">
            <span className="text-slate-200 font-semibold">selcan.uz</span> Əla layihədir, qoşuluram!
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setComment('');
            }}
            className="flex gap-2"
          >
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('commentPlaceholder')}
              className="flex-1 px-3 py-2 bg-black border border-neutral-800 rounded-lg text-xs text-slate-100 placeholder-neutral-600 focus:outline-none focus:border-skyBlue transition-colors"
            />
            <button
              type="submit"
              className="px-3 py-2 text-xs font-bold text-skyBlue hover:bg-skyBlue/10 rounded-lg transition-colors"
            >
              {t('sendComment')}
            </button>
          </form>
        </div>
      )}
    </article>
  );
};
