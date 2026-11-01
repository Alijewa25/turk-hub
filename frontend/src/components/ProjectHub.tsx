import React, { useState } from 'react';
import { Loader2, MessageCircle, Plus, RefreshCw, Rocket, X } from 'lucide-react';
import { ProjectDraft, ProjectItem } from '../api';
import { useI18n } from '../i18n';

interface ProjectHubProps {
  projects: ProjectItem[];
  joinedIds: Set<number>;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onJoin: (id: number) => void;
  onCreate: (draft: ProjectDraft) => Promise<void>;
  user?: any;
  onContactFounder?: (ownerId: number) => void;
}

const EMPTY_DRAFT: ProjectDraft = { title: '', description: '', required_skills: '', target_countries: '', contact_info: '' };



export const ProjectHub: React.FC<ProjectHubProps> = ({
  projects,
  joinedIds,
  loading,
  error,
  onRetry,
  onJoin,
  onCreate,
  user,
  onContactFounder,
}) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProjectDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [selected, setSelected] = useState<ProjectItem | null>(null);

  const closeModal = () => {
    if (creating) return;
    setOpen(false);
    setDraft(EMPTY_DRAFT);
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setFormError('');
    try {
      const target = (draft.target_countries || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (target.length < 2) {
        setFormError('Layihə ən azı 2-3 Türk dövləti üçün nəzərdə tutulmalıdır.');
        setCreating(false);
        return;
      }
      await onCreate({
        title: draft.title.trim(),
        description: draft.description.trim(),
        required_skills: draft.required_skills.trim(),
        target_countries: target.join(', '),
        contact_info: draft.contact_info?.trim() || '',
      });
      setOpen(false);
      setDraft(EMPTY_DRAFT);
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || 'Layihə yaradılarkən xəta baş verdi.');
    } finally {
      setCreating(false);
    }
  };

  const inputClass =
    'w-full px-4 py-2.5 bg-black border border-neutral-800 rounded-xl text-sm text-slate-100 placeholder-neutral-600 focus:outline-none focus:border-skyBlue focus:ring-2 focus:ring-skyBlue/20 transition-all';

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-skyBlue" />
          <h2 className="text-base font-bold text-slate-100">{t('navProjects')} (Project Hub)</h2>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-skyBlue hover:bg-skyBlue-hover text-black text-xs font-bold transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Yeni Layihə
        </button>
      </div>

      <p className="mb-4 text-[11px] text-slate-500">
        {user?.full_name || 'İstifadəçi'}, bacarıqlarına uyğun komanda tap və Pan-Türk layihələrinə qoşul.
      </p>

      {error && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[11px] text-red-400">
          <span>{error}</span>
          <button onClick={onRetry} className="inline-flex items-center gap-1 font-semibold hover:underline">
            <RefreshCw className="w-3.5 h-3.5" />
            Yenilə
          </button>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 text-center text-xs text-slate-500">
          <Loader2 className="w-4 h-4 mx-auto mb-2 animate-spin text-skyBlue" />
          Layihələr yüklənir...
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-6 text-center text-xs text-slate-500">
          Hələ layihə yoxdur. İlk Pan-Türk layihəsini yarat.
        </div>
      ) : (
        <div className="space-y-3">
              {projects.map((project) => {
            const joined = joinedIds.has(project.id);
            const targets = (project.target_countries || '').split(',').map((s) => s.trim()).filter(Boolean);
            return (
              <div
                key={project.id}
                onClick={() => setSelected(project)}
                className="cursor-pointer rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 hover:border-skyBlue/40 transition-colors duration-200"
              >
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-skyBlue">
                    <Rocket className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-100 truncate">{project.title}</h3>
                    <p className="text-[11px] text-slate-500">
                      #{project.id} • {joined ? 'Komanda üzvüsən' : 'Komanda axtarır'}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onJoin(project.id);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors active:scale-95 ${
                      joined
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                        : 'bg-skyBlue hover:bg-skyBlue-hover text-black'
                    }`}
                  >
                    {joined ? 'Qoşulub' : 'Qoşul'}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed line-clamp-2">{project.description}</p>
                {targets.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {targets.map((c) => (
                      <span key={c} className="rounded-full border border-skyBlue/30 bg-skyBlue/10 px-2 py-0.5 text-[9px] text-skyBlue">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                {project.required_skills && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {project.required_skills.split(',').map((skill) => (
                      <span
                        key={skill.trim()}
                        className="rounded-full border border-neutral-800 bg-black/60 px-2.5 py-1 text-[10px] text-slate-400"
                      >
                        {skill.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={closeModal}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-100">Yeni Pan-Türk Layihəsi</h2>
              <button type="button" onClick={closeModal} className="text-slate-500 hover:text-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
                {formError}
              </p>
            )}

            <div className="space-y-3">
              <input
                value={draft.title}
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Layihə adı"
                required
                minLength={3}
                className={inputClass}
              />
              <textarea
                value={draft.description}
                onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Layihə haqqında qısa məlumat"
                rows={4}
                required
                minLength={10}
                className={`${inputClass} resize-none`}
              />
              <input
                value={draft.required_skills}
                onChange={(e) => setDraft((prev) => ({ ...prev, required_skills: e.target.value }))}
                placeholder="Tələb olunan bacarıqlar (React, Python, UI/UX)"
                className={inputClass}
              />
              <input
                value={draft.target_countries}
                onChange={(e) => setDraft((prev) => ({ ...prev, target_countries: e.target.value }))}
                placeholder="Hədəf ölkələr (min 2-3, vergüllə ayırın)"
                className={inputClass}
              />
              <input
                value={draft.contact_info}
                onChange={(e) => setDraft((prev) => ({ ...prev, contact_info: e.target.value }))}
                placeholder="Əlaqə (isteğe bağlı)"
                className={inputClass}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 py-2.5 rounded-xl border border-neutral-800 text-xs font-semibold text-slate-300 hover:bg-neutral-800 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex-1 py-2.5 rounded-xl bg-skyBlue hover:bg-skyBlue-hover text-black text-xs font-bold transition-all disabled:opacity-50 active:scale-[0.98]"
              >
                {creating ? <Loader2 className="w-4 h-4 mx-auto animate-spin" /> : 'Yarat'}
              </button>
            </div>
          </form>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Rocket className="w-5 h-5 text-skyBlue" />
                <h2 className="text-sm font-bold text-slate-100">{selected.title}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Təsvir</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{selected.description}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Hədəf Türk dövləti</p>
              <div className="flex flex-wrap gap-1.5">
                {(selected.target_countries || '').split(',').map((c) => c.trim()).filter(Boolean).map((c) => (
                  <span key={c} className="rounded-full border border-skyBlue/30 bg-skyBlue/10 px-2.5 py-1 text-[10px] text-skyBlue">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            {selected.required_skills && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Tələb olunan bacarıqlar</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.required_skills.split(',').map((skill) => (
                    <span key={skill.trim()} className="rounded-full border border-neutral-800 bg-black/60 px-2.5 py-1 text-[10px] text-slate-400">
                      {skill.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {selected.owner_id && onContactFounder && (
                <button
                  onClick={() => {
                    onContactFounder(selected.owner_id!);
                    setSelected(null);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-skyBlue hover:bg-skyBlue-hover text-black text-xs font-bold"
                >
                  <MessageCircle className="w-4 h-4" />
                  Kontakt - DM göndər
                </button>
              )}
              <button
                onClick={() => onJoin(selected.id)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-800 text-xs font-semibold text-slate-300 hover:bg-neutral-800"
              >
                {joinedIds.has(selected.id) ? 'Qoşulub' : 'Komandaya qoşul'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
