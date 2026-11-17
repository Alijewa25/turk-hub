import React, { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Compass, Heart, Mail, Menu, MessageCircle, Plus, Rocket, Sparkles, UserPlus } from 'lucide-react';
import { NotificationItem, timeAgo } from '../../api';
import { flagOf, formatNotificationText, useI18n } from '../../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

interface TopHeaderProps {
  user?: any;
  setActiveTab: (tab: string) => void;
  onCreatePost: () => void;
  onOpenMenu: () => void;
  unreadCount?: number;
  notifications?: NotificationItem[];
  onNotificationClick?: (notif: NotificationItem) => void;
  onMarkAllAsRead?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  user,
  setActiveTab,
  onCreatePost,
  onOpenMenu,
  unreadCount = 0,
  notifications = [],
  onNotificationClick,
  onMarkAllAsRead,
}) => {
  const { lang, t } = useI18n();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const renderIcon = (type: string) => {
    switch (type) {
      case 'like':
        return <Heart className="h-3.5 w-3.5 text-red-500 fill-current" />;
      case 'comment':
        return <MessageCircle className="h-3.5 w-3.5 text-skyBlue fill-current" />;
      case 'follow':
        return <UserPlus className="h-3.5 w-3.5 text-emerald-400" />;
      case 'project_join':
      case 'project_accept':
        return <Rocket className="h-3.5 w-3.5 text-amber-400" />;
      case 'message':
        return <Mail className="h-3.5 w-3.5 text-violet-400" />;
      default:
        return <Sparkles className="h-3.5 w-3.5 text-skyBlue" />;
    }
  };

  const previewNotifications = notifications.slice(0, 6);

  return (
    <header className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-neutral-900 bg-black/90 px-3 py-3 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onOpenMenu}
          aria-label={t('openMenu')}
          className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-neutral-900 hover:text-skyBlue"
        >
          <Menu className="h-6 w-6" />
        </button>
        <button onClick={() => setActiveTab('home')} className="flex min-w-0 items-center gap-2">
          <img src="/logo.jpg" alt={t('brandLogoAlt')} className="h-8 w-8 shrink-0 rounded-full object-cover" />
          <span className="hidden bg-gradient-to-r from-skyBlue to-cyan-300 bg-clip-text text-sm font-black tracking-widest text-transparent sm:inline">
            TURK HUB
          </span>
          <span className="flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-sm" title={user?.country}>
            {flagOf(user?.country)}
          </span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-3 text-slate-300">
        <LanguageSwitcher compact />
        <button onClick={() => setActiveTab('explore')} className="transition-colors hover:text-skyBlue" aria-label={t('navExplore')}>
          <Compass className="h-5 w-5" />
        </button>
        <button onClick={onCreatePost} className="transition-colors hover:text-skyBlue" aria-label={t('newPost')}>
          <Plus className="h-5 w-5" />
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="relative p-1 transition-colors hover:text-skyBlue"
            aria-label={t('navNotifications')}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-skyBlue px-1 text-[10px] font-bold text-black animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 max-w-[92vw] overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/95 shadow-2xl backdrop-blur-xl z-50">
              <div className="flex items-center justify-between border-b border-neutral-800/80 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-skyBlue" />
                  <span className="text-xs font-bold text-slate-100">{t('navNotifications')}</span>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-skyBlue/15 px-2 py-0.5 text-[10px] font-semibold text-skyBlue">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && onMarkAllAsRead && (
                  <button
                    onClick={() => {
                      onMarkAllAsRead();
                    }}
                    className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-skyBlue transition-colors"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span>{t('markAllAsRead')}</span>
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-neutral-900">
                {previewNotifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    <p>{t('noNotifications')}</p>
                  </div>
                ) : (
                  previewNotifications.map((n) => {
                    const isUnread = !n.is_read;
                    const textContent = formatNotificationText(n, lang, t);
                    return (
                      <button
                        key={n.id}
                        onClick={() => {
                          onNotificationClick?.(n);
                          setDropdownOpen(false);
                        }}
                        className={`w-full flex items-start gap-3 p-3 text-left transition-colors hover:bg-neutral-900/60 ${
                          isUnread ? 'bg-skyBlue/5' : ''
                        }`}
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 border border-neutral-800">
                          {renderIcon(n.type)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs leading-snug ${isUnread ? 'font-semibold text-slate-100' : 'text-slate-300'}`}>
                            {textContent}
                          </p>
                          <span className="mt-1 block text-[10px] text-slate-500">
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                        {isUnread && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-skyBlue ring-2 ring-skyBlue/20" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="border-t border-neutral-800/80 bg-neutral-900/40 p-2">
                <button
                  onClick={() => {
                    setActiveTab('notifications');
                    setDropdownOpen(false);
                  }}
                  className="w-full rounded-xl py-2 text-center text-xs font-semibold text-skyBlue hover:bg-skyBlue/10 transition-colors"
                >
                  {t('viewAllNotifications')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
