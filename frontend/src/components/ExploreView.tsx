import React, { useEffect, useState } from 'react';
import { MessageCircle, Search, UserCheck, UserPlus } from 'lucide-react';
import { fetchSuggestions, followUser, mediaUrl, unfollowUser } from '../api';
import { flagOf, useI18n } from '../i18n';

interface ExploreViewProps {
  token?: string | null;
  onNavigate?: (tab: string, payload?: any) => void;
  onViewProfile?: (userId: number) => void;
  onOpenMessages?: (user: any) => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({
  token = null,
  onNavigate,
  onViewProfile,
  onOpenMessages,
}) => {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchSuggestions(token, query)
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [query, token]);

  const handleFollowToggle = async (user: any) => {
    try {
      if (user.is_following) {
        await unfollowUser(token, user.id);
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, is_following: false, followers_count: Math.max(0, u.followers_count - 1) } : u))
        );
      } else {
        await followUser(token, user.id);
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, is_following: true, followers_count: u.followers_count + 1 } : u))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleProfileClick = (userId: number) => {
    if (onViewProfile) {
      onViewProfile(userId);
    } else if (onNavigate) {
      onNavigate('profile', { viewUserId: userId });
    }
  };

  const handleMessageClick = (user: any) => {
    if (onOpenMessages) {
      onOpenMessages(user);
    } else if (onNavigate) {
      onNavigate('messages', { messageUser: user });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div className="relative">
        <div className="flex items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/80 px-4 py-3 shadow-lg">
          <Search className="w-5 h-5 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Kəşf et: İstifadəçi adı, ad soyad..."
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-neutral-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Tövsiyə Edilən Şəxslər</h2>
        {loading ? (
          <div className="text-center py-8 text-xs text-slate-500">{t('loading') || 'Axtarılır...'}</div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">İstifadəçi tapılmadı.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 p-3 rounded-2xl bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 transition-all"
              >
                <div
                  onClick={() => handleProfileClick(u.id)}
                  className="relative w-12 h-12 rounded-full bg-neutral-800 border border-skyBlue/40 overflow-hidden flex items-center justify-center text-lg cursor-pointer"
                >
                  {u.avatar_url || u.profile_picture ? (
                    <img src={mediaUrl(u.avatar_url || u.profile_picture)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    flagOf(u.country)
                  )}
                </div>

                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleProfileClick(u.id)}>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-slate-100 truncate hover:text-skyBlue">{u.full_name}</h3>
                    <span className="text-xs">{flagOf(u.country)}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">@{u.username || u.id}</p>
                  {u.university && <p className="text-[10px] text-slate-400 truncate mt-0.5">{u.university}</p>}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleMessageClick(u)}
                    className="p-2 rounded-xl border border-neutral-800 bg-black/60 text-slate-400 hover:text-skyBlue hover:border-skyBlue/40 transition-colors"
                    title={t('sendMessage') || 'Mesaj Göndər'}
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleFollowToggle(u)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      u.is_following
                        ? 'bg-neutral-800 text-slate-300 border border-neutral-700'
                        : 'bg-skyBlue hover:bg-skyBlue-hover text-black'
                    }`}
                  >
                    {u.is_following ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" /> {t('following') || 'İzlənilir'}
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" /> {t('follow') || 'İzlə'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};