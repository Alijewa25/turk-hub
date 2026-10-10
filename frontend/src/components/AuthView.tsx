import React, { useState } from 'react';
import axios from 'axios';
import { Check, ChevronDown, Chrome, Github, Globe2, Layers, Sparkles, Users, X } from 'lucide-react';
import { LANG_META, useI18n } from '../i18n';

export interface AuthUser {
  id?: number;
  full_name?: string;
  email?: string;
  country?: string;
  university?: string;
  bio?: string;
}

interface AuthViewProps {
  onLoginSuccess: (token: string, user: any, isNewUser: boolean) => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'https://turk-hub.onrender.com';

const BRAND_FLAGS = ['🇦🇿', '🇹🇷', '🇰🇿', '🇺🇿', '🇰🇬', '🇹🇲'];

export const AuthView: React.FC<AuthViewProps> = ({ onLoginSuccess }) => {
  const { lang, setLang, t } = useI18n();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialMsg, setSocialMsg] = useState('');
  const [langOpen, setLangOpen] = useState(false);

  const tryEndpoints = async (paths: string[], data: any, isJson = false) => {
    let lastError = null;
    for (const path of paths) {
      try {
        const config = isJson ? {} : { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
        const res = await axios.post(`${API_URL}${path}`, data, config);
        return { res, path };
      } catch (err: any) {
        lastError = err;
        if (err.response && err.response.status !== 404) {
          throw err;
        }
      }
    }
    throw lastError;
  };

  const fetchMe = async (token: string) => {
    try {
      const meRes = await axios.get(`${API_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return meRes.data;
    } catch {
      const meRes = await axios.get(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return meRes.data;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSocialMsg('');
    setLoading(true);

    try {
      if (isLogin) {
        const params = new URLSearchParams();
        params.append('username', email);
        params.append('password', password);

        const { res } = await tryEndpoints(['/api/auth/login', '/login', '/auth/login'], params);
        const token = res.data.access_token;
        localStorage.setItem('token', token);

        const userData = res.data.user || (await fetchMe(token));
        localStorage.setItem('user', JSON.stringify(userData));
        onLoginSuccess(token, userData, false);
      } else {
        const regData = { full_name: fullName, email, password };
        await tryEndpoints(['/api/auth/register', '/register', '/auth/register'], regData, true);

        const params = new URLSearchParams();
        params.append('username', email);
        params.append('password', password);

        const { res } = await tryEndpoints(['/api/auth/login', '/login', '/auth/login'], params);
        const token = res.data.access_token;
        const userData = res.data.user || { full_name: fullName, email };
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(userData));
        onLoginSuccess(token, userData, true);
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError(t('loginError') || 'E-poçt və ya şifrə yanlışdır.');
      } else if (err.response?.status === 400) {
        setError(err.response?.data?.detail || 'Qeydiyyat xətası.');
      } else {
        setError(err.response?.data?.detail || 'Giriş zamanı xəta baş verdi.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 bg-neutral-900/80 border border-neutral-800 rounded-xl text-sm text-slate-100 placeholder-neutral-500 focus:outline-none focus:border-skyBlue focus:ring-2 focus:ring-skyBlue/20 transition-all duration-200';

  const socialLogin = (network: string) => {
    setError('');
    setSocialMsg(`${t('socialSoon')} — ${network}`);
  };

  const features = [
    { icon: Users, text: t('feat1') },
    { icon: Layers, text: t('feat2') },
    { icon: Globe2, text: t('feat3') },
  ];

  const currentLang = LANG_META.find((l) => l.code === lang) || LANG_META[0];

  return (
    <div className="min-h-screen bg-black text-slate-100 flex">
      {/* LEFT: brand showcase (desktop only) */}
      <div className="hidden md:flex relative md:w-1/2 lg:w-[55%] overflow-hidden border-r border-neutral-900 bg-black flex-col justify-between p-10 lg:p-14">
        <div className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full bg-skyBlue/15 blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 -right-24 w-[380px] h-[380px] rounded-full bg-cyan-500/10 blur-[110px]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #33B2CC 1px, transparent 1px), linear-gradient(to bottom, #33B2CC 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Emblem header */}
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-skyBlue to-cyan-400 flex items-center justify-center text-black font-black text-xl shadow-lg shadow-skyBlue/20 ring-1 ring-skyBlue/40">
            T
          </div>
          <div>
            <p className="text-lg font-black tracking-widest text-slate-100 leading-none">TURK HUB</p>
            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-[0.25em]">{t('emblemTag')}</p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-skyBlue border border-skyBlue/30 bg-skyBlue/10 rounded-full px-3 py-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            {t('emblemTag')}
          </span>

          <h1 className="mt-6 text-4xl lg:text-5xl font-black leading-tight text-slate-100">
            {t('heroA')}{' '}
            <span className="bg-gradient-to-r from-skyBlue via-cyan-300 to-skyBlue-hover bg-clip-text text-transparent">
              {t('heroB')}
            </span>
          </h1>

          <p className="mt-4 text-sm lg:text-base text-slate-400 leading-relaxed">{t('heroSub')}</p>

          <ul className="mt-8 space-y-3">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-skyBlue/15 border border-skyBlue/40 flex items-center justify-center">
                  <Check className="w-3 h-3 text-skyBlue" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-3">
          {BRAND_FLAGS.map((f) => (
            <span
              key={f}
              className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-lg hover:border-skyBlue/60 hover:-translate-y-1 transition-all duration-200"
            >
              {f}
            </span>
          ))}
          <span className="ml-2 text-xs text-neutral-500">Azərbaycan • Türkiye • Қазақстан • O'zbekiston • Кыргызстан • Türkmenistan</span>
        </div>
      </div>

      {/* RIGHT: auth card */}
      <div className="w-full md:w-1/2 lg:w-[45%] flex items-center justify-center px-4 py-10 sm:py-14 relative">
        <div className="w-full max-w-sm bg-neutral-900/60 backdrop-blur-xl border border-neutral-800 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-black/60">
          <div className="text-center mb-6">
            <div className="md:hidden mx-auto mb-3 w-14 h-14 rounded-2xl bg-gradient-to-br from-skyBlue to-cyan-400 flex items-center justify-center text-black font-black text-2xl shadow-lg shadow-skyBlue/20 ring-1 ring-skyBlue/40">
              T
            </div>
            <h1 className="text-3xl font-extrabold tracking-wider bg-gradient-to-r from-skyBlue via-cyan-300 to-skyBlue-hover bg-clip-text text-transparent">
              TURK HUB
            </h1>
            <p className="text-xs text-slate-400 mt-1">{t('tagline')}</p>
          </div>

          <div className="flex p-1 bg-black border border-neutral-800 rounded-xl mb-5">
            {[
              { key: true, label: t('loginTab') },
              { key: false, label: t('registerTab') },
            ].map((tab) => (
              <button
                key={String(tab.key)}
                type="button"
                onClick={() => {
                  setIsLogin(tab.key);
                  setError('');
                  setSocialMsg('');
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  isLogin === tab.key
                    ? 'bg-skyBlue text-black shadow-lg shadow-skyBlue/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl text-center flex items-start gap-2">
              <X className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {socialMsg && (
            <div className="mb-4 p-3 bg-skyBlue/10 border border-skyBlue/30 text-skyBlue text-xs rounded-xl text-center">
              {socialMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {!isLogin && (
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1.5 ml-1">{t('labelFullName')}</label>
                <input
                  type="text"
                  placeholder={t('labelFullName')}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5 ml-1">{t('labelEmail')}</label>
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5 ml-1">{t('labelPassword')}</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={4}
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-skyBlue hover:bg-skyBlue-hover font-bold text-black rounded-xl text-sm transition-all duration-200 shadow-lg shadow-skyBlue/25 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? t('loading') : isLogin ? t('submitLogin') : t('submitRegister')}
            </button>
          </form>

          <div className="mt-5 flex items-center gap-3">
            <span className="flex-1 h-px bg-neutral-800" />
            <span className="text-[11px] text-neutral-500">{t('socialOr')}</span>
            <span className="flex-1 h-px bg-neutral-800" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => socialLogin('Google')}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:border-skyBlue/50 hover:bg-neutral-800 text-xs font-semibold text-slate-200 transition-all duration-200"
            >
              <Chrome className="w-4 h-4 text-skyBlue" />
              Google
            </button>
            <button
              type="button"
              onClick={() => socialLogin('GitHub')}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:border-skyBlue/50 hover:bg-neutral-800 text-xs font-semibold text-slate-200 transition-all duration-200"
            >
              <Github className="w-4 h-4 text-slate-300" />
              GitHub
            </button>
          </div>

          <div className="mt-6 text-center border-t border-neutral-800 pt-4">
            <p className="text-xs text-slate-400">
              {isLogin ? t('noAccount') : t('haveAccount')}{' '}
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                  setSocialMsg('');
                }}
                className="text-skyBlue font-semibold hover:underline ml-1"
              >
                {isLogin ? t('signupLink') : t('loginLink')}
              </button>
            </p>
          </div>
        </div>

        {/* Language selector — footer */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            onClick={() => setLangOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-neutral-800 bg-black/60 hover:border-skyBlue/50 text-xs text-slate-300 transition-colors"
          >
            <span>{currentLang.flag}</span>
            <span className="font-semibold">{currentLang.code}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${langOpen ? 'rotate-180' : ''}`} />
          </button>

          {langOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-40 rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl p-1 z-50">
                {LANG_META.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => {
                      setLang(l.code);
                      setLangOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                      lang === l.code
                        ? 'bg-skyBlue/15 text-skyBlue font-semibold'
                        : 'text-slate-300 hover:bg-neutral-800'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{l.flag}</span>
                      <span>{l.label}</span>
                    </span>
                    {lang === l.code && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};