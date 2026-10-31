import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, User } from 'lucide-react';
import { API_URL, mediaUrl } from '../api';

interface MessagesViewProps {
  token: string | null;
  currentUser: any;
  initialTarget?: any;
  onClose?: () => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({ token, currentUser, initialTarget, onClose }) => {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeUser, setActiveUser] = useState<any>(initialTarget || null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const pollRef = useRef<number | null>(null);

  const fetchConvos = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/messages/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // ignore transient network errors while polling
    }
  };

  const fetchMessages = async (uid: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/messages/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchConvos();
  }, [token]);

  useEffect(() => {
    if (initialTarget) {
      setActiveUser(initialTarget);
    }
  }, [initialTarget]);

  useEffect(() => {
    if (!activeUser?.id) return;
    setError('');
    fetchMessages(activeUser.id);
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => fetchMessages(activeUser.id), 2000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeUser?.id, token]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !token || !activeUser?.id || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ receiver_id: activeUser.id, content: text }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || 'Mesaj göndərilmədi.');
      }
      setInput('');
      await fetchMessages(activeUser.id);
      await fetchConvos();
    } catch (err: any) {
      setError(err?.message || 'Mesaj göndərilmədi.');
    } finally {
      setSending(false);
    }
  };

  const avatar = (u: any) => mediaUrl(u?.profile_picture);

  if (activeUser) {
    return (
      <section className="max-w-[620px] mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => {
              setActiveUser(null);
              if (onClose) onClose();
            }}
            className="text-slate-400 hover:text-skyBlue"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center overflow-hidden">
              {avatar(activeUser) ? (
                <img src={avatar(activeUser)} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-slate-500" />
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-100">{activeUser.full_name}</p>
              <p className="text-[10px] text-slate-500">@{activeUser.username || activeUser.id}</p>
            </div>
          </div>
        </div>
        <div className="h-[460px] overflow-y-auto rounded-xl border border-neutral-800 bg-black/60 p-3 space-y-2 mb-3">
          {messages.map((m) => {
            const mine = m.sender_id === currentUser?.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-2xl text-xs ${
                    mine ? 'bg-skyBlue text-black' : 'bg-neutral-900 text-slate-200 border border-neutral-800'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            );
          })}
        </div>
        {error && <p className="mb-2 text-[11px] text-red-400">{error}</p>}
        <form onSubmit={send} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Mesaj yaz..."
            className="flex-1 px-3 py-2 bg-black border border-neutral-800 rounded-xl text-xs text-slate-100"
          />
          <button
            type="submit"
            disabled={sending}
            className="px-3 py-2 rounded-xl bg-skyBlue text-black disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="max-w-[620px] mx-auto">
      <h2 className="text-base font-bold text-slate-100 mb-4">Mesajlar (DM)</h2>
      <div className="space-y-2">
        {conversations.length === 0 && (
          <p className="text-xs text-slate-500">Hələ söhbət yoxdur. Profil səhifəsindən mesaj göndərə bilərsiniz.</p>
        )}
        {conversations.map((u) => (
          <button
            key={u.id}
            onClick={() => setActiveUser(u)}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-neutral-800 bg-black/50 hover:border-skyBlue/40 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center overflow-hidden">
              {avatar(u) ? (
                <img src={avatar(u)} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-slate-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-100 truncate">{u.full_name}</p>
              <p className="text-[10px] text-slate-500 truncate">@{u.username || u.id}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};
