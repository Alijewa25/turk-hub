import React, { useState } from 'react';
import { FileText, Image, Loader2, X } from 'lucide-react';
import { API_URL } from '../api';
import { useI18n } from '../i18n';

interface CreatePostModalProps {
  open: boolean;
  mode: 'post' | 'story';
  onClose: () => void;
  onPublish: (body: string, media?: any) => void | Promise<void>;
}

export const CreatePostModal: React.FC<CreatePostModalProps> = ({ open, mode, onClose, onPublish }) => {
  const { t } = useI18n();
  const [body, setBody] = useState('');
  const [uploading, setUploading] = useState(false);
  const [media, setMedia] = useState<any>(null);
  const [error, setError] = useState('');
  const token = localStorage.getItem('token');
  const [publishing, setPublishing] = useState(false);

  const upload = async (file: File) => {
    if (!token) {
      setError(t('loginRequired'));
      return;
    }
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);

      let res = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }).catch(() => null);

      if (!res || !res.ok) {
        res = await fetch(`${API_URL}/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
      }

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || t('uploadFailed'));
      }

      const data = await res.json();
      const rawUrl = data.url || data.file_url || data.path || '';
      const url = rawUrl.startsWith('http')
        ? rawUrl
        : `${API_URL}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;

      setMedia({
        image_url: file.type.startsWith('image/') ? url : undefined,
        file_url: url,
        file_name: data.filename || file.name,
      });
    } catch (err: any) {
      setError(err?.message || t('uploadError'));
      setMedia(null);
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  const isStory = mode === 'story';
  const hint = isStory ? t('myStory') : t('createHint');
  const canPublish = Boolean(body.trim() || media) && !publishing && !uploading;

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
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors" aria-label={t('close')}>
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

        <div className="mt-3 flex items-center gap-2 text-slate-500 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-skyBlue transition-colors cursor-pointer">
            <Image className="w-4 h-4" />
            {t('imagePdf')}
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
                e.target.value = '';
              }}
            />
          </label>
          {uploading && <Loader2 className="w-3 h-3 animate-spin" />}
          {media?.file_name && (
            <span className="text-[10px] text-emerald-400 truncate max-w-[150px] flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {media.file_name}
            </span>
          )}
          <span className="text-[11px] ml-auto">{hint}</span>
        </div>

        {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-neutral-800 text-xs font-semibold text-slate-300 hover:bg-neutral-800 transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            disabled={!canPublish}
            onClick={async () => {
              setPublishing(true);
              setError('');
              try {
                await onPublish(body.trim(), media);
                setBody('');
                setMedia(null);
              } catch (err: any) {
                setError(err?.message || t('publishFailed'));
              } finally {
                setPublishing(false);
              }
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