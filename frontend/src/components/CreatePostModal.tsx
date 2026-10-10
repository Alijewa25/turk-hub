import React, { useState } from 'react';
import { Image, Loader2, X } from 'lucide-react';
import { useI18n } from '../i18n';

type CreateMode = 'post' | 'story';

interface CreatePostModalProps {
  open: boolean;
  mode?: CreateMode;
  onClose: () => void;
  onPublish: (body: string) => void;
}

export const CreatePostModal: React.FC<CreatePostModalProps> = ({ open, mode = 'post', onClose, onPublish }) => {
  const { t } = useI18n();
  const [body, setBody] = useState('');
  const [publishing, setPublishing] = useState(false);

  if (!open) return null;

  const isStory = mode === 'story';
  const hint = isStory ? t('myStory') : t('createHint');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-100">{isStory ? t('myStory') : t('newPost')}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors" aria-label="Bağla">
            <X className="w-5 h-5" />
          </button>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={isStory ? 3 : 4}
          autoFocus
          placeholder={t('commentPlaceholder')}
          className="w-full px-4 py-3 bg-black border border-neutral-800 rounded-xl text-sm text-slate-100 placeholder-neutral-600 focus:outline-none focus:border-skyBlue focus:ring-2 focus:ring-skyBlue/20 transition-all resize-none"
        />

        <div className="mt-3 flex items-center gap-2 text-slate-500">
          <button className="p-2 rounded-lg border border-neutral-800 hover:border-skyBlue/50 hover:text-skyBlue transition-colors">
            <Image className="w-4 h-4" />
          </button>
          <span className="text-[11px]">{hint}</span>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-neutral-800 text-xs font-semibold text-slate-300 hover:bg-neutral-800 transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            disabled={!body.trim() || publishing}
            onClick={() => {
              setPublishing(true);
              onPublish(body.trim());
              setBody('');
              setPublishing(false);
            }}
            className="flex-1 py-2.5 rounded-xl bg-skyBlue hover:bg-skyBlue-hover text-black text-xs font-bold transition-all disabled:opacity-50 active:scale-[0.98]"
          >
            {publishing ? <Loader2 className="w-4 h-4 mx-auto animate-spin" /> : t('publish')}
          </button>
        </div>
      </div>
    </div>
  );
};