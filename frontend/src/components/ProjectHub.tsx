import React, { useEffect, useState } from 'react';
import { Loader2, MessageCircle, Plus, RefreshCw, Rocket, X } from 'lucide-react';
import { ProjectDraft, ProjectItem, translateCached, translationChanged } from '../api';
import { LANG_TARGET, langDisplayName, useI18n } from '../i18n';

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

interface ProjectTranslation {
  text: string;
  sourceLang: string;
  show: boolean;
  loading: boolean;
  error: string;
  targetLang?: string;
  done?: boolean;
}


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
  const { t, lang } = useI18n();
  const token = localStorage.getItem('token');
  const [translations, setTranslations] = useState<Record<number, ProjectTranslation>>({});
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
        setFormError(t('projectMinCountries'));
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
      setFormError(err?.response?.data?.detail || t('projectCreateError'));
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    const target = LANG_TARGET[lang];
    projects.forEach((project) => {
      if (!project.description?.trim()) return;
      const existing = translations[project.id];
      if (existing?.targetLang === target || existing?.loading) return;
      setTranslations((prev) => ({
        ...prev,
        [project.id]: { text: '', sourceLang: '', show: false, loading: true, error: '', targetLang: target, done: false },
      }));
      translateCached(token, project.description, target)
        .then((result) => {
          const useful = translationChanged(result, project.description);
          setTranslations((prev) => ({
            ...prev,
            [project.id]: {
              text: useful ? result.translated_text : '',
              sourceLang: result.source_lang,
              show: useful,
              loading: false,
              error: '',
              targetLang: target,
              done: true,
            },
          }));
        })
        .catch(() =>
          setTranslations((prev) => ({
            ...prev,
            [project.id]: { text: '', sourceLang: '', show: false, loading: false, error: '', targetLang: target, done: true },
          }))
        );
    });
  }, [projects, lang, token, translations]);

  const handleTranslateProject = async (project: ProjectItem) => {
    const existing = translations[project.id];
    if (existing?.loading) return;
    if (existing?.show) {
      setTranslations((prev) => ({ ...prev, [project.id]: { ...existing, show: false } }));
      return;
    }
    if (existing?.text) {
      setTranslations((prev) => ({ ...prev, [project.id]: { ...existing, show: true } }));
      return;
    }
    const target = LANG_TARGET[lang];
    setTranslations((prev) => ({
      ...prev,
      [project.id]: { text: '', sourceLang: '', show: false, loading: true, error: '', targetLang: target, done: false },
    }));
    try {
      const result = await translateCached(token, project.description, target);
      setTranslations((prev) => ({
        ...prev,
        [project.id]: {
          text: result.translated_text,
          sourceLang: result.source_lang,
          show: true,
          loading: false,
          error: '',
          targetLang: target,
          done: true,
        },
      }));
    } catch {
      setTranslations((prev) => ({
        ...prev,
        [project.id]: { text: '', sourceLang: '', show: false, loading: false, error: t('translationFailed'), targetLang: target, done: true },
      }));
    }
  };

  const renderTranslationButton = (project: ProjectItem, stopPropagation = false) => {
    const item = translations[project.id];
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={(event) => {
            if (stopPropagation) event.stopPropagation();
            void handleTranslateProject(project);
          }}
          disabled={item?.loading}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-skyBlue transition-colors disabled:opacity-60"
        >
          {item?.loading ? `🌐 ${t('translating')}` : item?.show ? `🔙 ${t('showOriginal')}` : `🌐 ${t('translate')}`}
        </button>
        {item?.show && item.text && (
          <span className="text-[9px] text-skyBlue/70">
            {t('translatedFrom').replace('{lang}', langDisplayName(item.sourceLang, lang))}
          </span>
        )}
        {item?.error && <span className="text-[9px] text-red-400">{item.error}</span>}
      </div>
    );
  };

  const inputClass =
    'w-full px-4 py-2.5 bg-black border border-neutral-800 rounded-xl text-sm text-slate-100 placeholder-neutral-600 focus:outline-none focus:border-skyBlue focus:ring-2 focus:ring-skyBlue/20 transition-all';

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-skyBlue" />
          <h2 className="text-base font-bold text-slate-100">{t('projectHubTitle')}</h2>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-skyBlue hover:bg-skyBlue-hover text-black text-xs font-bold transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          {t('newProject')}
        </button>
      </div>

      <p className="mb-4 text-[11px] text-slate-500">
        {t('projectIntro').replace('{name}', user?.full_name || t('userGeneric'))}
      </p>

      {error && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[11px] text-red-400">
          <span>{error}</span>
          <button onClick={onRetry} className="inline-flex items-center gap-1 font-semibold hover:underline">
            <RefreshCw className="w-3.5 h-3.5" />
            {t('retry')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 text-center text-xs text-slate-500">
          <Loader2 className="w-4 h-4 mx-auto mb-2 animate-spin text-skyBlue" />
          {t('loadingProjects')}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-6 text-center text-xs text-slate-500">
          {t('noProjects')}
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
                      #{project.id} • {joined ? t('teamMember') : t('seekingTeam')}
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
                    {joined ? t('joined') : t('joinAction')}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed line-clamp-2">
                  {translations[project.id]?.show && translations[project.id]?.text
                    ? translations[project.id].text
                    : project.description}
                </p>
                {renderTranslationButton(project, true)}
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
              <h2 className="text-sm font-bold text-slate-100">{t('newPanTurkProject')}</h2>
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
                placeholder={t('projectName')}
                required
                minLength={3}
                className={inputClass}
              />
              <textarea
                value={draft.description}
                onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder={t('projectAbout')}
                rows={4}
                required
                minLength={10}
                className={`${inputClass} resize-none`}
              />
              <input
                value={draft.required_skills}
                onChange={(e) => setDraft((prev) => ({ ...prev, required_skills: e.target.value }))}
                placeholder={t('requiredSkillsPlaceholder')}
                className={inputClass}
              />
              <input
                value={draft.target_countries}
                onChange={(e) => setDraft((prev) => ({ ...prev, target_countries: e.target.value }))}
                placeholder={t('targetCountriesPlaceholder')}
                className={inputClass}
              />
              <input
                value={draft.contact_info}
                onChange={(e) => setDraft((prev) => ({ ...prev, contact_info: e.target.value }))}
                placeholder={t('contactOptional')}
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
                {creating ? <Loader2 className="w-4 h-4 mx-auto animate-spin" /> : t('create')}
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
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{t('projectDescription')}</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                {translations[selected.id]?.show && translations[selected.id]?.text
                  ? translations[selected.id].text
                  : selected.description}
              </p>
              {renderTranslationButton(selected)}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{t('targetTurkicStates')}</p>
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
                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{t('requiredSkills')}</p>
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
                  {t('contactDm')}
                </button>
              )}
              <button
                onClick={() => onJoin(selected.id)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-800 text-xs font-semibold text-slate-300 hover:bg-neutral-800"
              >
                {joinedIds.has(selected.id) ? t('joined') : t('joinAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
