import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  MessageCircle,
  Music,
  Pause,
  Play,
  Radio,
  Rocket,
  ScanLine,
  Search,
  Send,
  Trophy,
  User,
  Users,
  X,
} from 'lucide-react';
import { API_URL } from '../api';
import { useI18n } from '../i18n';

type ExploreId = 'dictionary' | 'ethno-music' | 'hackathon' | 'ar' | 'live' | 'projects';

interface ExploreTile {
  id: ExploreId;
  title: string;
  tag: string;
  gradient: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TILES: ExploreTile[] = [
  { id: 'dictionary', title: 'Etimoloji Lüğət', tag: 'Dil', gradient: 'from-skyBlue/40 to-black', icon: BookOpen },
  { id: 'ethno-music', title: 'Ethno-Music', tag: 'Mədəniyyət', gradient: 'from-violet-500/40 to-black', icon: Music },
  { id: 'hackathon', title: 'Hackathon 2026', tag: 'Event', gradient: 'from-cyan-500/40 to-black', icon: Trophy },
  { id: 'ar', title: 'AR Runestones', tag: 'Mədəniyyət', gradient: 'from-emerald-500/40 to-black', icon: ScanLine },
  { id: 'live', title: 'Live Rooms', tag: 'Real-Time', gradient: 'from-rose-500/40 to-black', icon: Radio },
  { id: 'projects', title: 'Project Hub', tag: 'Startap', gradient: 'from-amber-500/40 to-black', icon: Rocket },
];

const INSTRUMENTS = [
  { name: 'Kopuz', emoji: '🎼', desc: 'Qədim türk simli aləti — dastan musiqisinin kökü.' },
  { name: 'Dombra', emoji: '🎸', desc: 'Qazax və qırğız mədəniyyətinin iki simli simvolu.' },
  { name: 'Tar', emoji: '🪕', desc: 'Azərbaycan muğam ənənəsinin aparıcı aləti.' },
  { name: 'Kaval', emoji: '🎶', desc: 'Türkiyə və Türkmənistanın nəfəsli melodiyaları.' },
];

const RUNES = [
  { rune: '𐰆', name: 'Ok', meaning: 'Ox — istiqamət və hərəkət' },
  { rune: '𐰴', name: 'Kök', meaning: 'Kök — səma və mənşə' },
  { rune: '𐰋', name: 'Beg', meaning: 'Bəy — liderlik və idarəetmə' },
  { rune: '𐰑', name: 'At', meaning: 'At — sürət və azadlıq' },
];

const ROOMS = [
  { id: 'az-tr', name: 'AZ ↔ TR Dil Otağı', flags: '🇦🇿 🇹🇷', topic: 'Etimologiya və gündəlik dil' },
  { id: 'kaz-uzb', name: 'KZ ↔ UZ Tələbə Söhbəti', flags: '🇰🇿 🇺🇿', topic: 'Təhsil və mobillik' },
  { id: 'kg-tm', name: 'KG ↔ TM Mədəniyyət', flags: '🇰🇬 🇹🇲', topic: 'Musiqi və ənənələr' },
];

const ModalShell: React.FC<{
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, icon: Icon, onClose, children }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
    <div
      className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-3 mb-4">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-skyBlue/10 border border-skyBlue/30 flex items-center justify-center text-skyBlue">
          <Icon className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-100">{title}</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors" aria-label="Bağla">
          <X className="w-5 h-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const EthnoMusicContent: React.FC = () => {
  const [playing, setPlaying] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {INSTRUMENTS.map((instrument) => {
        const isPlaying = playing === instrument.name;
        return (
          <button
            key={instrument.name}
            onClick={() => setPlaying(isPlaying ? null : instrument.name)}
            className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
              isPlaying
                ? 'border-skyBlue/50 bg-skyBlue/10'
                : 'border-neutral-800 bg-black/50 hover:border-skyBlue/30'
            }`}
          >
            <span className="w-10 h-10 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-lg">
              {instrument.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-slate-100">{instrument.name}</span>
              <span className="block text-[11px] text-slate-500 leading-relaxed">{instrument.desc}</span>
            </span>
            <span className="w-8 h-8 rounded-full bg-skyBlue/15 text-skyBlue flex items-center justify-center">
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </span>
          </button>
        );
      })}
      <p className="pt-1 text-[10px] text-slate-600">
        Demo rejimi: audio axını tezliklə ortaq etno-musiqi kitabxanasına qoşulacaq.
      </p>
    </div>
  );
};

const HackathonContent: React.FC<{ onNavigate: (tab: string) => void; onClose: () => void }> = ({
  onNavigate,
  onClose,
}) => (
  <div className="space-y-4">
    <div className="grid grid-cols-3 gap-2 text-center">
      {[
        { label: 'Tarix', value: '12–14 İyun' },
        { label: 'Format', value: '48 saat' },
        { label: 'Mükafat', value: '$10K' },
      ].map((item) => (
        <div key={item.label} className="rounded-xl border border-neutral-800 bg-black/60 py-2.5">
          <p className="text-xs font-bold text-slate-100">{item.value}</p>
          <p className="text-[10px] text-slate-500">{item.label}</p>
        </div>
      ))}
    </div>
    <p className="text-xs text-slate-400 leading-relaxed">
      Altı türk dövlətindən tələbələr etimologiya, real-time tərcümə və mədəni irs texnologiyaları
      üzrə komandalar yaradır. Komanda tapmaq üçün Project Hub-a keç.
    </p>
    <button
      onClick={() => {
        onClose();
        onNavigate('projects');
      }}
      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-skyBlue hover:bg-skyBlue-hover text-black text-xs font-bold py-2.5 transition-colors active:scale-[0.98]"
    >
      Layihələrə bax
      <ArrowRight className="w-4 h-4" />
    </button>
  </div>
);

const ArContent: React.FC = () => {
  const [scanned, setScanned] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-emerald-500/10 p-4 text-center">
        <ScanLine className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
        <p className="text-xs text-slate-300">
          Telefon kamerasını Göktürk daşına tut — rune canlı olaraq oxunacaq.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {RUNES.map((rune) => (
          <button
            key={rune.name}
            onClick={() => setScanned(rune.name)}
            className={`rounded-xl border p-3 text-left transition-colors ${
              scanned === rune.name
                ? 'border-emerald-500/50 bg-emerald-500/10'
                : 'border-neutral-800 bg-black/50 hover:border-emerald-500/30'
            }`}
          >
            <span className="text-2xl text-emerald-300">{rune.rune}</span>
            <span className="block text-xs font-semibold text-slate-100 mt-1">{rune.name}</span>
            <span className="block text-[10px] text-slate-500">{rune.meaning}</span>
          </button>
        ))}
      </div>
      {scanned && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">
          Skan tamamlandı: {scanned} runesi tanındı.
        </p>
      )}
    </div>
  );
};

const LiveRoomsContent: React.FC = () => {
  const [room, setRoom] = useState<(typeof ROOMS)[number] | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!room) return;
    setMessages([`${room.name} otağına qoşuldun. Söhbətə başla!`]);
    const wsBase = API_URL.replace(/\/$/, '').replace(/^http/, 'ws');
    const clientId = `web-${Math.random().toString(36).slice(2, 8)}`;
    const socket = new WebSocket(`${wsBase}/ws/chat/${clientId}`);
    socketRef.current = socket;
    socket.onmessage = (event) => setMessages((prev) => [...prev, event.data]);
    socket.onerror = () => setMessages((prev) => [...prev, 'Bağlantı xətası: live server əlçatan deyil.']);
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [room]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(text);
    setInput('');
  };

  if (!room) {
    return (
      <div className="space-y-2">
        {ROOMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setRoom(item)}
            className="w-full flex items-center gap-3 rounded-xl border border-neutral-800 bg-black/50 px-3 py-3 text-left hover:border-rose-500/40 transition-colors"
          >
            <span className="w-10 h-10 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-lg">
              {item.flags}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-slate-100">{item.name}</span>
              <span className="block text-[10px] text-slate-500">{item.topic}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-300">
              <Users className="w-3 h-3" />
              Live
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-100 truncate">{room.name}</p>
          <p className="text-[10px] text-slate-500">{room.topic}</p>
        </div>
        <button
          onClick={() => setRoom(null)}
          className="text-[11px] font-semibold text-slate-400 hover:text-skyBlue transition-colors"
        >
          Otaqlar
        </button>
      </div>

      <div className="h-56 overflow-y-auto rounded-xl border border-neutral-800 bg-black/60 p-3 space-y-2 no-scrollbar">
        {messages.map((message, index) => (
          <div
            key={`${index}-${message}`}
            className="rounded-lg bg-neutral-900/80 border border-neutral-800 px-2.5 py-1.5 text-[11px] text-slate-300"
          >
            {message}
          </div>
        ))}
      </div>

      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Mesaj yaz..."
          className="flex-1 px-3 py-2 bg-black border border-neutral-800 rounded-lg text-xs text-slate-100 placeholder-neutral-600 focus:outline-none focus:border-skyBlue transition-colors"
        />
        <button
          type="submit"
          className="px-3 py-2 rounded-lg bg-skyBlue hover:bg-skyBlue-hover text-black transition-colors"
          aria-label="Göndər"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

interface ExploreViewProps {
  onNavigate: (tab: string, payload?: any) => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({ onNavigate }) => {
  const { t } = useI18n();
  const [active, setActive] = useState<ExploreId | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const token = localStorage.getItem('token');

  useEffect(() => {
    const q = query.trim();
    if (!q || !token) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/users?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, token]);

  const openTile = (id: ExploreId) => {
    if (id === 'dictionary' || id === 'projects') {
      onNavigate(id);
      return;
    }
    setActive(id);
  };

  const openProfile = (user: any) => {
    onNavigate('profile', { viewUserId: user.id });
    setQuery('');
    setResults([]);
  };

  const activeTile = TILES.find((tile) => tile.id === active);

  return (
    <section>
      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="İstifadəçi adı, ad və ya @username ilə axtar..."
          className="w-full pl-9 pr-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-sm text-slate-100 placeholder-neutral-600 focus:outline-none focus:border-skyBlue focus:ring-2 focus:ring-skyBlue/20 transition-all"
        />
        {results.length > 0 && (
          <div className="absolute z-50 mt-2 w-full rounded-xl border border-neutral-800 bg-black/95 backdrop-blur-md shadow-2xl overflow-hidden">
            {results.map((u) => (
              <button
                key={u.id}
                onClick={() => openProfile(u)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-900 text-left"
              >
                <span className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center overflow-hidden">
                  {u.profile_picture ? (
                    <img src={u.profile_picture.startsWith('http') ? u.profile_picture : `${API_URL}${u.profile_picture}`} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-4 h-4 text-slate-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-100 truncate">{u.full_name}</span>
                  <span className="block text-[10px] text-slate-500 truncate">@{u.username || u.id}</span>
                </span>
                <MessageCircle className="w-4 h-4 text-slate-600" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {TILES.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => openTile(item.id)}
              className={`group relative aspect-square rounded-xl bg-gradient-to-br ${item.gradient} border border-neutral-800 p-3 flex flex-col justify-end overflow-hidden text-left hover:border-skyBlue/50 transition-all duration-200`}
            >
              <span className="absolute top-3 right-3 text-skyBlue/70 group-hover:text-skyBlue transition-colors">
                <Icon className="w-5 h-5" />
              </span>
              <span className="text-[10px] uppercase tracking-wider text-skyBlue font-bold">{item.tag}</span>
              <span className="text-xs font-semibold text-slate-100 mt-0.5">{item.title}</span>
              <span className="absolute inset-0 bg-skyBlue/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-center text-[10px] text-neutral-600">
        Kartlara toxun — {t('navExplore')} modulları canlı backend ilə sinxron işləyir.
      </p>

      {active && activeTile && (
        <ModalShell
          title={activeTile.title}
          subtitle={activeTile.tag}
          icon={activeTile.icon}
          onClose={() => setActive(null)}
        >
          {active === 'ethno-music' && <EthnoMusicContent />}
          {active === 'hackathon' && <HackathonContent onNavigate={onNavigate} onClose={() => setActive(null)} />}
          {active === 'ar' && <ArContent />}
          {active === 'live' && <LiveRoomsContent />}
        </ModalShell>
      )}
    </section>
  );
};
