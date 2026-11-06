import React from 'react';
import { Bell, Compass, Menu, Plus } from 'lucide-react';
import { flagOf } from '../../i18n';

interface TopHeaderProps {
  user?: any;
  setActiveTab: (tab: string) => void;
  onCreatePost: () => void;
  onOpenMenu: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ user, setActiveTab, onCreatePost, onOpenMenu }) => {
  return (
    <header className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-neutral-900 bg-black/90 px-3 py-3 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onOpenMenu}
          aria-label="Menyunu aç"
          className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-neutral-900 hover:text-skyBlue"
        >
          <Menu className="h-6 w-6" />
        </button>
        <button onClick={() => setActiveTab('home')} className="flex min-w-0 items-center gap-2">
          <img src="/logo.jpg" alt="TURK HUB Logo" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          <span className="hidden bg-gradient-to-r from-skyBlue to-cyan-300 bg-clip-text text-sm font-black tracking-widest text-transparent sm:inline">
            TURK HUB
          </span>
          <span className="flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-sm" title={user?.country}>
            {flagOf(user?.country)}
          </span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-3 text-slate-300">
        <button onClick={() => setActiveTab('explore')} className="transition-colors hover:text-skyBlue" aria-label="Kəşf Et">
          <Compass className="h-5 w-5" />
        </button>
        <button onClick={onCreatePost} className="transition-colors hover:text-skyBlue" aria-label="Yeni Paylaşım">
          <Plus className="h-5 w-5" />
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className="relative transition-colors hover:text-skyBlue"
          aria-label="Bildirişlər"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-skyBlue px-1 text-[10px] font-bold text-black">
            3
          </span>
        </button>
      </div>
    </header>
  );
};