import React, { useEffect, useState } from 'react';
import { Bookmark, FileText, Heart, MessageCircle, Share2, Sparkles } from 'lucide-react';
import { commentPost, likePost, mediaUrl, toggleSavePost, translateCached, translationChanged } from '../api';
import { LANG_TARGET, langDisplayName, localizedCountryName, localizedRole, useI18n } from '../i18n';
import { UserAvatar } from './UserAvatar';

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
  avatarUrl?: string | null;
  author: string;
  country: string;
  role: string;
  time: string;
  body: string;
  media?: PostMedia;
  likes: number;
  comments: number;
  is_liked?: boolean | null;
  liked_by_me?: boolean | null;
  is_saved?: boolean | null;
  sourceLang?: string | null;
}

interface PostComment {
  id: string;
  author: string;
  text: string;
  translatedText?: string;
  sourceLang?: string;
  showTranslated?: boolean;
  translating?: boolean;
  autoTried?: boolean;
}

interface PostCardProps {
  post: PostData;
  onJoin?: () => void;
  token?: string | null;
  postId?: string | number;
  user?: any;
  highlighted?: boolean;
  onSavedChange?: (postId: string | number, isSaved: boolean) => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, onJoin, token = null, postId, user, highlighted = false, onSavedChange }) => {
  const { t, lang } = useI18n();
  const [liked, setLiked] = useState(post.is_liked ?? post.liked_by_me ?? false);
  const [saved, setSaved] = useState(post.is_saved ?? false);
  const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState('');
  const [likeCount, setLikeCount] = useState(post.likes || 0);
  const [commentCount, setCommentCount] = useState(post.comments || 0);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [translatedBody, setTranslatedBody] = useState('');
  const [translationSource, setTranslationSource] = useState('');
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState('');

  useEffect(() => {
    setLiked(post.is_liked ?? post.liked_by_me ?? false);
    setLikeCount(post.likes || 0);
    setCommentCount(post.comments || 0);
  }, [post.id, post.is_liked, post.liked_by_me, post.likes, post.comments]);

  useEffect(() => {
    setSaved(post.is_saved ?? false);
  }, [post.id, post.is_saved]);

  useEffect(() => {
    setTranslatedBody('');
    setTranslationSource('');
    setShowTranslation(false);
    setTranslationError('');
    setComments((prev) =>
      prev.map((c) => ({
        ...c,
        translatedText: undefined,
        sourceLang: undefined,
        showTranslated: false,
        translating: false,
        autoTried: false,
      }))
    );
  }, [post.body, lang]);

  useEffect(() => {
    const target = LANG_TARGET[lang];
    comments.forEach((item) => {
      if (!item.text.trim() || item.autoTried || item.translatedText || item.translating) return;
      setComments((prev) => prev.map((c) => (c.id === item.id ? { ...c, translating: true, autoTried: true } : c)));
      translateCached(token, item.text, target, undefined, `comment:${item.id}`)
        .then((result) => {
          const useful = translationChanged(result, item.text);
          setComments((prev) =>
            prev.map((c) =>
              c.id === item.id
                ? {
                    ...c,
                    translatedText: useful ? result.translated_text : undefined,
                    sourceLang: result.source_lang,
                    showTranslated: useful,
                    translating: false,
                  }
                : c
            )
          );
        })
        .catch(() =>
          setComments((prev) => prev.map((c) => (c.id === item.id ? { ...c, translating: false } : c)))
        );
    });
  }, [comments, lang, token]);

  const pid = postId ?? post.id;
  const imageSrc = mediaUrl(post.media?.image);
  const fileHref = mediaUrl(post.media?.fileUrl);
  const isPdf =
    Boolean(fileHref) &&
    (post.media?.fileName?.toLowerCase().endsWith('.pdf') ||
      fileHref.toLowerCase().includes('.pdf') ||
      (!post.media?.image && Boolean(post.media?.fileUrl)));

  const currentAuthorName = user?.full_name || user?.username || t('userGeneric');
  const sourceLang = post.sourceLang?.toLowerCase() || '';
  const targetLang = LANG_TARGET[lang];
  const normalizedTargetLang = targetLang === 'tk' ? 'tm' : targetLang;
  const canTranslate = Boolean(post.body?.trim()) && sourceLang !== normalizedTargetLang;

  const handleTranslatePost = async () => {
    if (!post.body || !canTranslate) return;
    if (showTranslation) {
      setShowTranslation(false);
      return;
    }
    if (translatedBody) {
      setShowTranslation(true);
      return;
    }
    setTranslating(true);
    setTranslationError('');
    try {
      const result = await translateCached(token, post.body, LANG_TARGET[lang], undefined, `post:${post.id}`);
      setTranslatedBody(result.translated_text);
      setTranslationSource(result.source_lang);
      setShowTranslation(true);
    } catch {
      setTranslationError(t('translationFailed'));
    } finally {
      setTranslating(false);
    }
  };

  const handleTranslateComment = async (item: PostComment) => {
    if (item.showTranslated) {
      setComments((prev) => prev.map((c) => (c.id === item.id ? { ...c, showTranslated: false } : c)));
      return;
    }
    if (item.translatedText) {
      setComments((prev) => prev.map((c) => (c.id === item.id ? { ...c, showTranslated: true } : c)));
      return;
    }
    setComments((prev) => prev.map((c) => (c.id === item.id ? { ...c, translating: true, autoTried: true } : c)));
    try {
      const result = await translateCached(token, item.text, LANG_TARGET[lang], undefined, `comment:${item.id}`);
      setComments((prev) =>
        prev.map((c) =>
          c.id === item.id
            ? { ...c, translatedText: result.translated_text, sourceLang: result.source_lang, showTranslated: true, translating: false }
            : c
        )
      );
    } catch {
      setComments((prev) => prev.map((c) => (c.id === item.id ? { ...c, translating: false } : c)));
    }
  };

  return (
    <article id={`post-${post.id}`} className={`w-full bg-neutral-900/60 border rounded-2xl mb-4 overflow-hidden shadow-lg shadow-black/40 transition-colors duration-200 hover:border-neutral-700 ${highlighted ? 'border-skyBlue ring-2 ring-skyBlue/30' : 'border-slate-800/80'}`}>
      <div className="p-4 sm:p-5 flex items-center gap-3">
        <UserAvatar name={post.author} avatarUrl={post.avatarUrl} className="w-9 h-9 text-lg" />
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold text-slate-100 truncate">{post.author}</h3>
          <p className="text-[10px] text-slate-500">
            {localizedCountryName(post.country, lang)} • {localizedRole(post.role, lang, t('studentRole'))} • {post.time}
          </p>
        </div>
        <button
          onClick={async () => {
            const previous = saved;
            const next = !previous;
            setSaved(next);
            onSavedChange?.(post.id, next);
            try {
              const result = await toggleSavePost(token, post.id);
              setSaved(result.is_saved);
              onSavedChange?.(post.id, result.is_saved);
            } catch {
              setSaved(previous);
              onSavedChange?.(post.id, previous);
            }
          }}
          aria-label={t('savePost')}
          className={`transition-colors ${saved ? 'text-skyBlue' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <Bookmark className="w-5 h-5" fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      {post.body && (
        <div className="px-4 sm:px-5 pb-3">
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
            {showTranslation && translatedBody ? translatedBody : post.body}
          </p>
          {showTranslation && translatedBody && (
            <p className="mt-1 text-[10px] text-skyBlue/80">
              ({t('translatedFrom').replace('{lang}', langDisplayName(translationSource, lang))})
            </p>
          )}
          {canTranslate && (
            <button
              type="button"
              onClick={handleTranslatePost}
              disabled={translating}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-skyBlue transition-colors disabled:opacity-60"
            >
              {translating ? `🌐 ${t('translating')}` : showTranslation ? `🔙 ${t('showOriginal')}` : `🌐 ${t('translate')}`}
            </button>
          )}
          {translationError && <p className="mt-1 text-[10px] text-red-400">{translationError}</p>}
        </div>
      )}

      {imageSrc && (
        <div className="mx-4 sm:mx-5 mb-4 overflow-hidden rounded-xl border border-slate-800/80">
          <img src={imageSrc} alt={post.media?.title || t('postMedia')} className="w-full max-h-96 object-cover" />
        </div>
      )}

      {isPdf && fileHref && (
        <a
          href={fileHref}
          target="_blank"
          rel="noreferrer"
          className="mx-4 sm:mx-5 mb-4 flex items-center gap-2 rounded-xl border border-slate-800/80 bg-black/60 px-3 py-2.5 text-xs text-emerald-400 hover:border-emerald-500/40 transition-colors"
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span className="truncate">{post.media?.fileName || t('pdfDocument')}</span>
        </a>
      )}

      {!imageSrc && !isPdf && post.media && (post.media.title || post.media.description || post.media.badge) && (
        <div className="mx-4 sm:mx-5 mb-4 bg-gradient-to-br from-neutral-900 via-neutral-900 to-skyBlue/10 rounded-xl p-5 flex flex-col items-center text-center border border-slate-800/80">
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

      <div className="px-4 sm:px-5 pb-4 flex items-center gap-5 text-slate-400">
        <button
          onClick={async () => {
            try {
              const nextLiked = !liked;
              setLiked(nextLiked);
              setLikeCount((c) => Math.max(0, c + (nextLiked ? 1 : -1)));
              const res = await likePost(token, pid);
              if (res?.liked !== undefined) setLiked(Boolean(res.liked));
              if (res?.likes_count !== undefined) setLikeCount(res.likes_count);
            } catch {
              setLiked((current) => !current);
              setLikeCount((c) => Math.max(0, c + (liked ? 1 : -1)));
            }
          }}
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
          {commentCount}
        </button>
        <button className="flex items-center gap-1.5 text-xs hover:text-skyBlue transition-colors" aria-label={t('sharePost')}>
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
        <div className="px-4 sm:px-5 pb-4 border-t border-slate-800/80 pt-4 space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="space-y-0.5">
              <p className="text-xs text-slate-400">
                <span className="text-slate-200 font-semibold">{c.author}:</span>{' '}
                {c.showTranslated && c.translatedText ? c.translatedText : c.text}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTranslateComment(c)}
                  disabled={c.translating}
                  className="text-[10px] text-slate-500 hover:text-skyBlue transition-colors disabled:opacity-60"
                >
                  {c.translating ? `🌐 ${t('translating')}` : c.showTranslated ? `🔙 ${t('showOriginal')}` : `🌐 ${t('translate')}`}
                </button>
                {c.showTranslated && c.translatedText && (
                  <span className="text-[9px] text-skyBlue/70">
                    {t('translatedFrom').replace('{lang}', langDisplayName(c.sourceLang, lang))}
                  </span>
                )}
              </div>
            </div>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const text = comment.trim();
              if (!text) return;
              try {
                setComments((prev) => [...prev, { id: Date.now().toString(), author: currentAuthorName, text }]);
                setCommentCount((c) => c + 1);
                setComment('');
                const res = await commentPost(token, pid, text);
                if (res?.comments_count !== undefined) setCommentCount(res.comments_count);
              } catch {
                setComment(text);
              }
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