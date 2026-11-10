import React, { useState } from 'react';
import { Bell, BookOpen, Compass, Home, LogOut, Mail, MessageCircle, Plus, Rocket, Search, User } from 'lucide-react';
import { fetchSuggestions } from '../../api';
import { flagOf, useI18n } from '../../i18n';
import { ThemeToggle } from '../ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user?: any;
  onCreatePost: () => void;
  onLogout: () => void;
  token?: string | null;
  onViewProfile?: (id: number) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, user, onCreatePost, onLogout, token = null, onViewProfile }) => {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [show, setShow] = useState(false);

  const navItems = [
    { id: 'home', label: t('navHome'), icon: Home },
    { id: 'explore', label: t('navExplore'), icon: Compass },
    { id: 'rooms', label: t('navRooms'), icon: MessageCircle },
    { id: 'messages', label: t('navMessages'), icon: Mail },
    { id: 'projects', label: t('navProjects'), icon: Rocket },
    { id: 'dictionary', label: t('navDictionary'), icon: BookOpen },
    { id: 'notifications', label: t('navNotifications'), icon: Bell, badge: 3 },
    { id: 'profile', label: t('navProfile'), icon: User },
  ];

  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-neutral-900 bg-black px-3 py-5">
      <button onClick={() => setActiveTab('home')} className="flex items-center gap-2.5 px-3 mb-7 text-left">
        <img src="/logo.jpg" alt={t('brandLogoAlt')} className="w-9 h-9 rounded-full object-cover" />
        <span className="text-base font-black tracking-widest bg-gradient-to-r from-skyBlue to-cyan-300 bg-clip-text text-transparent">
          TURK HUB
        </span>
      </button>

      <div className="mx-1 mb-2 relative">
        <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 px-2 py-1.5">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShow(true);
              if (e.target.value.trim()) {
                fetchSuggestions(token, e.target.value.trim()).then(setResults).catch(() => setResults([]));
              } else {
                setResults([]);
              }
            }}
            onBlur={() => setTimeout(() => setShow(false), 200)}
            placeholder={t('searchUsers')}
            className="flex-1 bg-transparent text-xs text-slate-100 placeholder-neutral-600 focus:outline-none"
          />
        </div>
        {show && q.trim() && results.length > 0 && (
          <div className="absolute top-9 left-0 right-0 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-xl z-50">
            {results.slice(0,6).map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  if (onViewProfile) onViewProfile(u.id);
                  setShow(false); setQ('');
                }}
                className="w-full flex items-center gap-2 px-2 py-2 hover:bg-neutral-800 text-left"
              >
                <span className="text-sm">{flagOf(u.country)}</span>
                <div className="min-w-0">
                  <p className="text-xs text-slate-100 truncate">{u.full_name}</p>
                  <p className="text-[10px] text-slate-500 truncate">@{u.username || u.id}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-neutral-900 text-skyBlue font-semibold border border-neutral-800'
                  : 'text-slate-300 hover:bg-neutral-900/70 hover:text-slate-100 border border-transparent'
              }`}
            >
              <span className="relative">
                <Icon className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
                {item.badge && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-skyBlue text-black text-[10px] font-bold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <button
        onClick={onCreatePost}
        className="mt-5 flex items-center justify-center gap-2 py-3 rounded-xl bg-skyBlue hover:bg-skyBlue-hover text-black text-sm font-bold transition-all duration-200 shadow-lg shadow-skyBlue/25 active:scale-[0.98]"
      >
        <Plus className="w-5 h-5" />
        {t('newPost')}
      </button>

      <div className="mt-auto pt-4 space-y-2 border-t border-neutral-900">
        <LanguageSwitcher placement="up" />
        <ThemeToggle />
        <div
          className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-neutral-900/70 transition-colors cursor-pointer"
          onClick={() => setActiveTab('profile')}
        >
          <span className="relative w-9 h-9 rounded-full bg-black border border-skyBlue/40 text-lg flex items-center justify-center overflow-hidden">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
            ) : (
              flagOf(user?.country)
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-slate-100 truncate">{user?.full_name || t('userGeneric')}</span>
            <span className="block text-[10px] text-slate-500 truncate">@{user?.username || user?.id || 'turkhub'}</span>
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLogout();
            }}
            title={t('logout')}
            className="text-slate-500 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};