import React, { useEffect, useState } from 'react';
import { Building2, Crown, FileText, Newspaper, Search, Users } from 'lucide-react';
import {
  AdminPost,
  AdminStats,
  AdminUser,
  deleteAdminPost,
  deleteAdminNews,
  fetchAdminNews,
  fetchAdminPosts,
  fetchAdminStats,
  fetchAdminUsers,
  NewsItem,
  toggleAdminUserVerification,
  updateAdminNews,
} from '../api';
import { exactDateTime, hybridTimestamp } from '../dateTime';
import { AccountBadge } from './AccountBadge';
import { UserAvatar } from './UserAvatar';

interface AdminDashboardViewProps {
  token: string | null;
  user: any;
  onPendingCountChange?: (count: number) => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({ token, user, onPendingCountChange }) => {
  const [tab, setTab] = useState<'news' | 'users' | 'posts'>('news');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [newsFilter, setNewsFilter] = useState<'pending' | 'all'>('pending');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [search, setSearch] = useState('');
  const [accountType, setAccountType] = useState('');

  const refreshStats = () => fetchAdminStats(token).then((value) => {
    setStats(value);
    onPendingCountChange?.(value.pending_news);
  }).catch(() => undefined);

  const refreshNews = (filter = newsFilter) => fetchAdminNews(token, filter).then(setNews).catch(() => setNews([]));

  useEffect(() => {
    if (!user?.is_admin) return;
    refreshStats();
    refreshNews('pending');
  }, [token, user?.is_admin]);

  useEffect(() => {
    if (tab === 'users') fetchAdminUsers(token, accountType, search).then(setUsers).catch(() => setUsers([]));
    if (tab === 'posts') fetchAdminPosts(token).then(setPosts).catch(() => setPosts([]));
  }, [tab, token, accountType, search]);

  if (!user?.is_admin) {
    return <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center text-sm text-red-400">403 Forbidden</div>;
  }

  const changeNews = async (item: NewsItem, payload: { status?: 'approved' | 'rejected'; is_pinned?: boolean }) => {
    await updateAdminNews(token, item.id, payload);
    await refreshNews();
    await refreshStats();
  };

  return (
    <section>
      <div className="mb-5 flex items-center gap-2">
        <Crown className="h-5 w-5 text-amber-400" />
        <h2 className="text-base font-bold text-slate-100">Admin Panel</h2>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total Users', value: stats?.total_users ?? 0, icon: Users },
          { label: 'Organizations', value: stats?.organization_users ?? 0, icon: Building2, detail: `${stats?.verified_organizations ?? 0} verified` },
          { label: 'Total Posts', value: stats?.total_posts ?? 0, icon: FileText },
          { label: 'Pending News', value: stats?.pending_news ?? 0, icon: Newspaper },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <card.icon className="mb-3 h-4 w-4 text-skyBlue" />
            <p className="text-xl font-bold text-slate-100">{card.value}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{card.label}</p>
            {card.detail && <p className="mt-1 text-[10px] text-emerald-400">{card.detail}</p>}
          </div>
        ))}
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {(['news', 'users', 'posts'] as const).map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 rounded-lg px-3 py-2 text-xs ${tab === item ? 'bg-skyBlue text-black' : 'border border-neutral-800 text-slate-400'}`}>
            {item === 'news' ? 'News Moderation' : item === 'users' ? 'Users & Organizations' : 'Content Moderation'}
          </button>
        ))}
      </div>

      {tab === 'news' && (
        <div>
          <div className="mb-3 flex gap-2">
            {(['pending', 'all'] as const).map((filter) => (
              <button key={filter} type="button" onClick={() => { setNewsFilter(filter); refreshNews(filter); }} className={`rounded-full border px-3 py-1.5 text-[11px] ${newsFilter === filter ? 'border-skyBlue text-skyBlue' : 'border-neutral-800 text-slate-400'}`}>
                {filter === 'pending' ? 'Pending' : 'All News'}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {news.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/60">
                {item.cover_image_url && <img src={item.cover_image_url} alt="" className="h-36 w-full object-cover" />}
                <div className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full border border-neutral-800 px-2 py-1 text-[10px] text-slate-400">{item.category}</span>
                    {item.is_pinned && <span className="rounded-full bg-skyBlue/10 px-2 py-1 text-[10px] text-skyBlue">Pinned</span>}
                    <span className={`ml-auto text-[10px] ${item.status === 'approved' ? 'text-emerald-400' : item.status === 'rejected' ? 'text-red-400' : 'text-amber-400'}`}>{item.status}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-100">{item.title}</h3>
                  <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-300">{item.content}</p>
                  <div className="mt-3 flex items-center gap-2" title={exactDateTime(item.created_at)}>
                    <UserAvatar name={item.author?.full_name} avatarUrl={item.author?.avatar_url ?? item.author?.profile_picture} className="h-8 w-8" />
                    <div>
                      <div className="flex items-center gap-1 text-xs font-semibold text-slate-200">{item.author?.org_name || item.author?.full_name}<AccountBadge accountType={item.author?.account_type} isVerified={item.author?.is_verified} isAdmin={item.author?.is_admin} compact /></div>
                      <p className="text-[10px] text-slate-500">{hybridTimestamp(item.created_at)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.status !== 'approved' && <button type="button" onClick={() => void changeNews(item, { status: 'approved' })} className="rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-400">Approve</button>}
                    {item.status !== 'rejected' && <button type="button" onClick={() => void changeNews(item, { status: 'rejected' })} className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">Reject</button>}
                    <button type="button" onClick={() => void changeNews(item, { is_pinned: !item.is_pinned })} className="rounded-lg border border-neutral-800 px-3 py-2 text-[11px] text-slate-300">{item.is_pinned ? 'Unpin' : 'Pin'}</button>
                    <button type="button" onClick={() => {
                      if (!window.confirm('Delete this news item?')) return;
                      deleteAdminNews(token, item.id).then(async () => {
                        await refreshNews();
                        await refreshStats();
                      }).catch(() => window.alert('Could not delete news.'));
                    }} className="rounded-lg border border-red-500/30 px-3 py-2 text-[11px] text-red-400">Delete</button>
                  </div>
                </div>
              </article>
            ))}
            {!news.length && <p className="py-10 text-center text-xs text-slate-500">No news items found.</p>}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div>
          <div className="mb-3 flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-3"><Search className="h-4 w-4 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users" className="w-full bg-transparent py-2 text-xs outline-none" /></div>
            <select value={accountType} onChange={(e) => setAccountType(e.target.value)} className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 text-xs"><option value="">All</option><option value="individual">Individuals</option><option value="organization">Organizations</option></select>
          </div>
          <div className="space-y-2">
            {users.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                <UserAvatar name={item.full_name} avatarUrl={item.avatar_url} className="h-9 w-9" />
                <div className="min-w-0 flex-1"><div className="flex items-center gap-1"><p className="truncate text-xs font-semibold text-slate-200">{item.account_type === 'organization' ? item.org_name || item.full_name : item.full_name}</p><AccountBadge accountType={item.account_type} isVerified={item.is_verified} isAdmin={item.is_admin} compact /></div><p className="truncate text-[10px] text-slate-500">@{item.username || item.id} • {item.email}</p></div>
                <button type="button" onClick={() => toggleAdminUserVerification(token, item.id, !item.is_verified).then((result) => setUsers((prev) => prev.map((u) => u.id === item.id ? { ...u, is_verified: Boolean(result.is_verified) } : u)))} className={`rounded-lg px-3 py-2 text-[11px] ${item.is_verified ? 'border border-neutral-800 text-slate-400' : 'bg-skyBlue text-black'}`}>{item.is_verified ? 'Unverify' : 'Verify'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'posts' && (
        <div className="space-y-3">
          {posts.map((post) => (
            <article key={post.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="flex items-center gap-2" title={exactDateTime(post.created_at)}><UserAvatar name={post.author?.full_name} avatarUrl={post.author?.avatar_url ?? post.author?.profile_picture} className="h-8 w-8" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-200">{post.author?.org_name || post.author?.full_name}</p><p className="text-[10px] text-slate-500">{hybridTimestamp(post.created_at)} • {post.likes_count} likes • {post.comments_count} comments</p></div></div>
              {post.body && <p className="mt-3 whitespace-pre-line text-xs text-slate-300">{post.body}</p>}
              {post.image_url && <img src={post.image_url} alt="" className="mt-3 max-h-72 w-full rounded-xl object-cover" />}
              <button type="button" onClick={() => { if (window.confirm('Delete this post?')) deleteAdminPost(token, post.id).then(() => setPosts((prev) => prev.filter((item) => item.id !== post.id))).catch(() => window.alert('Could not delete post.')); }} className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">Delete Post</button>
            </article>
          ))}
          {!posts.length && <p className="py-10 text-center text-xs text-slate-500">No posts found.</p>}
        </div>
      )}
    </section>
  );
};
