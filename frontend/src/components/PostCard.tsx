import React, { useEffect, useState } from 'react';
import { Bookmark, FileText, Globe, Heart, MessageCircle, RotateCcw, Share2, Sparkles } from 'lucide-react';
import {
  ApiComment,
  StoryAuthor,
  commentPost,
  deleteComment,
  deletePost,
  fetchPostComments,
  fetchPostLikes,
  likePost,
  mediaUrl,
  toggleSavePost,
  translateCached,
  translationChanged,
} from '../api';
import { LANG_TARGET, langDisplayName, localizedCountryName, localizedRole, normalizeLangCode, useI18n } from '../i18n';
import { exactDateTime, hybridTimestamp } from '../dateTime';
import { UserAvatar } from './UserAvatar';
import { AccountBadge } from './AccountBadge';

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
  createdAt?: string | null;
  body: string;
  media?: PostMedia;
  likes: number;
  comments: number;
  is_liked?: boolean | null;
  liked_by_me?: boolean | null;
  is_saved?: boolean | null;
  sourceLang?: string | null;
  accountType?: 'individual' | 'organization';
  orgName?: string | null;
  isVerified?: boolean;
  isAdmin?: boolean;
}

interface PostComment {
  id: string;
  author: string;
  authorId?: number;
  text: string;
  parentId?: number | null;
  createdAt?: string | null;
  authorAvatar?: string | null;
  replies?: PostComment[];
  translatedText?: string;
  sourceLang?: string;
  showTranslated?: boolean;
  translating?: boolean;
  autoTried?: boolean;
  sameLanguage?: boolean;
}

function updateCommentTree(
  comments: PostComment[],
  commentId: string,
  update: Partial<PostComment>
): PostComment[] {
  return comments.map((comment) =>
    comment.id === commentId
      ? { ...comment, ...update }
      : { ...comment, replies: updateCommentTree(comment.replies || [], commentId, update) }
  );
}

function flattenCommentTree(comments: PostComment[]): PostComment[] {
  return comments.flatMap((comment) => [comment, ...flattenCommentTree(comment.replies || [])]);
}

function resetCommentTranslations(comments: PostComment[], targetLang: string): PostComment[] {
  return comments.map((comment) => ({
    ...comment,
    translatedText: undefined,
    showTranslated: false,
    translating: false,
    autoTried: false,
    sameLanguage: normalizeLangCode(comment.sourceLang) === targetLang,
    replies: resetCommentTranslations(comment.replies || [], targetLang),
  }));
}

