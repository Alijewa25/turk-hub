import { useCallback, useEffect, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { AuthView } from './components/AuthView';
import { CountrySelection } from './components/CountrySelection';
import { Sidebar } from './components/layout/Sidebar';
import { RightPanel } from './components/layout/RightPanel';
import { TopHeader } from './components/layout/TopHeader';
import { StoriesBar } from './components/StoriesBar';
import { StoryViewer } from './components/StoryViewer';
import { PostCard, PostData } from './components/PostCard';
import { CreatePostModal } from './components/CreatePostModal';
import { Dictionary } from './components/Dictionary';
import { ExploreView } from './components/ExploreView';
import { ProfileView } from './components/ProfileView';
import { ProjectHub } from './components/ProjectHub';
import { RoomsView } from './components/RoomsView';
import { MessagesView } from './components/MessagesView';
import {
  ApiPost,
  API_URL,
  createProject,
  fetchCurrentUser,
  fetchPosts,
  fetchProjects,
  fetchStories,
  fetchSuggestions,
  fetchUserStats,
  followUser,
  FollowUser,
  ProjectDraft,
  ProjectItem,
  publishStory,
  StoryItem,
  timeAgo,
  unfollowUser,
} from './api';
import { flagOf, useI18n } from './i18n';
import { Bell, BookOpen, Heart, MessageCircle, Sparkles, Users } from 'lucide-react';

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

const NOTIFICATIONS = [
  { icon: Heart, text: 'Emre Yıldız paylaşmağını bəyəndi', time: '12 dəq', color: 'text-red-500' },
  { icon: MessageCircle, text: 'Aigerim Nurlan şərh yazdı: "Əla layihədir!"', time: '1 səat', color: 'text-skyBlue' },
  { icon: Users, text: 'Layihənə 3 yeni üzv qoşuldu', time: '3 səat', color: 'text-emerald-400' },
  { icon: Bell, text: 'Hackathon 2026 üçün qeydiyyat açıldı', time: 'dünən', color: 'text-amber-400' },
  { icon: BookOpen, text: 'Lüğətə 42 yeni söz əlavə olundu', time: '2 gün', color: 'text-violet-400' },
];

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
    author: p.author?.full_name || 'İstifadəçi',
    country: p.author?.country || '',
    role: p.author?.university || 'Tələbə',
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
  };
}

export function App() {
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any>(() => loadStored<any>('user', null));
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [profileViewUserId, setProfileViewUserId] = useState<number | null>(null);
  const [messagesTarget, setMessagesTarget] = useState<any>(null);
  const [userPosts, setUserPosts] = useState<PostData[]>(() => loadStored<PostData[]>('th_user_posts', []));
  const [feedPosts, setFeedPosts] = useState<PostData[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<'post' | 'story'>('post');

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
      setProjectsError('Layihələr yüklənə bilmədi. Backend bağlantısını yoxla.');
    } finally {
      setProjectsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) void loadProjects();
  }, [token, loadProjects]);

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
  };

  const openCreate = (mode: 'post' | 'story') => {
    setCreateMode(mode);
    setShowCreate(true);
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
      throw new Error(detail?.detail || 'Post yaradıla bilmədi.');
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

  const toggleProjectJoin = (id: number) => {
    setJoinedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateProject = async (draft: ProjectDraft) => {
    const project = await createProject(token, draft);
    setProjects((prev) => [project, ...prev.filter((p) => p.id !== project.id)]);
    setProjectsError('');
  };

  const serverIds = new Set(feedPosts.map((p) => p.id));
  const localOnly = userPosts.filter((p) => !serverIds.has(p.id));
  const displayFeed = [...localOnly, ...feedPosts, ...INITIAL_POSTS];
  const joinedProjects = projects.filter((project) => joinedProjectIds.has(project.id));
  const ownPosts = [
    ...userPosts,
    ...feedPosts.filter((p) => p.authorId === user?.id && !userPosts.some((u) => u.id === p.id)),
  ];

  return (
    <div className="min-h-screen bg-black text-slate-100">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onCreatePost={() => openCreate('post')}
        onLogout={handleLogout}
      />

      <TopHeader user={user} setActiveTab={setActiveTab} onCreatePost={() => openCreate('post')} />

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
                <div className="mb-4 text-[11px] text-neutral-500 animate-pulse">Hekayələr yüklənir...</div>
              )}
              {displayFeed.map((post) => (
                <PostCard key={post.id} post={post} onJoin={() => setActiveTab('projects')} token={token} postId={post.id} />
              ))}
            </>
          )}

          {activeTab === 'explore' && (
            <ExploreView
              onNavigate={(tab, payload) => {
                if (tab === 'profile' && payload?.viewUserId) {
                  setProfileViewUserId(payload.viewUserId);
                }
                setActiveTab(tab);
              }}
            />
          )}

          {activeTab === 'rooms' && <RoomsView />}

          {activeTab === 'messages' && (
            <MessagesView
              token={token}
              currentUser={user}
              initialTarget={messagesTarget}
              onClose={() => setMessagesTarget(null)}
            />
          )}

          {activeTab === 'dictionary' && <Dictionary />}

          {activeTab === 'projects' && (
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
          )}

          {activeTab === 'notifications' && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-skyBlue" />
                <h2 className="text-base font-bold text-slate-100">{t('navNotifications')}</h2>
              </div>
              <ul className="space-y-2">
                {NOTIFICATIONS.map((n, i) => {
                  const Icon = n.icon;
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-3 hover:border-neutral-700 transition-colors cursor-pointer"
                    >
                      <span className={`w-9 h-9 rounded-full bg-neutral-900 flex items-center justify-center ${n.color}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1 text-xs text-slate-300">{n.text}</span>
                      <span className="text-[10px] text-slate-600 shrink-0">{n.time}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {activeTab === 'profile' && (
            <ProfileView
              user={user}
              posts={ownPosts}
              projects={joinedProjects}
              stats={stats}
              onLogout={handleLogout}
              onNavigate={(tab, payload) => {
                if (payload?.viewUserId) {
                  setProfileViewUserId(payload.viewUserId);
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
              token={token}
            />
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
        setActiveTab={setActiveTab}
      />

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

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
