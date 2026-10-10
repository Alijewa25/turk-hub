import React from 'react';
import { Bell, Compass, Plus } from 'lucide-react';
import { flagOf } from '../../i18n';

interface TopHeaderProps {
  user?: any;
  setActiveTab: (tab: string) => void;
  onCreatePost: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ user, setActiveTab, onCreatePost }) => {
  return (
    <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b border-neutral-900 bg-black/90 backdrop-blur-md">
      <button onClick={() => setActiveTab('home')} className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-skyBlue to-cyan-400 flex items-center justify-center font-black text-black text-sm shadow-lg shadow-skyBlue/20 ring-1 ring-skyBlue/40">
          T
        </span>
        <span className="text-sm font-black tracking-widest bg-gradient-to-r from-skyBlue to-cyan-300 bg-clip-text text-transparent">
          TURK HUB
        </span>
        <span className="flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-sm" title={user?.country}>
          {flagOf(user?.country)}
        </span>
      </button>

      <div className="flex items-center gap-4 text-slate-300">
        <button onClick={() => setActiveTab('explore')} className="hover:text-skyBlue transition-colors" aria-label="Kəşf Et">
          <Compass className="w-6 h-6" />
        </button>
        <button onClick={onCreatePost} className="hover:text-skyBlue transition-colors" aria-label="Yeni Paylaşım">
          <Plus className="w-6 h-6" />
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className="relative hover:text-skyBlue transition-colors"
          aria-label="Bildirişlər"
        >
          <Bell className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-skyBlue text-black text-[10px] font-bold flex items-center justify-center">
            3
          </span>
        </button>
      </div>
    </header>
  );
};