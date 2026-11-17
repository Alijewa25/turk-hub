import React, { useEffect, useState } from 'react';
import { ArrowLeft, Edit3, MessageCircle, Rocket, UserPlus, UserCheck, X } from 'lucide-react';
import { flagOf, localizedCountryName, localizedRole, useI18n } from '../i18n';
import { API_URL, fetchFollowers, fetchFollowing, fetchProjects, fetchSavedPosts, fetchUserPosts, fetchUserStats, followUser, mediaUrl, ProjectItem, unfollowUser, uploadAvatar } from '../api';
import { PostCard } from './PostCard';

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
  token,
  onLogout,
  viewUserId,
  onClearView,
  onClearViewUser,
  onNavigate: _onNavigate,
  onOpenMessages,
  onUserUpdated,
}) => {
  const { t, lang } = useI18n();
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
  const [followList, setFollowList] = useState<any[]>([]);
  const [followLoading, setFollowLoading] = useState(false);
  const [followPending, setFollowPending] = useState<Set<number>>(new Set());
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState<'posts' | 'projects' | 'saved'>('posts');
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [userProjects, setUserProjects] = useState<ProjectItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const isSelf = !viewUserId || viewUserId === user?.id;
  const currentToken = token || localStorage.getItem('token');

  const openFollowList = async (kind: 'followers' | 'following') => {
    const targetId = viewUserId || user?.id;
    if (!targetId) return;
    setShowFollowList(kind);
    setFollowLoading(true);
    try {
      setFollowList(kind === 'followers'
        ? await fetchFollowers(targetId, currentToken)
        : await fetchFollowing(targetId, currentToken));
    } finally {
      setFollowLoading(false);
    }
  };

  useEffect(() => {
    if (activeProfileTab !== 'saved' || !isSelf) return;
    fetchSavedPosts(currentToken).then(setSavedPosts).catch(() => setSavedPosts([]));
  }, [activeProfileTab, currentToken, isSelf]);

  const toggleListFollow = async (item: any) => {
    if (!item?.id || item.id === user?.id || followPending.has(item.id)) return;
    setFollowPending((prev) => new Set(prev).add(item.id));
    try {
      const result = item.is_following
        ? await unfollowUser(currentToken, item.id)
        : await followUser(currentToken, item.id);
      setFollowList((prev) => prev.map((entry) => entry.id === item.id
        ? { ...entry, is_following: result.following }
        : entry));
    } finally {
      setFollowPending((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    const targetId = viewUserId || user?.id;

    if (targetId) {
      setProjectsLoading(true);
      fetchUserPosts(targetId, currentToken || null)
        .then((data) => {
          if (!cancelled) setUserPosts(data);
        })
        .catch(() => {
          if (!cancelled) setUserPosts([]);
        });
      fetchProjects(currentToken || null)
        .then((allProjects) => {
          if (cancelled) return;
          const matching = allProjects.filter((project) => {
            const ownerId = project.owner_id ?? project.creator_id;
            if (ownerId === targetId) return true;
            const memberIds = [
              ...(project.member_ids || []),
              ...(project.participant_ids || []),
              ...(project.members || []).map((member) => member.id ?? member.user_id),
              ...(project.participants || []).map((member) => member.id ?? member.user_id),
            ];
            return memberIds.includes(targetId);
          });
          setUserProjects(matching);
        })
        .catch(() => {
          if (!cancelled) setUserProjects([]);
        })
        .finally(() => {
          if (!cancelled) setProjectsLoading(false);
        });
    }

    if (!isSelf && viewUserId) {
      setProfileUser(null);
      fetchUserStats(currentToken || null, viewUserId)
        .then((data) => {
          if (cancelled) return;
          setProfileUser(data);
          setIsFollowing(Boolean(data.is_following));
          setStats({
            followers: data.followers_count || 0,
            following: data.following_count || 0,
          });
        })
        .catch(() => {
          if (!cancelled) setProfileUser(null);
        });

    } else {
      setProfileUser(user);
      setIsFollowing(false);
      setUserPosts(posts.length ? posts : []);
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

  const toggleProfileFollow = async () => {
    if (!profileUser?.id || isSelf) return;
    const result = isFollowing
      ? await unfollowUser(currentToken, profileUser.id)
      : await followUser(currentToken, profileUser.id);
    setIsFollowing(Boolean(result.following));
    setStats((prev) => ({ ...prev, followers: result.followers }));
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
  const profileItems = activeProfileTab === 'posts' ? userPosts : savedPosts;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 pb-12">
      {!isSelf && handleBack && (
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-xs text-sky-400 hover:underline mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> {t('back')}
        </button>
      )}

      <div className="p-4 sm:p-6 bg-neutral-900 border border-neutral-800 rounded-2xl">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="relative group">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-neutral-800 border-2 border-sky-500 overflow-hidden flex items-center justify-center text-2xl font-bold">
              {currentAvatar ? (
                <img src={mediaUrl(currentAvatar)} alt="" className="w-full h-full object-cover" />
              ) : (
                profileUser?.full_name?.[0] || profileUser?.username?.[0] || t('userGeneric')[0]
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-100">{profileUser?.full_name || t('userGeneric')}</h2>
            <p className="text-xs text-slate-400">@{profileUser?.username}</p>
            <p className="text-xs text-slate-400 mt-2">{flagOf(profileUser?.country)} {localizedCountryName(profileUser?.country, lang)} · {localizedRole(profileUser?.university, lang, t('studentRole'))}</p>
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
            <div className="flex gap-2">
              <button
                onClick={() => void toggleProfileFollow()}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-skyBlue text-black text-xs font-bold hover:bg-skyBlue-hover"
              >
                {isFollowing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                {isFollowing ? t('following') : t('follow')}
              </button>
              <button
                onClick={() => {
                const target = profileUser || { id: viewUserId };
                if (onOpenMessages) {
                  onOpenMessages(target);
                } else if (_onNavigate) {
                  _onNavigate('messages', { messageUser: target });
                }
              }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-800 bg-black/60 text-xs text-slate-300 hover:text-skyBlue hover:border-skyBlue/40 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                {t('sendMessage')}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-5 mt-6 pt-4 border-t border-neutral-800 text-xs text-slate-400">
          <div><span className="font-bold text-slate-100">{userPosts.length}</span> {t('postsLabel')}</div>
          <div><span className="font-bold text-slate-100">{userProjects.length}</span> {t('projectsLabel')}</div>
          <button onClick={() => void openFollowList('followers')} className="hover:text-skyBlue"><span className="font-bold text-slate-100">{stats.followers}</span> {t('followersLabel')}</button>
          <button onClick={() => void openFollowList('following')} className="hover:text-skyBlue"><span className="font-bold text-slate-100">{stats.following}</span> {t('followingLabel')}</button>
        </div>
      </div>

      <div className="flex w-full border-b border-neutral-800">
        <button onClick={() => setActiveProfileTab('posts')} className={`flex-1 py-3 text-xs font-bold ${activeProfileTab === 'posts' ? 'text-skyBlue border-b-2 border-skyBlue' : 'text-slate-500'}`}>{t('postsLabel')}</button>
        <button onClick={() => setActiveProfileTab('projects')} className={`flex-1 py-3 text-xs font-bold ${activeProfileTab === 'projects' ? 'text-skyBlue border-b-2 border-skyBlue' : 'text-slate-500'}`}>{t('projectsLabel')}</button>
        <button onClick={() => setActiveProfileTab('saved')} className={`flex-1 py-3 text-xs font-bold ${activeProfileTab === 'saved' ? 'text-skyBlue border-b-2 border-skyBlue' : 'text-slate-500'}`}>{t('savedPosts')}</button>
      </div>

      <div className="flex flex-col gap-4 w-full">
        {activeProfileTab === 'projects' ? (
          projectsLoading ? (
            <p className="text-xs text-slate-500 text-center py-8">{t('loadingProjects')}</p>
          ) : userProjects.length ? (
            userProjects.map((project) => {
              const targets = (project.target_countries || '').split(',').map((country) => country.trim()).filter(Boolean);
              const skills = (project.required_skills || '').split(',').map((skill) => skill.trim()).filter(Boolean);
              const memberCount = project.member_count ?? project.members_count;
              return (
                <article key={project.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-skyBlue/30 bg-skyBlue/10 text-skyBlue">
                      <Rocket className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-100">{project.title}</h3>
                      <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-400">{project.description}</p>
                    </div>
                  </div>
                  {skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {skills.map((skill) => (
                        <span key={skill} className="rounded-full border border-neutral-700 bg-black/40 px-2.5 py-1 text-[10px] text-slate-400">{skill}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    {targets.map((country) => (
                      <span key={country} className="rounded-full border border-skyBlue/30 bg-skyBlue/10 px-2 py-1 text-skyBlue">{flagOf(country)} {localizedCountryName(country, lang)}</span>
                    ))}
                    {memberCount !== undefined && <span>{memberCount} {t('teamMember')}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => _onNavigate?.('projects', { projectId: project.id })}
                    className="mt-4 rounded-lg bg-skyBlue px-3 py-2 text-xs font-bold text-black hover:bg-skyBlue-hover"
                  >
                    {t('joinAction')}
                  </button>
                </article>
              );
            })
          ) : <p className="text-xs text-slate-500 text-center py-8">{t('noProjects')}</p>
        ) : profileItems.length ? profileItems.map((item: any) => (
          <PostCard
            key={item.id}
            post={{
              id: String(item.id),
              authorId: item.user_id,
              author: item.author?.full_name || profileUser?.full_name || t('userGeneric'),
              country: item.author?.country || profileUser?.country || '',
              role: item.author?.university || profileUser?.university || t('studentRole'),
              time: item.created_at ? new Date(item.created_at).toLocaleString() : '',
              body: item.body || '',
              media: item.image_url || item.file_url ? { image: item.image_url, fileUrl: item.file_url, fileName: item.file_name } : undefined,
              likes: item.likes_count || 0,
              comments: item.comments_count || 0,
              is_liked: item.is_liked ?? item.liked_by_me ?? false,
              liked_by_me: item.liked_by_me ?? item.is_liked ?? false,
              is_saved: item.is_saved ?? false,
              sourceLang: item.source_lang || undefined,
            }}
            token={currentToken}
            postId={item.id}
            user={user}
            onSavedChange={(postId, isSaved) => {
              if (!isSaved && activeProfileTab === 'saved') {
                setSavedPosts((prev) => prev.filter((savedPost) => savedPost.id !== Number(postId)));
              }
            }}
          />
        )) : <p className="text-xs text-slate-500 text-center py-8">{t('empty')}</p>}
      </div>

      {showFollowList && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80" onClick={() => setShowFollowList(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-4 max-h-[60vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-100">{showFollowList === 'followers' ? t('followersList') : t('followingList')}</h3>
              <button onClick={() => setShowFollowList(null)} className="text-slate-500">×</button>
            </div>
            <div className="space-y-2">
              {followLoading ? <p className="text-xs text-slate-500">{t('loading')}</p> : followList.map((u: any) => (
                <div key={u.id} role="button" tabIndex={0} onClick={() => { setShowFollowList(null); _onNavigate?.('profile', u); }} onKeyDown={(event) => { if (event.key === 'Enter') { setShowFollowList(null); _onNavigate?.('profile', u); } }} className="w-full flex items-center gap-2 p-2 rounded-xl border border-neutral-800 text-left hover:border-skyBlue/40">
                  <span className="w-9 h-9 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center">{u.profile_picture || u.avatar_url ? <img src={mediaUrl(u.profile_picture || u.avatar_url)} alt="" className="w-full h-full object-cover" /> : flagOf(u.country)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-100 truncate">{u.full_name}</p>
                    <p className="text-[10px] text-slate-500 truncate">@{u.username || u.id}</p>
                  </div>
                  <button
                    onClick={(event) => { event.stopPropagation(); void toggleListFollow(u); }}
                    className="px-2 py-1 text-[10px] text-skyBlue"
                  >
                    {u.is_following ? <><UserCheck className="inline w-3 h-3" /> {t('following')}</> : <><UserPlus className="inline w-3 h-3" /> {t('follow')}</>}
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
                        {editName?.[0] || t('userGeneric')[0]}
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
                placeholder={t('usernameShort')}
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