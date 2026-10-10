import { useEffect, useState } from 'react';
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
import {
  fetchStories,
  fetchSuggestions,
  followUser,
  FollowUser,
  publishStory,
  StoryItem,
  unfollowUser,
} from './api';
import { flagOf, useI18n } from './i18n';
import {
  Bell,
  BookOpen,
  Heart,
  MessageCircle,
  Rocket,
  Search,
  Sparkles,
  User,
  Users,
} from 'lucide-react';

const INITIAL_POSTS: PostData[] = [
  {
    id: 'p1',
    author: 'Tahmina Aliyeva',
    country: 'Azerbaijan',
    role: 'BEU Innovator',
    time: '2 səat əvvəl',
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
    time: '5 səat əvvəl',
    body: 'Göktürk runelərini AR tətbiqində göstərmək üçün ilk prototip hazırdır. Qazaxıstan və Qırğızıstan tələbələri ilə sınaqdan keçiririk.',
    likes: 96,
    comments: 17,
  },
];

const EXPLORE_TILES = [
  { title: 'Etimoloji Lüğət', tag: 'Dil', gradient: 'from-skyBlue/40 to-black' },
  { title: 'Hackathon 2026', tag: 'Event', gradient: 'from-cyan-500/40 to-black' },
  { title: 'EcoMarket', tag: 'Startap', gradient: 'from-emerald-500/40 to-black' },
  { title: 'AR Runestones', tag: 'Mədəniyyət', gradient: 'from-violet-500/40 to-black' },
  { title: 'Tələbə Mobiliyi', tag: 'Təhsil', gradient: 'from-amber-500/40 to-black' },
  { title: 'Göktürk Keyboard', tag: 'Alət', gradient: 'from-rose-500/40 to-black' },
];

const PROJECTS = [
  { name: 'Türk Dili AI Tərcümə', flag: '🇹🇷', members: 12, desc: 'Etimoloji əsaslı real-time tərcümə mühərriki.' },
  { name: 'Ortaq Bazar (EcoMarket)', flag: '🇦🇿', members: 8, desc: 'Altı ölkənin kiçik biznesləri üçün vahid platforma.' },
  { name: 'Göktürk Runestones AR', flag: '🇰🇿', members: 5, desc: 'Runeləri artırılmış reallıqla oxumaq tətbiqi.' },
  { name: 'Pan-Türk Tələbə Mobiliyi', flag: '🇺🇿', members: 9, desc: 'Universitetlərarası mübadilə və qrant kataloqu.' },
];

const NOTIFICATIONS = [
  { icon: Heart, text: 'Emre Yıldız paylaşmağını bəyəndi', time: '12 dəq', color: 'text-red-500' },
  { icon: MessageCircle, text: 'Aigerim Nurlan şərh yazdı: "Əla layihədir!"', time: '1 səat', color: 'text-skyBlue' },
  { icon: Users, text: 'Layihənə 3 yeni üzv qoşuldu', time: '3 səat', color: 'text-emerald-400' },
  { icon: Bell, text: 'Hackathon 2026 üçün qeydiyyat açıldı', time: 'dünən', color: 'text-amber-400' },
  { icon: BookOpen, text: 'Lüğətə 42 yeni söz əlavə olundu', time: '2 gün', color: 'text-violet-400' },
];

