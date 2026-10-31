import React from 'react';
import { ArrowRight, Rocket, Sparkles, TrendingUp } from 'lucide-react';
import { FollowUser, ProjectItem } from '../../api';
import { flagOf, useI18n } from '../../i18n';

interface RightPanelProps {
  user?: any;
  suggestions: FollowUser[];
  followingIds: Set<number>;
  followPendingIds: Set<number>;
  onToggleFollow: (id: number) => void;
  projects?: ProjectItem[];
  joinedProjectIds?: Set<number>;
  onJoinProject?: (id: number) => void;
  setActiveTab: (tab: string) => void;
}

const FOOTER_LINKS = ['Haqqımızda', 'Yardım', 'Şərtlər', 'Məxfilik', 'Dil: AZ'];
const TRENDING = ['Etimoloji Lüğət v2', 'Hackathon 2026', 'Startap Akcelerator'];

export const RightPanel: React.FC<RightPanelProps> = ({
  user,
  suggestions,
  followingIds,
  followPendingIds,
  onToggleFollow,
  projects = [],
  joinedProjectIds = new Set<number>(),
  onJoinProject,
  setActiveTab,
}) => {
  const { t } = useI18n();

  return (
    <aside className="hidden lg:block fixed inset-y-0 right-0 z-30 w-80 border-l border-neutral-900 bg-black px-5 py-6 overflow-y-auto no-scrollbar">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-full bg-black border border-skyBlue/40 text-2xl flex items-center justify-center">
            {flagOf(user?.country)}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">{user?.full_name || 'İstifadəçi'}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email || 'turkhub.az'}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400 leading-relaxed">
          {user?.country || 'Azerbaijan'} • {user?.university || t('memberRole')} —{' '}
          <span className="text-skyBlue font-medium">{user?.bio || 'Türk Youth Hub Innovatoru'}</span>
        </p>
        <button
          onClick={() => setActiveTab('profile')}
          className="mt-4 w-full py-2 rounded-lg text-xs font-semibold text-skyBlue bg-skyBlue/10 border border-skyBlue/30 hover:bg-skyBlue/20 transition-colors duration-200"
        >
          {t('viewProfile')}
        </button>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('suggestionsForYou')}</h3>
          <TrendingUp className="w-4 h-4 text-skyBlue" />
        </div>
        <ul className="space-y-2">
          {suggestions.slice(0, 3).map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-2.5 hover:border-skyBlue/40 transition-colors duration-200"
            >
              <span className="w-8 h-8 rounded-full bg-black border border-neutral-800 flex items-center justify-center text-base">
                {flagOf(u.country)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-slate-100 truncate">{u.full_name}</span>
                <span className="block text-[10px] text-slate-500">
                  {u.country} • {u.followers_count} izləyici
                </span>
              </span>
              <button
                onClick={() => onToggleFollow(u.id)}
                disabled={followPendingIds.has(u.id)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                  followingIds.has(u.id)
                    ? 'text-slate-300 border border-neutral-800 hover:border-red-500/50 hover:text-red-400'
                    : 'text-black bg-skyBlue hover:bg-skyBlue-hover'
                }`}
              >
                {followingIds.has(u.id) ? t('following') : t('follow')}
              </button>
            </li>
          ))}
          {suggestions.length === 0 && (
            <li className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-3 text-[11px] text-slate-500">
              API-dan istifadəçilər yüklənir...
            </li>
          )}
        </ul>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('trendingProjects')}</h3>
          <TrendingUp className="w-4 h-4 text-skyBlue" />
        </div>
        <ul className="space-y-2">
          {projects.slice(0, 4).map((project) => {
            const joined = joinedProjectIds.has(project.id);
            return (
              <li
                key={project.id}
                className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-2.5 hover:border-skyBlue/40 transition-colors duration-200"
              >
                <span className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center">
                  <Rocket className="w-4 h-4 text-skyBlue" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-100 truncate">{project.title}</span>
                  <span className="block text-[10px] text-slate-500 truncate">
                    {project.required_skills || 'Açıq komanda'}
                  </span>
                </span>
                <button
                  onClick={() => onJoinProject?.(project.id)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                    joined
                      ? 'text-emerald-400 border border-emerald-500/30 bg-emerald-500/10'
                      : 'text-black bg-skyBlue hover:bg-skyBlue-hover'
                  }`}
                >
                  {joined ? 'Qoşulub' : 'Qoşul'}
                </button>
              </li>
            );
          })}
          {projects.length === 0 && (
            <li className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-3 text-[11px] text-slate-500">
              Layihələr yüklənir...
            </li>
          )}
        </ul>
      </div>

      <div className="mt-6 rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-skyBlue/10 p-4">
        <div className="flex items-center gap-2 text-skyBlue">
          <Sparkles className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">{t('trendingNow')}</span>
        </div>
        <ul className="mt-3 space-y-2">
          {TRENDING.map((item, i) => (
            <li key={i}>
              <button
                onClick={() => setActiveTab('explore')}
                className="group flex w-full items-center justify-between text-xs text-slate-300 hover:text-skyBlue transition-colors"
              >
                <span className="truncate">{item}</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <footer className="mt-8 text-[10px] leading-relaxed text-neutral-600">
        <p className="flex flex-wrap gap-x-2 gap-y-1">
          {FOOTER_LINKS.map((l, i) => (
            <span key={i} className="hover:text-slate-400 cursor-pointer transition-colors">
              {l}
            </span>
          ))}
        </p>
        <p className="mt-3">{t('feedFooter')}</p>
      </footer>
    </aside>
  );
};