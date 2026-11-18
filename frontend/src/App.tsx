import { useCallback, useEffect, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { AuthView } from './components/AuthView';
import { CountrySelection } from './components/CountrySelection';
import { Sidebar } from './components/layout/Sidebar';
import { RightPanel } from './components/layout/RightPanel';
import { TopHeader } from './components/layout/TopHeader';
import { MobileMenu } from './components/layout/MobileMenu';
import { StoriesBar } from './components/StoriesBar';
import { StoryViewer } from './components/StoryViewer';
import { PostCard, PostData } from './components/PostCard';
import { UserAvatar } from './components/UserAvatar';
import { CreatePostModal } from './components/CreatePostModal';
import { Dictionary } from './components/Dictionary';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExploreView } from './components/ExploreView';
import { ProfileView } from './components/ProfileView';
import { ProjectHub } from './components/ProjectHub';
import { RoomsView } from './components/RoomsView';
import { MessagesView } from './components/MessagesView';
import {
  ApiPost,
  API_URL,
  createNotificationWebSocket,
  createProject,
  fetchCurrentUser,
  fetchNotifications,
  fetchPosts,
  fetchProjects,
  fetchStories,
  fetchSuggestions,
  fetchUserStats,
  followUser,
  FollowUser,
  joinProject,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  NotificationItem,
  ProjectDraft,
  ProjectItem,
  publishStory,
  StoryItem,
  timeAgo,
  unfollowUser,
} from './api';
import { flagOf, formatNotificationText, translateStatic, useI18n } from './i18n';
import { Bell, MessageCircle, Sparkles, UserPlus } from 'lucide-react';

const INITIAL_POSTS: PostData[] = [
  {
    id: 'forum-2026-rules',
    author: 'TÜRK FORUM 2026 Təşkilat Komitəsi',
    country: 'Azerbaijan',
    role: 'Rəsmi',
    time: 'Bu gün',
    body: 'TÜRK FORUM 2026 - Rəsmi Sənədlər & Qaydalar.\n\nForumun məqsədi: Türk xalqları arasında akademik, mədəni və texnoloji əməkdaşlığı gücləndirmək.\n\nQaydalar: hörmətli müzakirə, elmi əsaslı arqument, çoxdilli ünsiyyətə açıq olmaq.\n\nƏtraflı sənədlər "Otaqlar/Chat" və ya Kəşf bölməsində "TÜRK FORUM 2026" altındadır.',
    media: {
      title: 'TÜRK FORUM 2026 - Rəsmi Sənədlər & Qaydalar',
      description: 'İştirak qaydaları, gündəm, və forum strukturu haqqında məlumat.',
      badge: 'Rəsmi Elan',
      image:
        'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80',
    },
    likes: 245,
    comments: 36,
  },
  {
    id: 'holberton-hackathon-2026',
    author: 'Holberton School Azerbaijan',
    country: 'Azerbaijan',
    role: 'Təhsil müəssisəsi',
    time: 'Bu gün',
    body: 'Holberton School Azerbaijan tərəfindən TÜRK HACKATHON 2026 elan olunur!\n\nMövzu: "Pan-Türk Texnologiyaları - Birgə Gələcək"\n\nİştirakçılar: Azərbaycan, Türkiyə, Qazaxıstan, Özbəkistan, Qırğızıstan, Türkmənistan tələbələri\n\nMüraciət: Holberton School Azerbaijan ofisində və onlayn.\n\nKomandalar yaratmaq və ideyalar paylaşmaq üçün Project Hub-dan istifadə edə bilərsiniz!',
    media: {
      title: 'Holberton & TÜRK FORUM 2026 Hackathon Elanı',
      description: '48 saatlıq hackathon - Türk dünyasının texnoloji gələcəyini birgə qururuq.',
      badge: 'Hackathon 2026',
      image:
        'https://images.unsplash.com/photo-1515187029135-18ee286d815b?auto=format&fit=crop&w=1200&q=80',
    },
    likes: 312,
    comments: 58,
  },
  {
    id: 'p1',
    author: 'Tahmina Aliyeva',
    country: 'Azerbaijan',
    role: 'BEU Innovator',
    time: '2 saat əvvəl',
    body: 'Türk dilləri arasında etimoloji və süni intellekt əsaslı anında tərcümə modulunu hazırlayırıq. 3+ ölkədən komanda yığırıq!',
    media: {
      title: 'AI-Powered Pan-Turkic Translator',
      description: 'Türk dilləri arasında etimoloji və süni intellekt əsaslı anında tərcümə modulu.',
      badge: 'Min. 3 Ölkə Komandası Tələb Olunur',
    },
    likes: 128,
    comments: 24,
  },
  {
    id: 'p2',
    author: 'Emre Yıldız',
    country: 'Türkiye',
    role: 'ODTU Mezunu',
    time: '5 saat əvvəl',
    body: 'Göktürk runelərini AR tətbiqində göstərmək üçün ilk prototip hazırdır. Qazaxıstan və Qırğızıstan tələbələri ilə sınaqdan keçiririk.',
    likes: 96,
    comments: 17,
  },
];

