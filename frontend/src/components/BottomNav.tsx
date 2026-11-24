import React from 'react';
import { BookOpen, Compass, Crown, Home, Mail, Megaphone, User } from 'lucide-react';
import { useI18n } from '../i18n';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user?: any;
  pendingNewsCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab, user, pendingNewsCount = 0 }) => {
  const { t } = useI18n();

  const navItems: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { id: 'home', label: t('navHome'), icon: Home },
    { id: 'explore', label: t('navExplore'), icon: Compass },
    { id: 'messages', label: 'DM', icon: Mail },
    { id: 'news', label: 'News', icon: Megaphone },
    { id: 'dictionary', label: t('navDictionary'), icon: BookOpen },
    { id: 'profile', label: t('navProfile'), icon: User },
  ];
  if (user?.is_admin) {
    navItems.push({ id: 'admin', label: 'Admin', icon: Crown, badge: pendingNewsCount > 0 ? pendingNewsCount : undefined });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-t border-neutral-900 px-2 py-2 flex justify-around items-center md:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center w-full py-1 rounded-lg transition-colors duration-200 ${
              isActive ? 'text-skyBlue font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="relative">
              <Icon className={`w-6 h-6 ${isActive ? 'scale-110' : ''} transition-transform duration-200`} />
              {item.badge && (
                <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-skyBlue px-1 text-[10px] font-bold text-black">
                  {item.badge}
                </span>
              )}
            </span>
            <span className="text-[10px] mt-1">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};