function loadSeenStories(): Set<number> {
  try {
    const raw = localStorage.getItem('th_seen_stories');
    return new Set<number>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function App() {
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('user') || 'null'));
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [posts, setPosts] = useState<PostData[]>(INITIAL_POSTS);
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<'post' | 'story'>('post');

  const [stories, setStories] = useState<StoryItem[]>([]);
  const [storiesLoaded, setStoriesLoaded] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [seenIds, setSeenIds] = useState<Set<number>>(loadSeenStories);

  const [suggestions, setSuggestions] = useState<FollowUser[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<number>>(new Set());
  const [followPendingIds, setFollowPendingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!token) return;
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
  }, [token]);

  if (!token) {
    return (
      <AuthView
        onLoginSuccess={(tok, u, isNewUser) => {
          setToken(tok);
          setUser(u);
          setNeedsOnboarding(Boolean(isNewUser));
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
    localStorage.clear();
    setToken(null);
    setUser(null);
    setNeedsOnboarding(false);
  };

  const openCreate = (mode: 'post' | 'story') => {
    setCreateMode(mode);
    setShowCreate(true);
  };

  const handlePublish = (body: string) => {
    if (createMode === 'story') {
      publishStory(token, body, user?.country)
        .then((story) => setStories((prev) => [story, ...prev]))
        .catch(() => undefined);
      setShowCreate(false);
    } else {
      setPosts((prev) => [
        {
          id: `p${Date.now()}`,
          author: user?.full_name || 'İstifadəçi',
          country: user?.country || 'Azerbaijan',
          role: user?.university || 'Tələbə',
          time: 'indi',
          body,
          likes: 0,
          comments: 0,
        },
        ...prev,
      ]);
      setShowCreate(false);
      setActiveTab('home');
    }
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
    if (followPendingIds.has(id)) return;
    setFollowPendingIds((prev) => new Set(prev).add(id));
    try {
      if (followingIds.has(id)) {
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
    } catch {
      // backend offline — local UI toggles anyway for demo
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } finally {
      setFollowPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

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
              {posts.map((p) => (
                <PostCard key={p.id} post={p} onJoin={() => setActiveTab('projects')} />
              ))}
            </>
          )}

          {activeTab === 'explore' && (
            <section>
              <div className="relative mb-4">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  placeholder="Layihə, istifadəçi və ya açar söz axtar..."
                  className="w-full pl-9 pr-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-sm text-slate-100 placeholder-neutral-600 focus:outline-none focus:border-skyBlue focus:ring-2 focus:ring-skyBlue/20 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {EXPLORE_TILES.map((item, i) => (
                  <div
                    key={i}
                    className={`group relative aspect-square rounded-xl bg-gradient-to-br ${item.gradient} border border-neutral-800 p-3 flex flex-col justify-end overflow-hidden cursor-pointer hover:border-skyBlue/50 transition-all duration-200`}
                  >
                    <span className="text-[10px] uppercase tracking-wider text-skyBlue font-bold">{item.tag}</span>
                    <span className="text-xs font-semibold text-slate-100 mt-0.5">{item.title}</span>
                    <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'dictionary' && (
            <section className="text-center py-6">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-skyBlue/10 border border-skyBlue/30 flex items-center justify-center mb-3">
                <BookOpen className="w-7 h-7 text-skyBlue" />
              </div>
              <h2 className="text-lg font-bold text-slate-100">{t('navDictionary')}</h2>
              <p className="text-xs text-slate-400 mt-1">Axtarış modulu hazırlanır...</p>
              <div className="mt-4 max-w-sm mx-auto relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  placeholder="Söz axtar (məs. 'su', 'ak')"
                  className="w-full pl-9 pr-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-sm text-slate-100 placeholder-neutral-600 focus:outline-none focus:border-skyBlue focus:ring-2 focus:ring-skyBlue/20 transition-all"
                />
              </div>
            </section>
          )}

          {activeTab === 'projects' && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Rocket className="w-5 h-5 text-skyBlue" />
                <h2 className="text-base font-bold text-slate-100">{t('navProjects')} (Project Hub)</h2>
              </div>
              <div className="space-y-3">
                {PROJECTS.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 hover:border-skyBlue/40 transition-colors duration-200"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-lg">
                        {p.flag}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-slate-100 truncate">{p.name}</h3>
                        <p className="text-[11px] text-slate-500">{p.members} komanda üzvü</p>
                      </div>
                      <button className="px-3 py-1.5 rounded-lg bg-skyBlue hover:bg-skyBlue-hover text-black text-xs font-bold transition-colors active:scale-95">
                        Qoşul
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-400 leading-relaxed">{p.desc}</p>
                  </div>
                ))}
              </div>
            </section>
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
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 text-center shadow-lg shadow-black/40">
              <div className="w-20 h-20 bg-black border-2 border-skyBlue rounded-full mx-auto flex items-center justify-center text-4xl mb-3">
                {flagOf(user?.country)}
              </div>
              <h2 className="text-base font-bold text-slate-100">
                {user?.full_name} <span className="text-base align-middle">{flagOf(user?.country)}</span>
              </h2>
              <p className="text-xs text-slate-500">{user?.email}</p>
              <p className="text-xs text-skyBlue mt-1 font-medium">
                {user?.country} • {user?.university || t('memberRole')}
              </p>
              <p className="text-xs text-slate-400 mt-3 italic">{user?.bio || 'Türk Youth Hub Innovatoru'}</p>

              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'Paylaşım', value: posts.length },
                  { label: 'Layihə', value: 4 },
                  { label: 'Bağlantı', value: 128 },
                ].map((s, i) => (
                  <div key={i} className="rounded-xl border border-neutral-800 bg-black/60 py-2.5">
                    <p className="text-sm font-bold text-slate-100">{s.value}</p>
                    <p className="text-[10px] text-slate-500">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-neutral-800 bg-black/60 py-3 px-4 flex items-center justify-center gap-2">
                <User className="w-4 h-4 text-skyBlue" />
                <span className="text-[11px] text-slate-400">
                  {user?.country || 'Azərbaycan'} • {flagOf(user?.country)} • {t('navProfile').toUpperCase()}
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="mt-6 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs font-semibold hover:bg-red-500/20 transition-colors"
              >
                {t('logout')}
              </button>
            </section>
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