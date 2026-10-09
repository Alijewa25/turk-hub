import React, { useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { AuthView } from './components/AuthView';
import { Heart, MessageCircle, Share2, Sparkles } from 'lucide-react';

export function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('user') || 'null'));
  const [activeTab, setActiveTab] = useState('home');

  if (!token) {
    return <AuthView onLoginSuccess={(t, u) => { setToken(t); setUser(u); }} />;
  }

  const countries = [
    { flag: '🇦🇿', name: 'Azərbaycan' },
    { flag: '🇹🇷', name: 'Türkiye' },
    { flag: '🇰🇿', name: 'Qazaxıstan' },
    { flag: '🇺🇿', name: 'Özbəkistan' },
    { flag: '🇰🇬', name: 'Qırğızıstan' },
    { flag: '🇹🇲', name: 'Türkmənistan' },
  ];

  return (
    <div className="min-h-screen bg-darkBg text-slate-100 pb-20">
      <header className="sticky top-0 z-40 bg-cardBg/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-black bg-gradient-to-r from-skyBlue to-cyan-300 bg-clip-text text-transparent">
          TURK HUB
        </h1>
        <div className="flex items-center space-x-3 text-slate-300">
          <Heart className="w-6 h-6 cursor-pointer hover:text-skyBlue transition-colors" />
          <MessageCircle className="w-6 h-6 cursor-pointer hover:text-skyBlue transition-colors" />
        </div>
      </header>

      <main className="max-w-md mx-auto pt-2 px-2">
        {activeTab === 'home' && (
          <div>
            <div className="flex space-x-4 overflow-x-auto py-3 px-2 no-scrollbar border-b border-slate-800/60 mb-4">
              {countries.map((c, i) => (
                <div key={i} className="flex flex-col items-center space-y-1 min-w-[64px] cursor-pointer">
                  <div className="p-[2px] rounded-full bg-gradient-to-tr from-skyBlue to-cyan-400">
                    <div className="w-14 h-14 bg-slate-900 rounded-full flex items-center justify-center text-2xl border-2 border-darkBg">
                      {c.flag}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 truncate w-14 text-center">{c.name}</span>
                </div>
              ))}
            </div>

            <div className="bg-cardBg border border-slate-800 rounded-2xl mb-4 overflow-hidden shadow-lg">
              <div className="p-3 flex items-center space-x-3">
                <div className="w-9 h-9 rounded-full bg-skyBlue/20 text-skyBlue font-bold flex items-center justify-center border border-skyBlue/40">
                  {user?.full_name ? user.full_name[0] : 'T'}
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white">{user?.full_name || 'Tahmina Aliyeva'}</h3>
                  <p className="text-[10px] text-slate-400">{user?.country || 'Azerbaijan'} • BEU Innovator</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-skyBlue/10 p-6 flex flex-col justify-center items-center text-center border-y border-slate-800">
                <Sparkles className="w-10 h-10 text-skyBlue mb-2 animate-pulse" />
                <h4 className="text-base font-bold text-white">AI-Powered Pan-Turkic Translator</h4>
                <p className="text-xs text-slate-300 mt-1 max-w-xs">
                  Türk dilləri arasında etimoloji və süni intellekt əsaslı anında tərcümə modulu.
                </p>
                <span className="mt-3 text-[10px] bg-skyBlue/10 text-skyBlue border border-skyBlue/30 px-3 py-1 rounded-full">
                  Min. 3 Ölkə Komandası Tələb Olunur
                </span>
              </div>

              <div className="p-3 flex justify-between items-center text-slate-400">
                <div className="flex space-x-4">
                  <Heart className="w-5 h-5 hover:text-red-500 cursor-pointer transition-colors" />
                  <MessageCircle className="w-5 h-5 hover:text-skyBlue cursor-pointer transition-colors" />
                  <Share2 className="w-5 h-5 hover:text-skyBlue cursor-pointer transition-colors" />
                </div>
                <button
                  onClick={() => setActiveTab('projects')}
                  className="px-3 py-1 bg-skyBlue text-darkBg font-bold text-xs rounded-lg hover:bg-skyBlue-hover transition-colors"
                >
                  Komandaya Qoşul
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dictionary' && (
          <div className="p-4 text-center">
            <h2 className="text-lg font-bold text-skyBlue">Pan-Türk Etimoloji Sözlük</h2>
            <p className="text-xs text-slate-400 mt-1">Axtarış modulu hazırlanır...</p>
          </div>
        )}

        {activeTab === 'projects' && (
          <div className="p-4 text-center">
            <h2 className="text-lg font-bold text-skyBlue">Layihələr Mərkəzi (Project Hub)</h2>
            <p className="text-xs text-slate-400 mt-1">Siyahı hazırlanır...</p>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="bg-cardBg border border-slate-800 rounded-2xl p-6 text-center shadow-lg">
            <div className="w-20 h-20 bg-skyBlue/20 border-2 border-skyBlue rounded-full mx-auto flex items-center justify-center text-2xl font-black text-skyBlue mb-3">
              {user?.full_name ? user.full_name[0] : 'U'}
            </div>
            <h2 className="text-base font-bold text-white">{user?.full_name}</h2>
            <p className="text-xs text-slate-400">{user?.email}</p>
            <p className="text-xs text-skyBlue mt-1 font-medium">{user?.country} • {user?.university || 'Tələbə'}</p>
            <p className="text-xs text-slate-300 mt-3 italic">{user?.bio || 'Türk Youth Hub İnnovatoru'}</p>

            <button
              onClick={() => {
                localStorage.clear();
                setToken(null);
                setUser(null);
              }}
              className="mt-6 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs font-semibold hover:bg-red-500/20 transition-colors"
            >
              Çıxış Et
            </button>
          </div>
        )}
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}