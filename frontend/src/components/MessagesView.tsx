import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, User } from 'lucide-react';
import { API_URL, fetchUserByUsername, fetchUserStats, mediaUrl, translateCached, translationChanged } from '../api';
import { LANG_TARGET, langDisplayName, useI18n } from '../i18n';

interface MessagesViewProps {
  token: string | null;
  currentUser: any;
  initialTarget?: any;
  onClose?: () => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({ token, currentUser, initialTarget, onClose }) => {
  const { t, lang } = useI18n();
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeUser, setActiveUser] = useState<any>(initialTarget || null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [translations, setTranslations] = useState<
    Record<number, { text: string; sourceLang: string; show: boolean; loading: boolean; targetLang: string; done: boolean }>
  >({});
  const pollRef = useRef<number | null>(null);

  const fetchConvos = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/messages/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(Array.isArray(data) ? data : []);
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
        setMessages(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchConvos();
  }, [token]);

  useEffect(() => {
    if (!initialTarget) return;

    if (initialTarget.full_name || initialTarget.username) {
      setActiveUser(initialTarget);
      return;
    }

    let cancelled = false;
    const loadTarget = async () => {
      try {
        const user = initialTarget.username
          ? await fetchUserByUsername(token, initialTarget.username)
          : await fetchUserStats(token, initialTarget.id);
        if (!cancelled) setActiveUser({ ...initialTarget, ...user });
      } catch {
        if (!cancelled) setActiveUser(initialTarget);
      }
    };

    if (initialTarget.id || initialTarget.username) {
      void loadTarget();
    }

    return () => {
      cancelled = true;
    };
  }, [initialTarget, token]);

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

  useEffect(() => {
    const target = LANG_TARGET[lang];
    messages.forEach((message) => {
      if (!message?.content?.trim()) return;
      const existing = translations[message.id];
      if (existing?.targetLang === target || existing?.loading) return;
      setTranslations((prev) => ({
        ...prev,
        [message.id]: { text: '', sourceLang: '', show: false, loading: true, targetLang: target, done: false },
      }));
      translateCached(token, message.content, target)
        .then((result) => {
          const useful = translationChanged(result, message.content);
          setTranslations((prev) => ({
            ...prev,
            [message.id]: {
              text: useful ? result.translated_text : '',
              sourceLang: result.source_lang,
              show: useful,
              loading: false,
              targetLang: target,
              done: true,
            },
          }));
        })
        .catch(() =>
          setTranslations((prev) => ({
            ...prev,
            [message.id]: { text: '', sourceLang: '', show: false, loading: false, targetLang: target, done: true },
          }))
        );
    });
  }, [messages, lang, token, translations]);

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
        throw new Error(detail?.detail || t('messageSendFailed'));
      }
      setInput('');
      await fetchMessages(activeUser.id);
      await fetchConvos();
    } catch (err: any) {
      setError(err?.message || t('messageSendFailed'));
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
            const tr = translations[m.id];
            const display = tr?.show && tr.text ? tr.text : m.content;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-2xl text-xs ${
                    mine ? 'bg-skyBlue text-black' : 'bg-neutral-900 text-slate-200 border border-neutral-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{display}</p>
                  {tr?.text && (
                    <button
                      type="button"
                      onClick={() =>
                        setTranslations((prev) => ({
                          ...prev,
                          [m.id]: { ...prev[m.id], show: !prev[m.id]?.show },
                        }))
                      }
                      className={`mt-1 block text-[9px] font-medium transition-colors ${
                        mine ? 'text-black/60 hover:text-black' : 'text-slate-500 hover:text-skyBlue'
                      }`}
                    >
                      {tr.show ? `🔙 ${t('showOriginal')}` : `🌐 ${t('translate')}`}
                    </button>
                  )}
                  {tr?.show && tr.text && (
                    <p className={`mt-0.5 text-[8px] ${mine ? 'text-black/50' : 'text-skyBlue/70'}`}>
                      {t('translatedFrom').replace('{lang}', langDisplayName(tr.sourceLang, lang))}
                    </p>
                  )}
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
            placeholder={t('messagePlaceholder')}
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
      <h2 className="text-base font-bold text-slate-100 mb-4">{t('messagesTitle')}</h2>
      <div className="space-y-2">
        {conversations.length === 0 && (
          <p className="text-xs text-slate-500">{t('noConversations')}</p>
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
