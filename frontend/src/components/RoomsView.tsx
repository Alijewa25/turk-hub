import React, { useEffect, useRef, useState } from 'react';
import { Globe, Send } from 'lucide-react';
import { API_URL } from '../api';
import { useI18n } from '../i18n';
import { UserAvatar } from './UserAvatar';

const ROOMS = [
  { id: 'az', nameKey: 'roomAz', lang: 'Azerbaijan' },
  { id: 'tr', nameKey: 'roomTr', lang: 'Turkey' },
  { id: 'kk', nameKey: 'roomKk', lang: 'Kazakhstan' },
  { id: 'uz', nameKey: 'roomUz', lang: 'Uzbekistan' },
  { id: 'tm', nameKey: 'roomTm', lang: 'Turkmenistan' },
  { id: 'ky', nameKey: 'roomKy', lang: 'Kyrgyzstan' },
  { id: 'global', nameKey: 'roomGlobal', lang: 'Global' },
];

interface RoomChatMessage {
  id?: number;
  room_id?: string;
  sender_id?: number;
  sender_name?: string;
  sender_username?: string;
  sender_country?: string;
  sender_avatar?: string;
  content: string;
  created_at?: string;
  system?: boolean;
}

export const RoomsView: React.FC = () => {
  const { t, lang } = useI18n();
  const rooms = ROOMS.map((room) => ({ ...room, name: t(room.nameKey) }));
  const [activeRoomId, setActiveRoomId] = useState(ROOMS[0].id);
  const activeRoom = rooms.find((room) => room.id === activeRoomId) || rooms[0];
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'connecting' | 'open' | 'error'>('connecting');
  const socketRef = useRef<WebSocket | null>(null);

  const appendMessage = (message: RoomChatMessage) => {
    setMessages((prev) => {
      if (message.id !== undefined && prev.some((item) => item.id === message.id)) return prev;
      if (message.id === undefined && prev.some((item) => item.system && item.content === message.content)) return prev;
      return [...prev, message];
    });
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const controller = new AbortController();
    setMessages([{ content: t('chatWelcome').replace('{room}', activeRoom.name), system: true }]);

    fetch(`${API_URL}/api/rooms/${encodeURIComponent(activeRoom.id)}/messages?limit=50`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Room history request failed: ${response.status}`);
        return response.json() as Promise<RoomChatMessage[]>;
      })
      .then((history) => {
        setMessages((prev) => {
          const next = [...prev];
          for (const message of history) {
            if (!next.some((item) => item.id === message.id)) next.push(message);
          }
          return next;
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error('Could not load room message history', error);
      });

    return () => controller.abort();
  }, [activeRoomId, activeRoom.id, activeRoom.name, t]);

  useEffect(() => {
    setStatus('connecting');

    const clientId = `web-${Math.random().toString(36).slice(2, 8)}`;
    const token = localStorage.getItem('token');
    const apiBase = new URL(API_URL, window.location.origin);
    const wsProtocol = apiBase.protocol === 'https:' ? 'wss:' : 'ws:';
    const basePath = apiBase.pathname
      .replace(/\/+$/, '')
      .replace(/\/(?:api\/)?ws(?:\/chat)?$/i, '');
    const socketUrl = new URL(
      `${basePath}/ws/chat/${encodeURIComponent(activeRoom.id)}/${encodeURIComponent(clientId)}`,
      `${wsProtocol}//${apiBase.host}`
    );
    socketUrl.search = '';
    if (token) socketUrl.searchParams.set('token', token);

    let disposed = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let clientPingTimer: ReturnType<typeof setInterval> | undefined;
    let socket: WebSocket | null = null;
    const reconnectDelays = [1000, 3000, 5000, 10000];

    const clearClientPing = () => {
      if (clientPingTimer) {
        clearInterval(clientPingTimer);
        clientPingTimer = undefined;
      }
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      clearClientPing();
      const delay = reconnectDelays[Math.min(attempt, reconnectDelays.length - 1)];
      attempt += 1;
      setStatus('error');
      appendMessage({ content: t('connectionLost'), system: true });
      appendMessage({
        content: t('reconnectingIn').replace('{sec}', String(Math.max(1, Math.round(delay / 1000)))),
        system: true,
      });
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      let current: WebSocket;
      try {
        current = new WebSocket(socketUrl.toString());
      } catch {
        scheduleReconnect();
        return;
      }
      socket = current;
      socketRef.current = current;

      current.onopen = () => {
        attempt = 0;
        setStatus('open');
        clearClientPing();
        clientPingTimer = setInterval(() => {
          if (current.readyState === WebSocket.OPEN) {
            current.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20000);
      };
      current.onmessage = (event) => {
        const raw = String(event.data);
        try {
          const payload = JSON.parse(raw);
          if (payload?.type === 'ping') {
            if (current.readyState === WebSocket.OPEN) {
              current.send(JSON.stringify({ type: 'pong' }));
            }
            return;
          }
          if (payload?.type === 'pong') return;
          if (payload?.type === 'message' && typeof payload.content === 'string') {
            appendMessage(payload as RoomChatMessage);
            return;
          }
        } catch {
        }
        appendMessage({ content: raw, system: true });
      };
      current.onerror = () => {
        try {
          current.close();
        } catch {
          scheduleReconnect();
        }
      };
      current.onclose = () => {
        clearClientPing();
        if (socketRef.current === current) socketRef.current = null;
        if (current === socket) socket = null;
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearClientPing();
      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
      socket = null;
      socketRef.current = null;
    };
  }, [activeRoomId, lang, t]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      appendMessage({ content: t('noConnection'), system: true });
      return;
    }
    socketRef.current.send(text);
    setInput('');
  };

  return (
    <section className="space-y-4 pb-20">
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => setActiveRoomId(room.id)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeRoomId === room.id
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
            {status === 'open' ? t('live') : status === 'connecting' ? t('connecting') : t('offline')}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {messages.map((msg, idx) => (
            <div
              key={msg.id ?? `${idx}-${msg.content.slice(0, 12)}`}
              className={`flex items-start gap-2 ${msg.system ? 'justify-center' : ''}`}
            >
              {!msg.system && (
                <UserAvatar
                  name={msg.sender_name || msg.sender_username}
                  avatarUrl={msg.sender_avatar}
                  size="sm"
                  className="h-7 w-7 text-[10px]"
                />
              )}
              <div className={`max-w-[85%] p-2.5 bg-black/60 border border-neutral-800/80 rounded-xl text-xs text-slate-200 ${msg.system ? 'text-center text-slate-500' : ''}`}>
                {!msg.system && (
                  <p className="mb-1 text-[10px] font-semibold text-skyBlue">
                    {msg.sender_name || msg.sender_username || t('userGeneric')}
                  </p>
                )}
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-3 pt-3 border-t border-neutral-800">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={t('chatPlaceholder').replace('{room}', activeRoom.name)}
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
