import React, { useState } from 'react';
import axios from 'axios';
import { ArrowRight, Check, Loader2, MapPin, Sparkles } from 'lucide-react';
import { countryToLang, UNION_COUNTRIES, useI18n } from '../i18n';

interface CountrySelectionProps {
  onContinue: (updatedUser: any) => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'https://turk-hub.onrender.com';

export const CountrySelection: React.FC<CountrySelectionProps> = ({ onContinue }) => {
  const { setLang, t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const currentFlag = selected ? UNION_COUNTRIES.find((c) => c.id === selected)?.flag : '🌍';

  const handleContinue = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(
        `${API_URL}/api/users/me`,
        { country: selected },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const updatedUser = res.data || { country: selected };
      localStorage.setItem('user', JSON.stringify(updatedUser));

      const lang = countryToLang(selected);
      setLang(lang);
      setSaved(true);
      setTimeout(() => onContinue(updatedUser), 350);
    } catch {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.put(
          `${API_URL}/users/me`,
          { country: selected },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const updatedUser = res.data || { country: selected };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setLang(countryToLang(selected));
        setSaved(true);
        setTimeout(() => onContinue(updatedUser), 350);
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'Ölkə yenilənərkən xəta baş verdi. Yenidən cəhd edin.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-slate-100 flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="absolute -top-40 -right-40 w-[420px] h-[420px] rounded-full bg-skyBlue/10 blur-[130px]" />
      <div className="absolute -bottom-40 -left-40 w-[420px] h-[420px] rounded-full bg-cyan-500/10 blur-[130px]" />
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #33B2CC 1px, transparent 1px), linear-gradient(to bottom, #33B2CC 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative w-full max-w-lg">
        <div className="text-center mb-7">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-skyBlue to-cyan-400 flex items-center justify-center text-black font-black text-2xl shadow-lg shadow-skyBlue/20 ring-1 ring-skyBlue/40">
            T
          </div>
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-skyBlue border border-skyBlue/30 bg-skyBlue/10 rounded-full px-3 py-1.5 mb-4">
            <MapPin className="w-3.5 h-3.5" />
            {t('emblemTag')}
          </span>
          <h1 className="text-3xl font-black text-slate-100" style={{ transition: 'all .2s' }}>
            {t('onboardingTitle')}
          </h1>
          <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">{t('onboardingSubtitle')}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {UNION_COUNTRIES.map((c) => {
            const isActive = selected === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`group relative rounded-2xl border p-4 flex flex-col items-center gap-2 transition-all duration-200 ${
                  isActive
                    ? 'border-skyBlue bg-skyBlue/10 shadow-lg shadow-skyBlue/10 scale-[1.03]'
                    : 'border-neutral-800 bg-neutral-900/70 hover:border-skyBlue/50 hover:bg-neutral-900'
                }`}
              >
                {saved && isActive && (
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-skyBlue text-black flex items-center justify-center">
                    <Check className="w-4 h-4" strokeWidth={3} />
                  </span>
                )}
                <span className="text-3xl transition-transform duration-200 group-hover:scale-110">{c.flag}</span>
                <span className={`text-xs font-semibold ${isActive ? 'text-skyBlue' : 'text-slate-300'}`}>
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>

        {error && <p className="mt-4 text-center text-xs text-red-400">{error}</p>}

        <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 flex items-center gap-3">
          <span className="text-2xl">{currentFlag}</span>
          <p className="text-[11px] text-slate-400 flex-1 leading-relaxed">
            {t('onboardingHint')}
            <span className="block text-skyBlue font-medium mt-0.5">
              {selected
                ? UNION_COUNTRIES.find((c) => c.id === selected)?.name
                : t('onboardingTitle')}
            </span>
          </p>
          <button
            onClick={handleContinue}
            disabled={!selected || saving}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-skyBlue hover:bg-skyBlue-hover text-black text-xs font-bold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>{t('continue')}</span><ArrowRight className="w-3.5 h-3.5" /></>}
          </button>
        </div>

        <p className="mt-5 text-center text-[10px] text-neutral-600 flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3 text-skyBlue/50" />
          {t('tagline')}
        </p>
      </div>
    </div>
  );
};