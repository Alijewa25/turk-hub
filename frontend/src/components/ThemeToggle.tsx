import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useI18n } from '../i18n';
import { useTheme } from '../theme';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const nextLabel = theme === 'dark' ? t('lightTheme') : t('darkTheme');

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-slate-300 hover:bg-neutral-900/70 transition-colors"
      aria-label={nextLabel}
      title={nextLabel}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      <span>{nextLabel}</span>
      <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500">
        {theme === 'dark' ? 'Dark' : 'Light'}
      </span>
    </button>
  );
};
