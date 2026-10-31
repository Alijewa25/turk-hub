import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, Globe } from 'lucide-react';
import { API_URL } from '../api';

export const RoomsView: React.FC = () => {
  const [rooms] = useState([
    { id: 'az', name: '🇦🇿 Azərbaycan Türkcəsi', lang: 'Azerbaijan' },
    { id: 'tr', name: '🇹🇷 Türkiye Türkçesi', lang: 'Turkey' },
    { id: 'kk', name: '🇰🇿 Қазақ Tілі', lang: 'Kazakhstan' },
    { id: 'uz', name: '🇺🇿 O‘zbek Tili', lang: 'Uzbekistan' },
  ]);

  const [activeRoom, setActiveRoom] = useState(rooms[0]);
  const [messages, setMessages] = useState<{ id: number; text: string; user: string }[]>([
    { id: 1, text: 'Xoş gəlmisiniz! Söhbətə başlaya bilərsiniz.', user: 'Sistem' }
  ]);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { id: Date.now(), text: input, user: 'Sən' }]);
    setInput('');
  };

  return (
    <section className="space-y-4 pb-20">
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {rooms.map((room) => (
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
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
            Canlı Otaq
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {messages.map((msg) => (
            <div key={msg.id} className="p-2.5 bg-black/60 border border-neutral-800/80 rounded-xl text-xs">
              <span className="text-skyBlue font-bold mr-2">{msg.user}:</span>
              <span className="text-slate-200">{msg.text}</span>
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
          <button onClick={handleSend} className="px-4 py-2 bg-skyBlue text-black text-xs font-bold rounded-xl hover:opacity-90 flex items-center gap-1">
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
};
