import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { StoryItem } from '../api';
import { flagOf, useI18n } from '../i18n';

interface StoryViewerProps {
  stories: StoryItem[];
  index: number;
  onClose: () => void;
  onNav: (index: number) => void;
}

const PROGRESS_MS = 5000;

export const StoryViewer: React.FC<StoryViewerProps> = ({ stories, index, onClose, onNav }) => {
  const { t } = useI18n();
  const story = stories[index];
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const next = useCallback(() => {
    if (index + 1 < stories.length) {
      onNav(index + 1);
    } else {
      onClose();
    }
  }, [index, stories.length, onNav, onClose]);

  const prev = () => {
    if (index > 0) onNav(index - 1);
  };

  useEffect(() => {
    setProgress(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setProgress((p) => {
        if (p + 100 / (PROGRESS_MS / 100) >= 100) {
          clearInterval(timerRef.current!);
          next();
          return 100;
        }
        return p + 100 / (PROGRESS_MS / 100);
      });
    }, 100);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [index, next]);

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black flex items-center justify-center" onClick={onClose}>
      <div
        className="relative w-full max-w-md h-[80vh] max-h-[640px] bg-gradient-to-b from-neutral-900 via-black to-neutral-900 rounded-none sm:rounded-2xl border border-neutral-900 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex flex-col gap-2">
          <div className="flex gap-1">
            {stories.map((s, i) => (
              <span
                key={s.id}
                className="h-0.5 flex-1 rounded-full overflow-hidden bg-neutral-800"
              >
                <span
                  className="block h-full bg-skyBlue transition-all duration-100"
                  style={{ width: i < index ? '100%' : i === index ? `${progress}%` : '0%' }}
                />
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-black border border-skyBlue/40 flex items-center justify-center text-xl">
              {flagOf(story.country || story.user.country)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-100 truncate">{story.user.full_name}</p>
              <p className="text-[10px] text-slate-500">{story.user.country} • {t('storyOf')}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" aria-label="Bağla">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center overflow-y-auto">
          <p className="text-xl font-semibold text-slate-100 leading-relaxed">{story.text || '...'}</p>
        </div>

        <div className="p-4 flex items-center justify-between">
          <button
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            disabled={index === 0}
            className="p-2 rounded-full bg-neutral-900 border border-neutral-800 text-slate-300 hover:text-skyBlue disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Əvvəlki"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-[11px] text-neutral-500">
            {index + 1} / {stories.length}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="p-2 rounded-full bg-neutral-900 border border-neutral-800 text-slate-300 hover:text-skyBlue transition-colors"
            aria-label="Növbəti"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};