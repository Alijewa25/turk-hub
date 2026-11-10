import React, { useState, useEffect } from 'react';
import { Search, BookOpen, Layers, Sparkles, AlertCircle, Plus } from 'lucide-react';
import { API_URL } from '../api';
import { useI18n } from '../i18n';

interface DialectForms {
  aze?: string | null;
  tur?: string | null;
  kaz?: string | null;
  uzb?: string | null;
  kyg?: string | null;
  tkm?: string | null;
}

interface DictionaryEntry {
  id: number;
  root_concept: string;
  az_val?: string | null;
  tr_val?: string | null;
  kk_val?: string | null;
  uz_val?: string | null;
  ky_val?: string | null;
  tm_val?: string | null;
  dialects?: DialectForms;
  etymology_note?: string | null;
}

const DIALECTS: { key: keyof DialectForms; labelKey: string }[] = [
  { key: 'aze', labelKey: 'dialectAz' },
  { key: 'tur', labelKey: 'dialectTr' },
  { key: 'kaz', labelKey: 'dialectKk' },
  { key: 'uzb', labelKey: 'dialectUz' },
  { key: 'kyg', labelKey: 'dialectKy' },
  { key: 'tkm', labelKey: 'dialectTm' },
];

function toDialects(entry: DictionaryEntry): DialectForms {
  return {
    aze: entry.dialects?.aze ?? entry.az_val,
    tur: entry.dialects?.tur ?? entry.tr_val,
    kaz: entry.dialects?.kaz ?? entry.kk_val,
    uzb: entry.dialects?.uzb ?? entry.uz_val,
    kyg: entry.dialects?.kyg ?? entry.ky_val,
    tkm: entry.dialects?.tkm ?? entry.tm_val,
  };
}