interface PostCardProps {
  post: PostData;
  onJoin?: () => void;
  token?: string | null;
  postId?: string | number;
  user?: any;
  highlighted?: boolean;
  onSavedChange?: (postId: string | number, isSaved: boolean) => void;
  onDeleted?: (postId: string | number) => void;
  onViewProfile?: (userId: number) => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, onJoin, token = null, postId, user, highlighted = false, onSavedChange, onDeleted, onViewProfile }) => {
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
  const [postSameLanguage, setPostSameLanguage] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showLikes, setShowLikes] = useState(false);
  const [likers, setLikers] = useState<StoryAuthor[]>([]);
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const pid = postId ?? post.id;

  useEffect(() => {
    setLiked(post.is_liked ?? post.liked_by_me ?? false);
    setLikeCount(post.likes || 0);
    setCommentCount(post.comments || 0);
  }, [post.id, post.is_liked, post.liked_by_me, post.likes, post.comments]);

  useEffect(() => {
    setSaved(post.is_saved ?? false);
  }, [post.id, post.is_saved]);

  useEffect(() => {
    if (!showComments) return;
    fetchPostComments(token, pid)
      .then((items) => {
        const mapComment = (item: ApiComment): PostComment => ({
          id: String(item.id),
          authorId: item.author?.id ?? item.user_id,
          author: item.author?.full_name || item.author?.username || 'User',
          authorAvatar: item.author?.avatar_url ?? item.author?.profile_picture,
          text: item.text || item.body,
          sourceLang: item.source_lang || undefined,
          parentId: item.parent_id,
          createdAt: item.created_at,
          replies: (item.replies || []).map(mapComment),
        });
        setComments(items.map(mapComment));
      })
      .catch(() => setComments([]));
  }, [showComments, pid, token]);

  useEffect(() => {
    setTranslatedBody('');
    setTranslationSource('');
    setShowTranslation(false);
    setPostSameLanguage(false);
    setTranslationError('');
    setComments((prev) => resetCommentTranslations(prev, LANG_TARGET[lang]));
  }, [post.body, lang]);

  useEffect(() => {
    setTranslatedBody('');
    setTranslationSource('');
    setShowTranslation(false);
    setTranslationError('');
  }, [lang, post.id]);

  useEffect(() => {
    const target = LANG_TARGET[lang];
    flattenCommentTree(comments).forEach((item) => {
      if (!item.text.trim() || item.autoTried || item.translatedText || item.translating) return;
      if (normalizeLangCode(item.sourceLang) === target) {
        setComments((prev) => updateCommentTree(prev, item.id, { autoTried: true, sameLanguage: true }));
        return;
      }
      setComments((prev) => updateCommentTree(prev, item.id, { translating: true, autoTried: true }));
      translateCached(token, item.text, target, item.sourceLang, `comment:${item.id}`)
        .then((result) => {
          const useful = translationChanged(result, item.text);
          setComments((prev) => updateCommentTree(prev, item.id, {
            translatedText: useful ? result.translated_text : undefined,
            sourceLang: result.source_lang,
            showTranslated: useful,
            translating: false,
            sameLanguage: result.same_language === true || normalizeLangCode(result.source_lang) === target,
          }));
        })
        .catch(() => setComments((prev) => updateCommentTree(prev, item.id, { translating: false })));
    });
  }, [comments, lang, token]);

  const imageSrc = mediaUrl(post.media?.image);
  const fileHref = mediaUrl(post.media?.fileUrl);
  const isPdf =
    Boolean(fileHref) &&
    (post.media?.fileName?.toLowerCase().endsWith('.pdf') ||
      fileHref.toLowerCase().includes('.pdf') ||
      (!post.media?.image && Boolean(post.media?.fileUrl)));

  const currentAuthorName = user?.full_name || user?.username || t('userGeneric');
  const sourceLang = normalizeLangCode(post.sourceLang);
  const targetLang = LANG_TARGET[lang];
  const canTranslate = Boolean(post.body?.trim()) && !postSameLanguage && sourceLang !== targetLang;

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
      const result = await translateCached(token, post.body, LANG_TARGET[lang], sourceLang || undefined, `post:${post.id}`);
      setTranslationSource(result.source_lang);
      const useful = translationChanged(result, post.body);
      setPostSameLanguage(result.same_language === true || normalizeLangCode(result.source_lang) === targetLang);
      setTranslatedBody(useful ? result.translated_text : '');
      setShowTranslation(useful);
    } catch {
      setTranslationError(t('translationFailed'));
    } finally {
      setTranslating(false);
    }
  };

  const handleTranslateComment = async (item: PostComment) => {
    if (item.sameLanguage || normalizeLangCode(item.sourceLang) === targetLang) return;
    if (item.showTranslated) {
      setComments((prev) => updateCommentTree(prev, item.id, { showTranslated: false }));
      return;
    }
    if (item.translatedText) {
      setComments((prev) => updateCommentTree(prev, item.id, { showTranslated: true }));
      return;
    }
    setComments((prev) => updateCommentTree(prev, item.id, { translating: true, autoTried: true }));
    try {
      const result = await translateCached(token, item.text, LANG_TARGET[lang], item.sourceLang, `comment:${item.id}`);
      const useful = translationChanged(result, item.text);
      setComments((prev) => updateCommentTree(prev, item.id, {
        translatedText: useful ? result.translated_text : undefined,
        sourceLang: result.source_lang,
        showTranslated: useful,
        translating: false,
        sameLanguage: result.same_language === true || normalizeLangCode(result.source_lang) === targetLang,
      }));
    } catch {
      setComments((prev) => updateCommentTree(prev, item.id, { translating: false }));
    }
  };

  const renderComment = (c: PostComment, depth = 0): React.ReactNode => {
    const canDelete = Boolean(user?.is_admin) || c.authorId === user?.id;
    const commentSourceLang = normalizeLangCode(c.sourceLang);
    const canTranslateComment = Boolean(c.text.trim()) && !c.sameLanguage && commentSourceLang !== targetLang;
    return (
      <div key={c.id} className={depth ? 'ml-5 border-l border-neutral-800 pl-3' : ''}>
        <p className="text-xs text-slate-400" title={exactDateTime(c.createdAt)}>
          <span className="text-slate-200 font-semibold">{c.author}:</span>{' '}
          {c.showTranslated && c.translatedText ? c.translatedText : c.text}
        </p>
        <p className="mt-0.5 text-[9px] text-slate-600">{hybridTimestamp(c.createdAt)}</p>
        <div className="flex items-center gap-2 mt-1">
          {canTranslateComment && (
            <button type="button" onClick={() => handleTranslateComment(c)} disabled={c.translating}
              className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 disabled:opacity-60">
              {c.showTranslated ? <RotateCcw className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
              {c.translating ? t('translating') : c.showTranslated ? t('showOriginal') : t('translate')}
            </button>
          )}
          <button type="button" onClick={() => { setReplyTo(c); setComment(''); }} className="text-xs text-slate-500 hover:text-skyBlue">{t('reply')}</button>
          {canDelete && (
            <button type="button" onClick={() => {
              if (!window.confirm('Delete this comment?')) return;
              deleteComment(token, Number(c.id)).then(() => {
                const removeComment = (items: PostComment[]): PostComment[] =>
                  items
                    .filter((item) => item.id !== c.id)
                    .map((item) => ({ ...item, replies: removeComment(item.replies || []) }));
                setComments((prev) => removeComment(prev));
                setCommentCount((count) => Math.max(0, count - 1));
              }).catch(() => window.alert('Could not delete comment.'));
            }} className="text-xs text-red-400 hover:text-red-300">{t('delete')}</button>
          )}
        </div>
        {(c.replies || []).map((reply) => renderComment(reply, depth + 1))}
      </div>
    );
  };

  return (
    <article id={`post-${post.id}`} className={`w-full bg-neutral-900/60 border rounded-2xl mb-4 overflow-hidden shadow-lg shadow-black/40 transition-colors duration-200 hover:border-neutral-700 ${highlighted ? 'border-skyBlue ring-2 ring-skyBlue/30' : 'border-slate-800/80'}`}>
      <div className="p-4 sm:p-5 flex items-center gap-3">
        <UserAvatar name={post.author} avatarUrl={post.avatarUrl} className="w-9 h-9 text-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-xs font-semibold text-slate-100">
              {post.accountType === 'organization' ? (post.orgName || post.author) : post.author}
            </h3>
            <AccountBadge accountType={post.accountType} isVerified={post.isVerified} isAdmin={post.isAdmin} compact />
          </div>
          <p className="text-[10px] text-slate-500" title={exactDateTime(post.createdAt)}>
            {localizedCountryName(post.country, lang)} • {localizedRole(post.role, lang, t('studentRole'))} • {hybridTimestamp(post.createdAt) || post.time}
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
        {(Boolean(user?.is_admin) || post.authorId === user?.id) && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu((value) => !value)}
              aria-label="Post actions"
              className="px-1 text-lg text-slate-500 hover:text-slate-200"
            >
              ...
            </button>
            {showMenu && (
              <div className="absolute right-0 top-7 z-20 w-28 rounded-lg border border-neutral-800 bg-neutral-950 p-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    if (window.confirm('Delete this post?')) {
                      deletePost(token, pid)
                        .then(() => onDeleted?.(pid))
                        .catch(() => window.alert('Could not delete post.'));
                    }
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10"
                >
                  {t('delete')}
                </button>
              </div>
            )}
          </div>
        )}
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
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors disabled:opacity-60"
            >
              {showTranslation ? <RotateCcw className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
              {translating ? t('translating') : showTranslation ? t('showOriginal') : t('translate')}
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
        </button>
        <button
          type="button"
          onClick={() => {
            setShowLikes(true);
            fetchPostLikes(token, pid).then(setLikers).catch(() => setLikers([]));
          }}
          className="text-xs hover:text-skyBlue hover:underline"
        >
          {likeCount} {t('likes')}
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
          {replyTo && (
            <div className="flex items-center justify-between rounded-lg bg-skyBlue/5 px-3 py-2 text-[10px] text-skyBlue">
              <span>{t('replyingTo').replace('{author}', replyTo.author)}</span>
              <button type="button" onClick={() => setReplyTo(null)} className="text-slate-500">{t('cancel')}</button>
            </div>
          )}
          {comments.map((c) => renderComment(c))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const text = comment.trim();
              if (!text) return;
              try {
                setComment('');
                const res = await commentPost(token, pid, text, replyTo ? Number(replyTo.id) : null);
                if (res?.comment) {
                  const created = res.comment;
                  const next: PostComment = {
                    id: String(created.id),
                    authorId: created.user_id,
                    author: currentAuthorName,
                    text,
                    parentId: created.parent_id,
                    createdAt: created.created_at,
                  };
                  if (replyTo) {
                    const appendReply = (items: PostComment[]): PostComment[] => items.map((item) => {
                      if (item.id === replyTo.id) {
                        return { ...item, replies: [...(item.replies || []), next] };
                      }
                      return { ...item, replies: appendReply(item.replies || []) };
                    });
                    setComments((prev) => appendReply(prev));
                  } else {
                    setComments((prev) => [...prev, next]);
                  }
                  setReplyTo(null);
                }
                setCommentCount((c) => c + 1);
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
      {showLikes && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80" onClick={() => setShowLikes(false)}>
          <div onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-950 p-4 max-h-[60vh] overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100">{likeCount} {t('likes')}</h3>
              <button type="button" onClick={() => setShowLikes(false)} className="text-slate-500 hover:text-slate-200">×</button>
            </div>
            <div className="space-y-2">
              {likers.map((liker) => (
                <button
                  type="button"
                  key={liker.id}
                  onClick={() => {
                    setShowLikes(false);
                    onViewProfile?.(liker.id);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-neutral-800 p-2 text-left hover:border-skyBlue/40"
                >
                  <UserAvatar name={liker.full_name} avatarUrl={liker.avatar_url ?? liker.profile_picture} className="w-9 h-9 text-sm" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-100">{liker.account_type === 'organization' ? liker.org_name || liker.full_name : liker.full_name}</p>
                    <p className="truncate text-[10px] text-slate-500">@{liker.username || liker.id} • {liker.country || liker.org_name || ''}</p>
                  </div>
                </button>
              ))}
              {!likers.length && <p className="py-6 text-center text-xs text-slate-500">{t('noLikesYet')}</p>}
            </div>
          </div>
        </div>
      )}
    </article>
  );
};