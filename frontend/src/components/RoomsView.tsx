import React, { useEffect, useRef, useState } from 'react';
import { Globe, Send } from 'lucide-react';
import { API_URL } from '../api';

const ROOMS = [
  { id: 'az', name: '🇦🇿 Azərbaycan Türkcəsi', lang: 'Azerbaijan' },
  { id: 'tr', name: '🇹🇷 Türkiye Türkçesi', lang: 'Turkey' },
  { id: 'kk', name: '🇰🇿 Қазақ Tілі', lang: 'Kazakhstan' },
  { id: 'uz', name: '🇺🇿 O‘zbek Tili', lang: 'Uzbekistan' },
];

export const RoomsView: React.FC = () => {
  const [activeRoom, setActiveRoom] = useState(ROOMS[0]);
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'connecting' | 'open' | 'error'>('connecting');
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setMessages([`${activeRoom.name} otağına qoşuldun. Söhbətə başlaya bilərsiniz.`]);
    setStatus('connecting');

    const wsBase = API_URL.replace(/\/$/, '').replace(/^http/, 'ws');
    const clientId = `web-${Math.random().toString(36).slice(2, 8)}`;
    const token = localStorage.getItem('token');
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    const socket = new WebSocket(`${wsBase}/ws/chat/${activeRoom.id}/${clientId}${qs}`);
    socketRef.current = socket;

    socket.onopen = () => setStatus('open');
    socket.onmessage = (event) => setMessages((prev) => [...prev, String(event.data)]);
    socket.onerror = () => {
      setStatus('error');
      setMessages((prev) => [...prev, 'Bağlantı xətası: live server əlçatan deyil.']);
    };
    socket.onclose = () => {
      if (socketRef.current === socket) setStatus((s) => (s === 'error' ? s : 'error'));
    };

    return () => {
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [activeRoom.id, activeRoom.name]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setMessages((prev) => [...prev, 'Mesaj göndərilmədi: bağlantı yoxdur.']);
      return;
    }
    socketRef.current.send(text);
    setInput('');
  };

  return (
    <section className="space-y-4 pb-20">
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {ROOMS.map((room) => (
          <button
            key={room.id}
            onClick={() => setActiveRoom(room)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeRoom.id === room.id
                ? 'bg-skyBlue text-black font-bold'
                : 'bg-neutral-900 border border-neutral-800 text-slate-300 hover:bg-neutral-800'
            }`}
          >
            {room.name}
          </button>
        ))}
      </div>

      <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 h-96 flex flex-col justify-between">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3 mb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
            <Globe className="w-4 h-4 text-skyBlue" />
            {activeRoom.name}
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              status === 'open'
                ? 'text-emerald-400 bg-emerald-500/10'
                : status === 'connecting'
                ? 'text-amber-400 bg-amber-500/10'
                : 'text-red-400 bg-red-500/10'
            }`}
          >
            {status === 'open' ? 'Canlı' : status === 'connecting' ? 'Qoşulur...' : 'Offline'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {messages.map((msg, idx) => (
            <div key={`${idx}-${msg.slice(0, 12)}`} className="p-2.5 bg-black/60 border border-neutral-800/80 rounded-xl text-xs text-slate-200">
              {msg}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-3 pt-3 border-t border-neutral-800">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={`${activeRoom.name} otağına yazın...`}
            className="flex-1 px-3 py-2 bg-black border border-neutral-800 rounded-xl text-xs text-slate-100 focus:outline-none"
          />
          <button
            onClick={handleSend}
            className="px-4 py-2 bg-skyBlue text-black text-xs font-bold rounded-xl hover:opacity-90 flex items-center gap-1"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
};