export const Dictionary: React.FC = () => {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [form, setForm] = useState({ root_concept: '', az_val: '', tr_val: '', kk_val: '', uz_val: '', ky_val: '', tm_val: '', etymology_note: '' });
  const [compare, setCompare] = useState<any>(null);

  // Axtarış funksiyası (Debounce ilə backend API-yə müraciət edir)
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_URL}/api/dictionary?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
          throw new Error(t('serverNoResponse'));
        }
        const data = await response.json();
        setResults(data);
      } catch (err) {
        setError(t('searchFailed'));
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center p-3 bg-skyBlue/10 text-skyBlue rounded-2xl mb-1">
          <BookOpen className="w-8 h-8 text-skyBlue" />
        </div>
        <h1 className="text-2xl font-bold text-slate-100">{t('dictionaryTitle')}</h1>
        <p className="text-xs text-slate-400">
          {t('dictionarySubtitle')}
        </p>
        <button
          onClick={() => setShowSubmit(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-skyBlue/10 text-skyBlue text-xs hover:bg-skyBlue/20"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('submitWord')}
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            const qv = e.target.value.trim();
            if (qv.length >= 2) {
              fetch(`${API_URL}/api/dictionary/compare?q=${encodeURIComponent(qv)}`)
                .then((r) => r.json())
                .then((d) => setCompare(d))
                .catch(() => setCompare(null));
            } else {
              setCompare(null);
            }
          }}
          placeholder={t('searchWordPlaceholder')}
          className="w-full pl-12 pr-4 py-3.5 bg-neutral-900 border border-neutral-800 rounded-2xl text-slate-100 placeholder-neutral-500 focus:outline-none focus:border-skyBlue focus:ring-2 focus:ring-skyBlue/20 transition-all text-sm"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-skyBlue border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {compare && compare.comparison?.length > 0 && (
        <div className="bg-neutral-900/80 border border-skyBlue/30 rounded-2xl p-4 space-y-2">
          <p className="text-xs text-skyBlue font-semibold">{t('dynamicDialectComparison')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DIALECTS.map((d) => {
              const vals = compare.comparison.map((c: any) => c.forms?.[d.key === 'aze' ? 'az' : d.key === 'tur' ? 'tr' : d.key === 'kaz' ? 'kk' : d.key === 'uzb' ? 'uz' : d.key === 'kyg' ? 'ky' : 'tm']).filter(Boolean);
              return (
                <div key={d.key} className="bg-black/40 border border-neutral-800 rounded-xl p-2.5">
                  <span className="text-[10px] text-slate-500 block">{t(d.labelKey)}</span>
                  <span className="text-xs text-slate-200">{vals.slice(0,2).join(' / ') || '—'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Xəta mesajı */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4">
        {results.length > 0 ? (
          results.map((entry) => {
            const dialects = toDialects(entry);
            return (
            <div
              key={entry.id}
              className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 space-y-4 hover:border-neutral-700 transition-all"
            >
              <div className="flex items-start justify-between border-b border-neutral-800/80 pb-3">
                <div>
                  <h2 className="text-xl font-bold text-skyBlue capitalize">{entry.root_concept}</h2>
                </div>
                <span className="px-2.5 py-1 bg-skyBlue/10 text-skyBlue border border-skyBlue/20 rounded-lg text-[10px] font-semibold uppercase">
                  {t('panTurkEtymology')}
                </span>
              </div>

              {entry.etymology_note && (
                <div className="bg-black/40 rounded-xl p-3.5 border border-neutral-800/60 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t('etymologyParser')}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{entry.etymology_note}</p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Layers className="w-3.5 h-3.5 text-skyBlue" />
                  <span>{t('dialectComparison')}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {DIALECTS.map((dialect) => (
                    <div key={dialect.key} className="bg-neutral-950 border border-neutral-800 p-2.5 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">{t(dialect.labelKey)}</span>
                      <span className="text-xs text-slate-200 font-medium">{dialects[dialect.key] || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            );
          })
        ) : query.trim() && !loading ? (
          <div className="text-center py-8 text-xs text-slate-500 border border-dashed border-neutral-800 rounded-2xl">
            {t('noEtymologyFound').replace('{query}', query)}
          </div>
        ) : null}
      </div>

      {showSubmit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowSubmit(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-100">{t('submitSuggestion')}</h2>
              <button onClick={() => setShowSubmit(false)} className="text-slate-500 hover:text-slate-200"><AlertCircle className="w-4 h-4" /></button>
            </div>
            {submitMsg && <p className="text-xs text-emerald-400">{submitMsg}</p>}
            <input value={form.root_concept} onChange={(e)=>setForm(f=>({...f,root_concept:e.target.value}))} placeholder={t('rootMeaning')} className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-xl text-xs text-slate-100" />
            {DIALECTS.map(d=>{
              const map:any={aze:'az_val',tur:'tr_val',kaz:'kk_val',uzb:'uz_val',kyg:'ky_val',tkm:'tm_val'};
              return <input key={d.key} value={(form as any)[map[d.key]]} onChange={(e)=>setForm(f=>({...f,[map[d.key]]:e.target.value}))} placeholder={t(d.labelKey)} className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-xl text-xs text-slate-100" />
            })}
            <textarea value={form.etymology_note} onChange={(e)=>setForm(f=>({...f,etymology_note:e.target.value}))} placeholder={t('etymologyNote')} rows={3} className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-xl text-xs text-slate-100 resize-none" />
            <button
              disabled={submitting}
              onClick={async ()=>{
                setSubmitting(true); setSubmitMsg('');
                try {
                  const token = localStorage.getItem('token');
                  const res = await fetch(`${API_URL}/api/dictionary/submit`, {method:'POST', headers:{'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})}, body:JSON.stringify(form)});
                  if(res.ok){ setSubmitMsg(t('suggestionSent')); setForm({root_concept:'',az_val:'',tr_val:'',kk_val:'',uz_val:'',ky_val:'',tm_val:'',etymology_note:''}); }
                  else setSubmitMsg(t('errorGeneric'));
                } catch { setSubmitMsg(t('errorGeneric')); }
                finally { setSubmitting(false); }
              }}
              className="w-full py-2 rounded-xl bg-skyBlue text-black text-xs font-bold"
            >
              {submitting?t('sending'):t('send')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
