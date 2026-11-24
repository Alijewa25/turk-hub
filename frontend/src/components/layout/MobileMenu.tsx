import React, { useEffect } from 'react';
import {
  Bell,
  BookOpen,
  Compass,
  Crown,
  Home,
  LogOut,
  Mail,
  Megaphone,
  MessageCircle,
  Plus,
  Rocket,
  User,
  X,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import { ThemeToggle } from '../ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';
import { UserAvatar } from '../UserAvatar';

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user?: any;
  onCreatePost: () => void;
  onLogout: () => void;
  unreadCount?: number;
  pendingNewsCount?: number;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({
  open,
  onClose,
  activeTab,
  setActiveTab,
  user,
  onCreatePost,
  onLogout,
  unreadCount = 0,
  pendingNewsCount = 0,
}) => {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const navItems = [
    { id: 'home', label: t('navHome'), icon: Home },
    { id: 'explore', label: t('navExplore'), icon: Compass },
    { id: 'rooms', label: t('navRooms'), icon: MessageCircle },
    { id: 'messages', label: t('navMessages'), icon: Mail },
    { id: 'projects', label: t('navProjects'), icon: Rocket },
    { id: 'news', label: 'News', icon: Megaphone },
    { id: 'dictionary', label: t('navDictionary'), icon: BookOpen },
    { id: 'notifications', label: t('navNotifications'), icon: Bell, badge: unreadCount > 0 ? unreadCount : undefined },
    { id: 'profile', label: t('navProfile'), icon: User },
  ];
  if (user?.is_admin) {
    navItems.push({ id: 'admin', label: 'Admin Panel', icon: Crown, badge: pendingNewsCount > 0 ? pendingNewsCount : undefined });
  }

  const navigate = (tab: string) => {
    setActiveTab(tab);
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-[70] md:hidden ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('mobileNavigation')}
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-neutral-800 bg-black shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-4">
          <button onClick={() => navigate('home')} className="flex items-center gap-2.5 text-left">
            <img src="/logo.jpg" alt={t('brandLogoAlt')} className="h-9 w-9 rounded-full object-cover" />
            <span className="font-heading bg-gradient-to-r from-skyBlue to-cyan-300 bg-clip-text text-xl font-extrabold leading-none tracking-tight text-transparent">
              TURK HUB
            </span>
          </button>
          <button
            onClick={onClose}
            aria-label={t('closeMenu')}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-neutral-900 hover:text-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'border-skyBlue/30 bg-skyBlue/10 font-semibold text-skyBlue'
                    : 'border-transparent text-slate-300 hover:bg-neutral-900 hover:text-slate-100'
                }`}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {item.badge && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-skyBlue px-1 text-[10px] font-bold text-black">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-neutral-800 px-3 py-3">
          <button
            onClick={() => {
              onCreatePost();
              onClose();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-skyBlue py-3 text-sm font-bold text-black shadow-lg shadow-skyBlue/25 transition-all hover:bg-skyBlue-hover active:scale-[0.98]"
          >
            <Plus className="h-5 w-5" />
            {t('newPost')}
          </button>

          <LanguageSwitcher placement="up" />
          <ThemeToggle />

          <div
            className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-neutral-900"
            onClick={() => navigate('profile')}
          >
            <UserAvatar name={user?.full_name} avatarUrl={user?.avatar_url || user?.profile_picture} className="h-9 w-9" alt={user?.full_name || ''} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-slate-100">
                {user?.full_name || t('userGeneric')}
              </span>
              <span className="block truncate text-[10px] text-slate-500">
                @{user?.username || user?.id || 'turkhub'}
              </span>
            </span>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onLogout();
                onClose();
              }}
              title={t('logout')}
              aria-label={t('logout')}
              className="text-slate-500 transition-colors hover:text-red-400"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};