const VALID_TABS = new Set([
  'home',
  'explore',
  'rooms',
  'messages',
  'projects',
  'dictionary',
  'notifications',
  'profile',
]);

function restoreActiveTab(): string {
  const hash = window.location.hash.replace(/^#/, '');
  const stored = sessionStorage.getItem('th_active_tab');
  const candidate = hash || stored || 'home';
  return VALID_TABS.has(candidate) ? candidate : 'home';
}

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function loadNumberSet(key: string): Set<number> {
  const raw = loadStored<unknown>(key, []);
  return new Set<number>(Array.isArray(raw) ? (raw as number[]) : []);
}

function loadSeenStories(): Set<number> {
  return loadNumberSet('th_seen_stories');
}

function mapApiPost(p: ApiPost): PostData {
  const hasMedia = Boolean(p.image_url || p.file_url);
  return {
    id: String(p.id),
    authorId: p.user_id,
    author: p.author?.full_name || translateStatic('userGeneric'),
    avatarUrl: p.author?.profile_picture,
    country: p.author?.country || '',
    role: p.author?.university || translateStatic('studentRole'),
    time: timeAgo(p.created_at) || '',
    body: p.body || '',
    media: hasMedia
      ? {
          title: p.file_name || undefined,
          image: p.image_url || undefined,
          fileUrl: p.file_url || undefined,
          fileName: p.file_name || undefined,
        }
      : undefined,
    likes: p.likes_count || 0,
    comments: p.comments_count || 0,
    is_liked: p.is_liked ?? p.liked_by_me ?? false,
    liked_by_me: p.liked_by_me ?? p.is_liked ?? false,
    is_saved: p.is_saved ?? false,
    sourceLang: p.source_lang || undefined,
  };
}

export function App() {
  const { t, lang } = useI18n();
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any>(() => loadStored<any>('user', null));
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [activeTab, setActiveTab] = useState(restoreActiveTab);
  const [profileViewUserId, setProfileViewUserId] = useState<number | null>(() => {
    const stored = sessionStorage.getItem('th_profile_user_id');
    return stored ? Number(stored) : null;
  });
  const [messagesTarget, setMessagesTarget] = useState<any>(null);
  const [userPosts, setUserPosts] = useState<PostData[]>(() => loadStored<PostData[]>('th_user_posts', []));
  const [feedPosts, setFeedPosts] = useState<PostData[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<'post' | 'story'>('post');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [stories, setStories] = useState<StoryItem[]>([]);
  const [storiesLoaded, setStoriesLoaded] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [seenIds, setSeenIds] = useState<Set<number>>(loadSeenStories);

  const [suggestions, setSuggestions] = useState<FollowUser[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<number>>(new Set());
  const [followPendingIds, setFollowPendingIds] = useState<Set<number>>(new Set());

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState('');
  const [joinedProjectIds, setJoinedProjectIds] = useState<Set<number>>(() =>
    loadNumberSet('th_joined_projects')
  );
  const [stats, setStats] = useState({ followers: 0, following: 0 });

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [highlightedPostId, setHighlightedPostId] = useState<number | null>(null);
  const loadNotifications = useCallback(async () => {
    if (!token) return;
    const res = await fetchNotifications(token);
    setNotifications(res.notifications);
    setUnreadCount(res.unread_count);
  }, [token]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!token || !user?.id) return;
    const cleanupWs = createNotificationWebSocket(
      token,
      user.id,
      (newNotif) => {
        setNotifications((prev) => {
          const filtered = prev.filter((n) => n.id !== newNotif.id);
          return [newNotif, ...filtered];
        });
        setUnreadCount((c) => c + 1);
      }
    );
    const pollInterval = setInterval(() => {
      void loadNotifications();
    }, 15000);

    return () => {
      cleanupWs();
      clearInterval(pollInterval);
    };
  }, [token, user?.id, loadNotifications]);

  useEffect(() => {
    localStorage.setItem('th_user_posts', JSON.stringify(userPosts));
  }, [userPosts]);

  useEffect(() => {
    localStorage.setItem('th_joined_projects', JSON.stringify([...joinedProjectIds]));
  }, [joinedProjectIds]);

  const refreshFeed = useCallback(async (authToken: string) => {
    try {
      const apiPosts = await fetchPosts(authToken);
      setFeedPosts(apiPosts.map(mapApiPost));
    } catch {
      // keep existing feed
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetchCurrentUser(token)
      .then((freshUser) => {
        setUser(freshUser);
        localStorage.setItem('user', JSON.stringify(freshUser));
        if (!freshUser.country) setNeedsOnboarding(true);
      })
      .catch((err) => {
        if (err?.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
        }
      });
  }, [token]);

  useEffect(() => {
    if (!token || !user?.id) return;
    fetchUserStats(token, user.id)
      .then((data) => setStats({ followers: data.followers_count, following: data.following_count }))
      .catch(() => undefined);
  }, [token, user?.id]);

  useEffect(() => {
    if (!token) return;
    void refreshFeed(token);

    fetchStories(token)
      .then((data) => {
        setStories(data);
        setStoriesLoaded(true);
      })
      .catch(() => setStoriesLoaded(true));

    fetchSuggestions(token)
      .then((data) => {
        setSuggestions(data);
        setFollowingIds(new Set(data.filter((u) => u.is_following).map((u) => u.id)));
      })
      .catch(() => undefined);
  }, [token, refreshFeed]);

  const loadProjects = useCallback(async () => {
    if (!token) return;
    setProjectsLoading(true);
    setProjectsError('');
    try {
      setProjects(await fetchProjects(token));
    } catch {
      setProjectsError(translateStatic('projectsLoadFailed'));
    } finally {
      setProjectsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) void loadProjects();
  }, [token, loadProjects]);

  useEffect(() => {
    sessionStorage.setItem('th_active_tab', activeTab);
    window.history.replaceState(null, '', `#${activeTab}`);
    if (profileViewUserId) sessionStorage.setItem('th_profile_user_id', String(profileViewUserId));
    else sessionStorage.removeItem('th_profile_user_id');
  }, [activeTab, profileViewUserId]);

  if (!token) {
    return (
      <AuthView
        onLoginSuccess={(tok, u, isNewUser) => {
          setToken(tok);
          setUser(u);
          setNeedsOnboarding(Boolean(isNewUser) || !u?.country);
          setActiveTab('home');
        }}
      />
    );
  }

  if (needsOnboarding) {
    return (
      <CountrySelection
        onContinue={(updatedUser) => {
          setUser(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
          setNeedsOnboarding(false);
          setActiveTab('home');
        }}
      />
    );
  }

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('th_user_posts');
    localStorage.removeItem('th_joined_projects');
    setToken(null);
    setUser(null);
    setUserPosts([]);
    setFeedPosts([]);
    setJoinedProjectIds(new Set());
    setStats({ followers: 0, following: 0 });
    setNeedsOnboarding(false);
    setActiveTab('home');
    setProfileViewUserId(null);
    setMobileMenuOpen(false);
  };

  const handleTabChange = (tab: string) => {
    if (tab === 'profile') {
      setProfileViewUserId(null);
    }
    setActiveTab(tab);
    sessionStorage.setItem('th_active_tab', tab);
    window.history.replaceState(null, '', `#${tab}`);
    setMobileMenuOpen(false);
  };

  const openCreate = (mode: 'post' | 'story') => {
    setCreateMode(mode);
    setShowCreate(true);
    setMobileMenuOpen(false);
  };

  const handlePublish = async (body: string, media?: any) => {
    if (createMode === 'story') {
      const story = await publishStory(
        token,
        body,
        user?.country,
        media?.image_url || media?.file_url || null
      );
      setStories((prev) => [story, ...prev]);
      setShowCreate(false);
      return;
    }

    const res = await fetch(`${API_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        body,
        image_url: media?.image_url || undefined,
        file_url: media?.file_url || undefined,
        file_name: media?.file_name || undefined,
      }),
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new Error(detail?.detail || translateStatic('postCreateFailed'));
    }

    const created: ApiPost = await res.json();
    const mapped = mapApiPost(created);
    setUserPosts((prev) => [mapped, ...prev.filter((p) => p.id !== mapped.id)]);
    setFeedPosts((prev) => [mapped, ...prev.filter((p) => p.id !== mapped.id)]);
    setShowCreate(false);
    setActiveTab('home');
  };

  const selectStory = (story: StoryItem) => {
    const idx = stories.findIndex((s) => s.id === story.id);
    if (idx === -1) return;
    const seen = new Set(seenIds);
    seen.add(story.id);
    setSeenIds(seen);
    localStorage.setItem('th_seen_stories', JSON.stringify([...seen]));
    setViewerIndex(idx);
  };

  const navStory = (index: number) => {
    const story = stories[index];
    if (story) {
      const seen = new Set(seenIds);
      seen.add(story.id);
      setSeenIds(seen);
      localStorage.setItem('th_seen_stories', JSON.stringify([...seen]));
    }
    setViewerIndex(index);
  };

  const toggleFollow = async (id: number) => {
    if (!token || followPendingIds.has(id)) return;
    setFollowPendingIds((prev) => new Set(prev).add(id));
    const wasFollowing = followingIds.has(id);
    try {
      if (wasFollowing) {
        await unfollowUser(token, id);
        setFollowingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        await followUser(token, id);
        setFollowingIds((prev) => new Set(prev).add(id));
      }
      setStats((prev) => ({ ...prev, following: Math.max(0, prev.following + (wasFollowing ? -1 : 1)) }));
    } catch {
      // leave followingIds / stats unchanged on failure
    } finally {
      setFollowPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const toggleProjectJoin = async (id: number) => {
    setJoinedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (token) {
      try {
        await joinProject(token, id);
      } catch (err) {
        console.warn('Could not join project on backend', err);
      }
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      void markNotificationAsRead(token, notif.id);
    }

    if (notif.type === 'like' || notif.type === 'comment') {
      setActiveTab('home');
      if (notif.post_id || notif.entity_id) {
        const postId = Number(notif.post_id || notif.entity_id);
        setHighlightedPostId(postId);
        window.setTimeout(() => document.getElementById(`post-${postId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        window.setTimeout(() => setHighlightedPostId(null), 3000);
      }
    } else if (notif.type === 'follow') {
      if (notif.actor_id) {
        setProfileViewUserId(notif.actor_id);
      }
      setActiveTab('profile');
    } else if (notif.type === 'project_join' || notif.type === 'project_accept') {
      setActiveTab('projects');
    } else if (notif.type === 'message') {
      if (notif.actor_id) {
        setMessagesTarget({
          id: notif.actor_id,
          full_name: notif.actor?.full_name || translateStatic('userGeneric'),
        });
      }
      setActiveTab('messages');
    } else {
      setActiveTab('home');
    }
  };

  const handleMarkAllNotificationsAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    await markAllNotificationsAsRead(token);
  };

  const handleCreateProject = async (draft: ProjectDraft) => {
    const project = await createProject(token, draft);
    setProjects((prev) => [project, ...prev.filter((p) => p.id !== project.id)]);
    setProjectsError('');
  };

  const serverIds = new Set(feedPosts.map((p) => p.id));
  const localOnly = userPosts.filter((p) => !serverIds.has(p.id));
  const displayFeed = [...localOnly, ...feedPosts, ...INITIAL_POSTS];
  const ownPosts = [
    ...userPosts,
    ...feedPosts.filter((p) => p.authorId === user?.id && !userPosts.some((u) => u.id === p.id)),
  ];
  const handleSavedChange = (postId: string | number, isSaved: boolean) => {
    const update = (post: PostData) => (String(post.id) === String(postId) ? { ...post, is_saved: isSaved } : post);
    setFeedPosts((prev) => prev.map(update));
    setUserPosts((prev) => prev.map(update));
  };

  return (
    <div className="min-h-screen bg-black text-slate-100">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        user={user}
        onCreatePost={() => openCreate('post')}
        onLogout={handleLogout}
        token={token}
        unreadCount={unreadCount}
        onViewProfile={(id) => {
          setProfileViewUserId(id);
          setActiveTab('profile');
        }}
      />

      <TopHeader
        user={user}
        setActiveTab={handleTabChange}
        onCreatePost={() => openCreate('post')}
        onOpenMenu={() => setMobileMenuOpen(true)}
        unreadCount={unreadCount}
        notifications={notifications}
        onNotificationClick={handleNotificationClick}
        onMarkAllAsRead={handleMarkAllNotificationsAsRead}
      />

      <MobileMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        user={user}
        onCreatePost={() => openCreate('post')}
        onLogout={handleLogout}
        unreadCount={unreadCount}
      />

      <div className="md:pl-60 lg:pr-80">
        <main className="mx-auto w-full max-w-[620px] px-3 md:px-4 pt-4 pb-28 md:py-6">
          {activeTab === 'home' && (
            <>
              <StoriesBar
                stories={stories}
                ownFlag={flagOf(user?.country)}
                ownInitial={user?.full_name ? user.full_name[0] : 'U'}
                seenIds={seenIds}
                onSelectStory={selectStory}
                onAddStory={() => openCreate('story')}
              />
              {!storiesLoaded && (
                <div className="mb-4 text-[11px] text-neutral-500 animate-pulse">{t('loading')}</div>
              )}
              {displayFeed.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onJoin={() => setActiveTab('projects')}
                  token={token}
                  postId={post.id}
                  highlighted={highlightedPostId === Number(post.id)}
                  onSavedChange={handleSavedChange}
                />
              ))}
            </>
          )}

          {activeTab === 'explore' && (
            <ErrorBoundary title={t('sectionLoadError').replace('{section}', t('navExplore'))}>
              <ExploreView
                token={token}
                onNavigate={(tab, payload) => {
                  if (tab === 'profile' && payload?.viewUserId) {
                    setProfileViewUserId(payload.viewUserId);
                  }
                  if (tab === 'messages' && payload?.messageUser) {
                    setMessagesTarget(payload.messageUser);
                  }
                  setActiveTab(tab);
                }}
                onViewProfile={(id) => {
                  setProfileViewUserId(id);
                  setActiveTab('profile');
                }}
                onOpenMessages={(target) => {
                  setMessagesTarget(target);
                  setActiveTab('messages');
                }}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'rooms' && (
            <ErrorBoundary title={t('sectionLoadError').replace('{section}', t('navRooms'))}>
              <RoomsView />
            </ErrorBoundary>
          )}

          {activeTab === 'messages' && (
            <ErrorBoundary title={t('sectionLoadError').replace('{section}', t('navMessages'))}>
              <MessagesView
                token={token}
                currentUser={user}
                initialTarget={messagesTarget}
                onClose={() => setMessagesTarget(null)}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'dictionary' && (
            <ErrorBoundary title={t('sectionLoadError').replace('{section}', t('navDictionary'))}>
              <Dictionary />
            </ErrorBoundary>
          )}

          {activeTab === 'projects' && (
            <ErrorBoundary title={t('sectionLoadError').replace('{section}', t('navProjects'))}>
              <ProjectHub
                projects={projects}
                joinedIds={joinedProjectIds}
                loading={projectsLoading}
                error={projectsError}
                onRetry={() => void loadProjects()}
                onJoin={toggleProjectJoin}
                onCreate={handleCreateProject}
                user={user}
                onContactFounder={(ownerId) => {
                  setMessagesTarget({ id: ownerId });
                  setActiveTab('messages');
                }}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'notifications' && (
            <ErrorBoundary title={t('sectionLoadError').replace('{section}', t('navNotifications'))}>
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Bell className="w-5 h-5 text-skyBlue" />
                  <h2 className="text-base font-bold text-slate-100">{t('navNotifications')}</h2>
                </div>
                <ul className="space-y-2">
                  {notifications.map((n) => {
                    const Icon = n.type === 'follow' ? UserPlus : n.type === 'message' ? MessageCircle : Bell;
                    return (
                      <li
                        key={n.id}
                        onClick={() => void handleNotificationClick(n)}
                        className={`flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-3 hover:border-neutral-700 transition-colors cursor-pointer ${!n.is_read ? 'border-skyBlue/40 bg-skyBlue/5' : ''}`}
                      >
                        <span className="w-9 h-9 rounded-full bg-neutral-900 flex items-center justify-center text-skyBlue">
                          <Icon className="w-4 h-4" />
                        </span>
                        <UserAvatar name={n.actor_name} avatarUrl={n.actor_avatar} className="w-8 h-8" />
                        <span className="min-w-0 flex-1 text-xs text-slate-300">{formatNotificationText(n, lang, t)}</span>
                        <span className="text-[10px] text-slate-600 shrink-0">{timeAgo(n.created_at)}</span>
                      </li>
                    );
                  })}
                  {!notifications.length && <li className="text-xs text-slate-500">{t('noNotifications')}</li>}
                </ul>
              </section>
            </ErrorBoundary>
          )}

          {activeTab === 'profile' && (
            <ErrorBoundary title={t('sectionLoadError').replace('{section}', t('navProfile'))}>
              <ProfileView
                user={user}
                posts={ownPosts}
                projects={projects}
                stats={stats}
                onLogout={handleLogout}
                onNavigate={(tab, payload) => {
                  if (payload?.viewUserId || payload?.id) {
                    setProfileViewUserId(payload.viewUserId || payload.id);
                  }
                  if (payload?.messageUser) {
                    setMessagesTarget(payload.messageUser);
                    setActiveTab('messages');
                    return;
                  }
                  setActiveTab(tab);
                }}
                viewUserId={profileViewUserId}
                onClearView={() => setProfileViewUserId(null)}
                onOpenMessages={(target) => {
                  setMessagesTarget(target);
                  setActiveTab('messages');
                }}
                onUserUpdated={(updatedUser) => {
                  setUser(updatedUser);
                  localStorage.setItem('user', JSON.stringify(updatedUser));
                }}
                token={token}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'home' && (
            <div className="flex items-center justify-center gap-2 py-6 text-[11px] text-neutral-600">
              <Sparkles className="w-3.5 h-3.5 text-skyBlue/60" />
              {t('feedFooter')}
            </div>
          )}
        </main>
      </div>

      <RightPanel
        user={user}
        suggestions={suggestions}
        followingIds={followingIds}
        followPendingIds={followPendingIds}
        onToggleFollow={toggleFollow}
        projects={projects}
        joinedProjectIds={joinedProjectIds}
        onJoinProject={toggleProjectJoin}
        setActiveTab={handleTabChange}
      />

      <BottomNav activeTab={activeTab} setActiveTab={handleTabChange} />

      <CreatePostModal
        open={showCreate}
        mode={createMode}
        onClose={() => setShowCreate(false)}
        onPublish={handlePublish}
      />

      {viewerIndex !== null && stories.length > 0 && (
        <StoryViewer
          stories={stories}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNav={navStory}
        />
      )}
    </div>
  );
}
