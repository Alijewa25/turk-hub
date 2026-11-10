import React, { useEffect, useState } from 'react';
import { ArrowLeft, Edit3, MessageCircle, X } from 'lucide-react';
import { flagOf, useI18n } from '../i18n';
import { API_URL, fetchUserPosts, fetchUserStats, mediaUrl, uploadAvatar } from '../api';

interface ProfileViewProps {
  user: any;
  posts: any[];
  projects: any[];
  stats?: any;
  token?: string | null;
  onLogout: () => void;
  viewUserId?: number | null;
  onClearView?: () => void;
  onClearViewUser?: () => void;
  onNavigate?: (tab: string, targetUser?: any) => void;
  onOpenMessages?: (user: any) => void;
  onUserUpdated?: (updatedUser: any) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  posts,
  projects,
  token,
  onLogout,
  viewUserId,
  onClearView,
  onClearViewUser,
  onNavigate: _onNavigate,
  onOpenMessages,
  onUserUpdated,
}) => {
  const { t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [profileUser, setProfileUser] = useState<any>(user);
  const [userPosts, setUserPosts] = useState<any[]>(posts);
  const [stats, setStats] = useState({ followers: 0, following: 0 });
  const [editName, setEditName] = useState(user?.full_name || '');
  const [editUsername, setEditUsername] = useState(user?.username || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || user?.profile_picture || '');
  const [uploading, setUploading] = useState(false);
  const [showFollowList, setShowFollowList] = useState<'followers' | 'following' | null>(null);
  const [followList] = useState<any[]>([]);

  const isSelf = !viewUserId || viewUserId === user?.id;
  const currentToken = token || localStorage.getItem('token');

  useEffect(() => {
    let cancelled = false;

    if (!isSelf && viewUserId) {
      setProfileUser(null);
      fetchUserStats(currentToken || null, viewUserId)
        .then((data) => {
          if (cancelled) return;
          setProfileUser(data);
          setStats({
            followers: data.followers_count || 0,
            following: data.following_count || 0,
          });
        })
        .catch(() => {
          if (!cancelled) setProfileUser(null);
        });

      fetchUserPosts(viewUserId, currentToken || null)
        .then((data) => {
          if (!cancelled) setUserPosts(data);
        })
        .catch(() => {
          if (!cancelled) setUserPosts([]);
        });
    } else {
      setProfileUser(user);
      setUserPosts(posts);
      setAvatarUrl(user?.avatar_url || user?.profile_picture || '');
      setEditName(user?.full_name || '');
      setEditUsername(user?.username || '');
      setEditBio(user?.bio || '');
      if (user?.id) {
        fetchUserStats(currentToken || null, user.id)
          .then((data) => {
            if (cancelled) return;
            setStats({
              followers: data.followers_count || 0,
              following: data.following_count || 0,
            });
          })
          .catch(() => undefined);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [viewUserId, user, posts, currentToken, isSelf]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await uploadAvatar(currentToken, formData);
      if (res?.avatar_url || res?.url) {
        const newUrl = res.avatar_url || res.url;
        setAvatarUrl(newUrl);
        setProfileUser((prev: any) => ({ ...prev, avatar_url: newUrl, profile_picture: newUrl }));
        if (onUserUpdated) {
          onUserUpdated({ ...user, avatar_url: newUrl, profile_picture: newUrl });
        }
      }
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          full_name: editName,
          username: editUsername,
          bio: editBio,
          avatar_url: avatarUrl,
          profile_picture: avatarUrl,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProfileUser(updated);
        if (onUserUpdated) onUserUpdated(updated);
        setIsEditing(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBack = onClearView || onClearViewUser;
  const currentAvatar = avatarUrl || profileUser?.avatar_url || profileUser?.profile_picture;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {!isSelf && handleBack && (
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-xs text-sky-400 hover:underline mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> {t('back')}
        </button>
      )}

      <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl relative">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="w-20 h-20 rounded-full bg-neutral-800 border-2 border-sky-500 overflow-hidden flex items-center justify-center text-2xl font-bold">
              {currentAvatar ? (
                <img src={mediaUrl(currentAvatar)} alt="" className="w-full h-full object-cover" />
              ) : (
                profileUser?.full_name?.[0] || 'T'
              )}
            </div>
          </div>

          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-100">{profileUser?.full_name || t('userGeneric')}</h2>
            <p className="text-xs text-slate-400">@{profileUser?.username}</p>
            <p className="text-xs text-slate-300 mt-2">{profileUser?.bio || t('noBio')}</p>
          </div>

          {isSelf ? (
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-slate-400 hover:text-sky-400 bg-neutral-800 rounded-lg"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={onLogout}
                className="p-2 text-red-400 hover:text-red-300 bg-neutral-800 rounded-lg"
                title={t('logoutTitle')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                const target = profileUser || { id: viewUserId };
                if (onOpenMessages) {
                  onOpenMessages(target);
                } else if (_onNavigate) {
                  _onNavigate('messages', { messageUser: target });
                }
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-800 bg-black/60 text-xs text-slate-300 hover:text-skyBlue hover:border-skyBlue/40 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              {t('sendMessage')}
            </button>
          )}
        </div>

        <div className="flex gap-6 mt-6 pt-4 border-t border-neutral-800 text-xs text-slate-400">
          <div><span className="font-bold text-slate-100">{userPosts.length}</span> {t('postsLabel')}</div>
          <div><span className="font-bold text-slate-100">{projects.length}</span> {t('projectsLabel')}</div>
          <div><span className="font-bold text-slate-100">{stats.followers}</span> {t('followersLabel')}</div>
          <div><span className="font-bold text-slate-100">{stats.following}</span> {t('followingLabel')}</div>
        </div>
      </div>

      {showFollowList && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80" onClick={() => setShowFollowList(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-4 max-h-[60vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-100">{showFollowList === 'followers' ? t('followersList') : t('followingList')}</h3>
              <button onClick={() => setShowFollowList(null)} className="text-slate-500">×</button>
            </div>
            <div className="space-y-2">
              {followList.map((u: any) => (
                <div key={u.id} className="flex items-center gap-2 p-2 rounded-xl border border-neutral-800">
                  <span className="text-lg">{flagOf(u.country)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-100 truncate">{u.full_name}</p>
                    <p className="text-[10px] text-slate-500 truncate">@{u.username || u.id}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (onOpenMessages) onOpenMessages(u);
                      else if (_onNavigate) _onNavigate('messages', { messageUser: u });
                      setShowFollowList(null);
                    }}
                    className="px-2 py-1 text-[10px] text-skyBlue"
                  >
                    DM
                  </button>
                </div>
              ))}
              {followList.length === 0 && <p className="text-xs text-slate-500">{t('empty')}</p>}
            </div>
          </div>
        </div>
      )}

      {isEditing && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl w-full max-w-md space-y-4 relative">
            <button onClick={() => setIsEditing(false)} className="absolute top-4 right-4 text-slate-400">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-sm font-bold text-slate-100">{t('editProfile')}</h3>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">{t('profilePictureUpload')}</label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-neutral-800 border border-neutral-700">
                    {currentAvatar ? (
                      <img src={mediaUrl(currentAvatar)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm font-bold">
                        {editName?.[0] || 'T'}
                      </div>
                    )}
                  </div>
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} className="text-xs text-slate-400" />
                </div>
              </div>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('fullName')}
                className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-lg text-xs text-slate-100 focus:outline-none"
              />
              <input
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                placeholder="username"
                className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-lg text-xs text-slate-100 focus:outline-none"
              />
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                rows={3}
                placeholder={t('bio')}
                className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-lg text-xs text-slate-100 resize-none focus:outline-none"
              />
            </div>
            <button
              onClick={saveProfile}
              disabled={uploading}
              className="w-full py-2 rounded-lg bg-sky-500 text-black text-xs font-bold hover:opacity-90"
            >
              {uploading ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};