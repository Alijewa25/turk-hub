import React, { useState } from 'react';
import { LogOut, User, Rocket, PenSquare, X, Camera, Edit3 } from 'lucide-react';
import { useI18n } from '../i18n';
import { API_URL } from '../api';

interface ProfileViewProps {
  user: any;
  posts: any[];
  projects: any[];
  stats?: any;
  onLogout: () => void;
  onNavigate?: (tab: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ user, posts = [], projects = [], onLogout }) => {
  const { t } = useI18n();
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(user?.full_name || '');
  const [editUsername, setEditUsername] = useState(user?.username || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [uploading, setUploading] = useState(false);

  const saveProfile = async () => {
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: editName,
          username: editUsername,
          bio: editBio,
        }),
      });

      if (res.ok) {
        setShowEdit(false);
        window.location.reload();
      }
    } catch {
      // Error ignore
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="space-y-6 pb-20">
      <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 text-center relative">
        <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-tr from-skyBlue to-emerald-400 p-0.5 mb-3 relative">
          <div className="w-full h-full bg-black rounded-full flex items-center justify-center overflow-hidden">
            {user?.profile_picture || user?.avatar_url ? (
              <img src={user.profile_picture || user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-skyBlue" />
            )}
          </div>
        </div>

        <h2 className="text-lg font-bold text-slate-100">{user?.full_name || 'İstifadəçi'}</h2>
        <p className="text-xs text-skyBlue font-medium">@{user?.username || 'username'}</p>
        <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto">{user?.bio || 'Türk Youth Hub İnnovatoru'}</p>

        <div className="mt-5 flex justify-center gap-3">
          <button
            onClick={() => setShowEdit(true)}
            className="px-4 py-2 bg-neutral-800 text-xs font-semibold text-slate-200 rounded-xl hover:bg-neutral-700 flex items-center gap-1.5 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" /> Profili Redaktə Et
          </button>
          <button
            onClick={onLogout}
            className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs font-semibold hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" /> {t('logout')}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <PenSquare className="w-4 h-4 text-skyBlue" /> Paylaşımlar ({posts.length})
        </h3>
        {posts.length === 0 ? (
          <p className="text-xs text-slate-500 italic">Hələ heç bir paylaşım olunmayıb.</p>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-xl text-xs text-slate-200 space-y-2">
              <p>{post.content}</p>
              {post.media_url && (
                post.media_type === 'pdf' ? (
                  <a href={post.media_url} target="_blank" rel="noreferrer" className="block p-2 bg-black border border-neutral-800 rounded-lg text-emerald-400 underline">
                    📄 PDF Sənədinə Bax / Yüklə
                  </a>
                ) : (
                  <img src={post.media_url} alt="Media" className="max-h-60 rounded-lg object-cover" />
                )
              )}
            </div>
          ))
        )}
      </div>

      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
              <h3 className="text-sm font-bold text-slate-100">Profili Redaktə Et</h3>
              <button onClick={() => setShowEdit(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Ad Soyad" className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-lg text-xs text-slate-100 focus:outline-none" />
              <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} placeholder="@username" className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-lg text-xs text-slate-100 focus:outline-none" />
              <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={3} placeholder="Bio" className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-lg text-xs text-slate-100 resize-none focus:outline-none" />
            </div>
            <button onClick={saveProfile} disabled={uploading} className="w-full py-2 rounded-lg bg-skyBlue text-black text-xs font-bold hover:opacity-90">
              {uploading ? 'Yadda saxlanılır...' : 'Yadda saxla'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
