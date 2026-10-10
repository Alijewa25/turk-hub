import React from 'react';
import { Plus } from 'lucide-react';
import { flagOf, useI18n } from '../i18n';
import { StoryItem } from '../api';

interface StoriesBarProps {
  stories: StoryItem[];
  ownFlag?: string;
  ownInitial?: string;
  seenIds: Set<number>;
  onSelectStory: (story: StoryItem) => void;
  onAddStory: () => void;
}

interface RingStory {
  flag: string;
  name: string;
  story?: StoryItem;
  isOwn: boolean;
  seen: boolean;
}

export const StoriesBar: React.FC<StoriesBarProps> = ({ stories, ownFlag, ownInitial, seenIds, onSelectStory, onAddStory }) => {
  const { t } = useI18n();

  const ringStories: RingStory[] = [
    { flag: ownFlag || '🌍', name: t('myStory'), isOwn: true, seen: false },
    ...stories.map((s) => ({
      flag: flagOf(s.country || s.user.country),
      name: s.user.full_name,
      story: s,
      isOwn: false,
      seen: seenIds.has(s.id),
    })),
  ].slice(0, 12);

  return (
    <div className="flex gap-4 overflow-x-auto no-scrollbar py-3 px-1 border-b border-neutral-800 mb-4">
      {ringStories.map((s) => (
        <button
          key={s.isOwn ? 'own' : s.story?.id}
          onClick={() => (s.isOwn ? onAddStory() : s.story && onSelectStory(s.story))}
          className="flex flex-col items-center space-y-1 min-w-[64px] cursor-pointer group flex-shrink-0"
        >
          <span
            className={`p-[2px] rounded-full transition-transform duration-200 group-hover:scale-105 ${
              s.seen
                ? 'bg-neutral-900 ring-1 ring-neutral-800'
                : 'bg-gradient-to-tr from-skyBlue via-cyan-400 to-emerald-400 ring-2 ring-skyBlue/40 shadow-lg shadow-skyBlue/20'
            }`}
          >
            <span className="relative w-14 h-14 bg-black rounded-full flex items-center justify-center text-2xl border-2 border-black">
              {s.isOwn ? (
                <>
                  <span className="text-slate-400 font-bold text-sm">{ownInitial || 'U'}</span>
                  <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-skyBlue text-black border-2 border-black flex items-center justify-center">
                    <Plus className="w-3 h-3" strokeWidth={3} />
                  </span>
                </>
              ) : (
                s.flag
              )}
            </span>
          </span>
          <span className="text-[10px] text-slate-400 truncate w-16 text-center group-hover:text-slate-200 transition-colors">
            {s.name}
          </span>
        </button>
      ))}
    </div>
  );
};