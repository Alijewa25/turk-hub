import React, { useState, useEffect } from 'react';
import { Search, BookOpen, Layers, Sparkles, AlertCircle } from 'lucide-react';
import { API_URL } from '../api';

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

const DIALECTS: { key: keyof DialectForms; label: string }[] = [
  { key: 'aze', label: '🇦🇿 Azərbaycan' },
  { key: 'tur', label: '🇹🇷 Türkiye' },
  { key: 'kaz', label: '🇰🇿 Qazaxıstan' },
  { key: 'uzb', label: '🇺🇿 Özbəkistan' },
  { key: 'kyg', label: '🇰🇬 Qırğızıstan' },
  { key: 'tkm', label: '🇹🇲 Türkmənistan' },
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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
          throw new Error('Server cavab vermədi');
        }
        const data = await response.json();
        setResults(data);
      } catch (err) {
        setError('Axtarış zamanı xəta baş verdi. Backend-in işlədiyindən əmin olun.');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-6">
      {/* Başlıq */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center p-3 bg-skyBlue/10 text-skyBlue rounded-2xl mb-1">
          <BookOpen className="w-8 h-8 text-skyBlue" />
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Ortaq Türk Etimoloji Lüğəti</h1>
        <p className="text-xs text-slate-400">
          Türk dilləri arasında etimoloji köklər və dialekt qarşılıqlarını axtarın
        </p>
      </div>

      {/* Axtarış Inputu */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Məsələn: su, bilig, yol..."
          className="w-full pl-12 pr-4 py-3.5 bg-neutral-900 border border-neutral-800 rounded-2xl text-slate-100 placeholder-neutral-500 focus:outline-none focus:border-skyBlue focus:ring-2 focus:ring-skyBlue/20 transition-all text-sm"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-skyBlue border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Xəta mesajı */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Axtarış Nəticələri */}
      <div className="space-y-4">
        {results.length > 0 ? (
          results.map((entry) => {
            const dialects = toDialects(entry);
            return (
            <div
              key={entry.id}
              className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 space-y-4 hover:border-neutral-700 transition-all"
            >
              {/* Söz və Məna */}
              <div className="flex items-start justify-between border-b border-neutral-800/80 pb-3">
                <div>
                  <h2 className="text-xl font-bold text-skyBlue capitalize">{entry.root_concept}</h2>
                </div>
                <span className="px-2.5 py-1 bg-skyBlue/10 text-skyBlue border border-skyBlue/20 rounded-lg text-[10px] font-semibold uppercase">
                  Türkic Root
                </span>
              </div>

              {/* Etimologiya Analizi */}
              {entry.etymology_note && (
                <div className="bg-black/40 rounded-xl p-3.5 border border-neutral-800/60 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Etimoloji Mənşə</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{entry.etymology_note}</p>
                </div>
              )}

              {/* Dialekt/Lehçə Qarşılıqları Grid */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Layers className="w-3.5 h-3.5 text-skyBlue" />
                  <span>Müasir Türk Dillərində Qarşılığı</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {DIALECTS.map((dialect) => (
                    <div key={dialect.key} className="bg-neutral-950 border border-neutral-800 p-2.5 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">{dialect.label}</span>
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
            "{query}" üçün lüğətdə heç bir etimoloji məlumat tapılmadı.
          </div>
        ) : null}
      </div>
    </div>
  );
};
