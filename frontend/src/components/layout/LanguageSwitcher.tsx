import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { LANG_META, useI18n } from '../../i18n';

interface LanguageSwitcherProps {
  compact?: boolean;
  placement?: 'up' | 'down';
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  compact = false,
  placement = 'down',
  className = '',
}) => {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const current = LANG_META.find((item) => item.code === lang) || LANG_META[0];

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={t('selectLanguage')}
        aria-label={t('selectLanguage')}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900/70 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-skyBlue/50 hover:text-skyBlue"
      >
        <span>{current.flag}</span>
        {!compact && <span className="max-w-[110px] truncate font-semibold">{current.label}</span>}
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{current.code}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute right-0 z-50 w-44 rounded-xl border border-neutral-800 bg-neutral-900 p-1 shadow-2xl ${
              placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          >
            {LANG_META.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => {
                  setLang(item.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors ${
                  lang === item.code
                    ? 'bg-skyBlue/15 font-semibold text-skyBlue'
                    : 'text-slate-300 hover:bg-neutral-800'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span>{item.flag}</span>
                  <span>{item.label}</span>
                </span>
                {lang === item.code && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
