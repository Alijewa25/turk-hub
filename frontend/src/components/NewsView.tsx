import React, { useEffect, useState } from 'react';
import { Megaphone, Pin, Plus, X } from 'lucide-react';
import { fetchMyNews, fetchNews, NewsItem, submitNews } from '../api';
import { exactDateTime, hybridTimestamp } from '../dateTime';
import { AccountBadge } from './AccountBadge';
import { UserAvatar } from './UserAvatar';

interface NewsViewProps {
  token: string | null;
  user: any;
}

const CATEGORIES = ['All', 'Forum', 'Scholarship', 'Hackathon', 'Internship', 'Cultural', 'Platform Update'];

export const NewsView: React.FC<NewsViewProps> = ({ token }) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [submissions, setSubmissions] = useState<NewsItem[]>([]);
  const [category, setCategory] = useState('All');
  const [view, setView] = useState<'approved' | 'mine'>('approved');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Forum');
  const [coverUrl, setCoverUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchNews(token).then(setNews).catch(() => setNews([]));
  }, [token]);

  const openSubmissions = () => {
    setView('mine');
    fetchMyNews(token).then(setSubmissions).catch(() => setSubmissions([]));
  };

  const visible = (view === 'approved' ? news : submissions).filter(
    (item) => category === 'All' || item.category === category
  );

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-skyBlue" />
          <h2 className="text-base font-bold text-slate-100">News & Announcements</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-lg bg-skyBlue px-3 py-2 text-xs font-bold text-black"
        >
          <Plus className="h-4 w-4" /> Propose News
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setView('approved')} className={`rounded-lg px-3 py-2 text-xs ${view === 'approved' ? 'bg-skyBlue text-black' : 'border border-neutral-800 text-slate-400'}`}>Approved</button>
        <button type="button" onClick={openSubmissions} className={`rounded-lg px-3 py-2 text-xs ${view === 'mine' ? 'bg-skyBlue text-black' : 'border border-neutral-800 text-slate-400'}`}>My Submissions</button>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((item) => (
          <button key={item} type="button" onClick={() => setCategory(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] ${category === item ? 'border-skyBlue bg-skyBlue/10 text-skyBlue' : 'border-neutral-800 text-slate-400'}`}>
            {item}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.map((item) => (
          <article key={item.id} className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/60">
            {item.cover_image_url && <img src={item.cover_image_url} alt="" className="h-44 w-full object-cover" />}
            <div className="p-4">
              <div className="mb-2 flex items-center gap-2">
                {item.is_pinned && <span className="flex items-center gap-1 rounded-full bg-skyBlue/10 px-2 py-1 text-[10px] text-skyBlue"><Pin className="h-3 w-3" /> Pinned</span>}
                <span className="rounded-full border border-neutral-800 px-2 py-1 text-[10px] text-slate-400">{item.category}</span>
                {view === 'mine' && <span className={`ml-auto rounded-full px-2 py-1 text-[10px] ${item.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' : item.status === 'rejected' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>{item.status}</span>}
              </div>
              <h3 className="text-sm font-bold text-slate-100">{item.title}</h3>
              <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-300">{item.content}</p>
              <div className="mt-4 flex items-center gap-2" title={exactDateTime(item.created_at)}>
                <UserAvatar name={item.author?.full_name || 'Organization'} avatarUrl={item.author?.avatar_url ?? item.author?.profile_picture} className="h-8 w-8" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-xs font-semibold text-slate-200">{item.author?.org_name || item.author?.full_name || 'Organization'}</span>
                    <AccountBadge accountType={item.author?.account_type} isVerified={item.author?.is_verified} isAdmin={item.author?.is_admin} compact />
                  </div>
                  <span className="text-[10px] text-slate-500">{hybridTimestamp(item.created_at)}</span>
                </div>
              </div>
            </div>
          </article>
        ))}
        {!visible.length && <p className="py-10 text-center text-xs text-slate-500">No announcements available.</p>}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" onClick={() => setShowForm(false)}>
          <form onSubmit={async (event) => {
            event.preventDefault();
            setSubmitting(true);
            try {
              await submitNews(token, { title, content, category: selectedCategory, cover_image_url: coverUrl || null });
              setTitle(''); setContent(''); setCoverUrl(''); setShowForm(false);
              openSubmissions();
            } finally {
              setSubmitting(false);
            }
          }} onClick={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-bold">Propose News / Announcement</h3><button type="button" onClick={() => setShowForm(false)}><X className="h-4 w-4 text-slate-500" /></button></div>
            <div className="space-y-3">
              <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Title" className="w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 text-xs" />
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 text-xs">
                {CATEGORIES.filter((item) => item !== 'All').map((item) => <option key={item}>{item}</option>)}
              </select>
              <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="Optional cover image URL" className="w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 text-xs" />
              <textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={7} placeholder="Full announcement" className="w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 text-xs" />
              <button type="submit" disabled={submitting} className="w-full rounded-lg bg-skyBlue py-2.5 text-xs font-bold text-black disabled:opacity-60">{submitting ? 'Submitting...' : 'Submit for review'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
