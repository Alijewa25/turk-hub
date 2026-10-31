import React, { useEffect, useState } from 'react';
import { ArrowLeft, Edit3, FileText, LogOut, MessageCircle, PenSquare, User, X } from 'lucide-react';
import { API_URL, fetchUserPosts, fetchUserStats, FollowUser, mediaUrl } from '../api';
import { useI18n } from '../i18n';

interface ProfileViewProps {
  user: any;
  posts: any[];
  projects: any[];
  stats?: { followers: number; following: number };
  onLogout: () => void;
  onNavigate?: (tab: string, payload?: any) => void;
  viewUserId?: number | null;
  onClearView?: () => void;
  token?: string | null;
}

function normalizeLocalPost(post: any) {
  const image = post.media?.image || post.image_url || post.media_url;
  const fileUrl = post.media?.fileUrl || post.file_url;
  const fileName = post.media?.fileName || post.file_name;
  const isPdf =
    Boolean(fileUrl) &&
    (String(fileName || '').toLowerCase().endsWith('.pdf') ||
      String(fileUrl).toLowerCase().includes('.pdf') ||
      post.media_type === 'pdf');

  return {
    id: String(post.id),
    body: post.body ?? post.content ?? '',
    image: image && !isPdf ? image : undefined,
    fileUrl: isPdf || (!image && fileUrl) ? fileUrl : undefined,
    fileName,
  };
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  posts = [],
  onLogout,
  onNavigate,
  viewUserId = null,
  onClearView,
  token = null,
  stats,
}) => {
  const { t } = useI18n();
  const viewingOther = Boolean(viewUserId && viewUserId !== user?.id);

  const [profile, setProfile] = useState<any>(user);
  const [profilePosts, setProfilePosts] = useState<any[]>(posts);
  const [profileStats, setProfileStats] = useState(stats || { followers: 0, following: 0 });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(user?.full_name || '');
  const [editUsername, setEditUsername] = useState(user?.username || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!viewingOther) {
      setProfile(user);
      setProfilePosts(posts.map(normalizeLocalPost));
      setProfileStats(stats || { followers: 0, following: 0 });
      setLoadError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError('');

    Promise.all([
      fetchUserStats(token, viewUserId as number),
      fetchUserPosts(viewUserId as number, token),
    ])
      .then(([info, apiPosts]: [FollowUser, any[]]) => {
        if (cancelled) return;
        setProfile(info);
        setProfileStats({ followers: info.followers_count, following: info.following_count });
        setProfilePosts(
          apiPosts.map((p) =>
            normalizeLocalPost({
              id: p.id,
              body: p.body,
              image_url: p.image_url,
              file_url: p.file_url,
              file_name: p.file_name,
            })
          )
        );
      })
      .catch(() => {
        if (!cancelled) setLoadError('Profil yüklənə bilmədi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    
  const handleAvatarUpload = async (e: any) => {
    const file = e.target.files?.[0];
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setFormData((prev: any) => ({ ...prev, avatar_url: data.url }));
      }
    } catch (err) { console.error(err); }
  };

  return () => {
      cancelled = true;
    };
  }, [viewingOther, viewUserId, token, user, posts, stats]);

  useEffect(() => {
    if (!viewingOther) {
      setEditName(user?.full_name || '');
      setEditUsername(user?.username || '');
      setEditBio(user?.bio || '');
    }
  }, [user, viewingOther]);

  const saveProfile = async () => {
    setUploading(true);
    try {
      const auth = token || localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth}`,
        },
        body: JSON.stringify({
          full_name: editName,
          username: editUsername,
          bio: editBio,
        }),
      });

      if (!res.ok) throw new Error('update failed');
      const updated = await res.json();
      setProfile(updated);
      localStorage.setItem('user', JSON.stringify(updated));
      setShowEdit(false);
    } catch {
      // keep modal open
    } finally {
      setUploading(false);
    }
  };

  const avatarSrc = mediaUrl(profile?.profile_picture || profile?.avatar_url);

  
  const handleAvatarUpload = async (e: any) => {
    const file = e.target.files?.[0];
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setFormData((prev: any) => ({ ...prev, avatar_url: data.url }));
      }
    } catch (err) { console.error(err); }
  };

  return (
    <section className="space-y-6 pb-20">
      {viewingOther && (
        <button
          onClick={() => onClearView?.()}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-skyBlue transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Geri
        </button>
      )}

      <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 text-center relative">
        <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-tr from-skyBlue to-emerald-400 p-0.5 mb-3 relative">
          <div className="w-full h-full bg-black rounded-full flex items-center justify-center overflow-hidden">
            {avatarSrc ? (
              <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-skyBlue" />
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-slate-500 animate-pulse">Profil yüklənir...</p>
        ) : loadError ? (
          <p className="text-xs text-red-400">{loadError}</p>
        ) : (
          <>
            <h2 className="text-lg font-bold text-slate-100">{profile?.full_name || 'İstifadəçi'}</h2>
            <p className="text-xs text-skyBlue font-medium">@{profile?.username || 'username'}</p>
            <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto">
              {profile?.bio || 'Türk Youth Hub İnnovatoru'}
            </p>
            <p className="mt-3 text-[11px] text-slate-500">
              {profileStats.followers} izləyici · {profileStats.following} izlənilən
            </p>
          </>
        )}

        <div className="mt-5 flex justify-center gap-3 flex-wrap">
          {viewingOther ? (
            <button
              onClick={() => onNavigate?.('messages', { messageUser: profile })}
              className="px-4 py-2 bg-skyBlue text-black text-xs font-bold rounded-xl hover:opacity-90 flex items-center gap-1.5 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Mesaj göndər
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowEdit(true)}
                className="px-4 py-2 bg-neutral-800 text-xs font-semibold text-slate-200 rounded-xl hover:bg-neutral-700 flex items-center gap-1.5 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" /> Profili Redaktə Et
              </button>
              <button
                onClick={onLogout}
                className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs font-semibold hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" /> {t('logout')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <PenSquare className="w-4 h-4 text-skyBlue" /> Paylaşımlar ({profilePosts.length})
        </h3>
        {profilePosts.length === 0 ? (
          <p className="text-xs text-slate-500 italic">Hələ heç bir paylaşım olunmayıb.</p>
        ) : (
          profilePosts.map((post) => (
            <div
              key={post.id}
              className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-xl text-xs text-slate-200 space-y-2"
            >
              {post.body && <p className="whitespace-pre-wrap">{post.body}</p>}
              {post.image && (
                <img
                  src={mediaUrl(post.image)}
                  alt="Media"
                  className="max-h-60 w-full rounded-lg object-cover border border-neutral-800"
                />
              )}
              {post.fileUrl && (
                <a
                  href={mediaUrl(post.fileUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-2 bg-black border border-neutral-800 rounded-lg text-emerald-400"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {post.fileName || 'PDF Sənədinə Bax / Yüklə'}
                </a>
              )}
            </div>
          ))
        )}
      </div>

      {showEdit && !viewingOther && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
              <h3 className="text-sm font-bold text-slate-100">Profili Redaktə Et</h3>
              <button onClick={() => setShowEdit(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Ad Soyad"
                className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-lg text-xs text-slate-100 focus:outline-none"
              />
              <input
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                placeholder="@username"
                className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-lg text-xs text-slate-100 focus:outline-none"
              />
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                rows={3}
                placeholder="Bio"
                className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-lg text-xs text-slate-100 resize-none focus:outline-none"
              />
            </div>
            <button
              onClick={saveProfile}
              disabled={uploading}
              className="w-full py-2 rounded-lg bg-skyBlue text-black text-xs font-bold hover:opacity-90"
            >
              {uploading ? 'Yadda saxlanılır...' : 'Yadda saxla'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
