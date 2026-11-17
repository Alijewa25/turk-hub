import React, { useEffect } from 'react';
import { ArrowRight, Rocket, Sparkles, TrendingUp, X } from 'lucide-react';
import { FollowUser, ProjectItem } from '../../api';
import { useI18n } from '../../i18n';
import { UserAvatar } from '../UserAvatar';

interface RightPanelProps {
  user?: any;
  suggestions: FollowUser[];
  followingIds: Set<number>;
  followPendingIds: Set<number>;
  onToggleFollow: (id: number) => void;
  projects?: ProjectItem[];
  joinedProjectIds?: Set<number>;
  onJoinProject?: (id: number) => void;
  setActiveTab: (tab: string) => void;
}

const FOOTER_LINK_KEYS = ['aboutUs', 'help', 'terms', 'privacy'];
const TRENDING_KEYS = ['trendingDictionary', 'trendingHackathon', 'trendingStartup'];
type FooterLinkKey = (typeof FOOTER_LINK_KEYS)[number];

const INFO_CONTENT: Record<string, Record<FooterLinkKey, string>> = {
  AZ: {
    aboutUs: 'Turk Hub altı türk dövlətinin gənclərini layihə, bilik və mədəniyyət ətrafında birləşdirən Pan-Türk şəbəkəsidir.',
    help: 'Dəstək üçün support@turkhub.az ünvanına yazın. Hesab, təhlükəsizlik və icma qaydaları ilə bağlı suallarınızı cavablandıracağıq.',
    terms: 'Hörmətli ünsiyyət, həqiqi məlumat və təhlükəsiz əməkdaşlıq əsas qaydalarımızdır. Ayrı-seçkilik, təqib və spam icmada qəbul edilmir.',
    privacy: 'Profil və paylaşım məlumatlarınızı Turk Hub xidmətini işlətmək üçün istifadə edirik. Məlumatlarınızı satmırıq; hesabınızı silmək üçün dəstəyə yazın.',
  },
  TR: {
    aboutUs: 'Turk Hub, altı Türk devletinin gençlerini proje, bilgi ve kültür etrafında buluşturan Pan-Türk bir ağdır.',
    help: 'Destek için support@turkhub.az adresine yazın. Hesap, güvenlik ve topluluk kuralları sorularınızı yanıtlayacağız.',
    terms: 'Saygılı iletişim, doğru bilgi ve güvenli iş birliği temel kurallarımızdır. Ayrımcılık, taciz ve spam toplulukta kabul edilmez.',
    privacy: 'Profil ve gönderi bilgilerinizi Turk Hub hizmetini işletmek için kullanırız. Verilerinizi satmayız; hesabınızı silmek için desteğe yazın.',
  },
  KK: {
    aboutUs: 'Turk Hub — алты түркі мемлекетінің жастарын жоба, білім және мәдениет айналасында біріктіретін пантүркілік желі.',
    help: 'Қолдау үшін support@turkhub.az мекенжайына жазыңыз. Тіркелгі, қауіпсіздік және қауымдастық ережелері бойынша көмектесеміз.',
    terms: 'Сыйластық, шынайы ақпарат және қауіпсіз ынтымақтастық — негізгі қағидаларымыз. Кемсітуге, қудалауға және спамға жол берілмейді.',
    privacy: 'Профиль және жарияланым деректерін Turk Hub қызметін ұсыну үшін қолданамыз. Деректерді сатпаймыз; есептік жазбаны жою үшін қолдауға жазыңыз.',
  },
  KY: {
    aboutUs: 'Turk Hub — алты түрк мамлекетинин жаштарын долбоор, билим жана маданият айланасында бириктирген пан-түрк тармагы.',
    help: 'Колдоо үчүн support@turkhub.az дарегине жазыңыз. Каттоо эсеби, коопсуздук жана коомдук эрежелер боюнча жардам беребиз.',
    terms: 'Сый-урмат, чыныгы маалымат жана коопсуз кызматташуу — негизги эрежелерибиз. Басмырлоо, куугунтук жана спам кабыл алынбайт.',
    privacy: 'Профиль жана жарыя маалыматтарын Turk Hub кызматын иштетүү үчүн колдонобуз. Маалыматтарды сатпайбыз; аккаунтту өчүрүү үчүн колдоого жазыңыз.',
  },
  UZ: {
    aboutUs: 'Turk Hub — olti turkiy davlat yoshlarini loyiha, bilim va madaniyat atrofida birlashtiruvchi pan-turkiy tarmoq.',
    help: 'Yordam uchun support@turkhub.az manziliga yozing. Hisob, xavfsizlik va hamjamiyat qoidalari bo‘yicha yordam beramiz.',
    terms: 'Hurmatli muloqot, haqiqiy ma’lumot va xavfsiz hamkorlik asosiy qoidalarimizdir. Kamsitish, ta’qib va spamga yo‘l qo‘yilmaydi.',
    privacy: 'Profil va post ma’lumotlaridan Turk Hub xizmatini ishlatish uchun foydalanamiz. Ma’lumotlaringizni sotmaymiz; hisobni o‘chirish uchun yordamga yozing.',
  },
  TK: {
    aboutUs: 'Turk Hub — alty türk döwletiniň ýaşlaryny taslama, bilim we medeniýet daşynda birleşdirýän pan-türk torudyr.',
    help: 'Goldaw üçin support@turkhub.az salgysyna ýazyň. Hasap, howpsuzlyk we jemgyýet düzgünleri boýunça kömek bereris.',
    terms: 'Hormat, hakyky maglumat we howpsuz hyzmatdaşlyk esasy düzgünlerimizdir. Ählumumy kemsitme, azar bermek we spam kabul edilmeýär.',
    privacy: 'Profil we paýlaşma maglumatlaryny Turk Hub hyzmatyny işletmek üçin ulanýarys. Maglumatlaryňyzy satmaýarys; hasaby pozmak üçin goldawa ýazyň.',
  },
  EN: {
    aboutUs: 'Turk Hub is a Pan-Turkic youth network connecting young people from six Turkic states through projects, knowledge, and culture.',
    help: 'For support, email support@turkhub.az. We can help with account access, safety, and community guidelines.',
    terms: 'Respectful communication, authentic information, and safe collaboration are our core rules. Discrimination, harassment, and spam are not welcome.',
    privacy: 'We use profile and post information to operate Turk Hub. We do not sell your data; contact support to delete your account.',
  },
};

const InfoModal: React.FC<{ linkKey: FooterLinkKey; lang: string; title: string; onClose: () => void; closeLabel: string }> = ({
  linkKey,
  lang,
  title,
  onClose,
  closeLabel,
}) => {
  const content = INFO_CONTENT[lang] || INFO_CONTENT.EN;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <h2 id="info-modal-title" className="text-sm font-bold text-slate-100">{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="text-slate-400 hover:text-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-300">{content[linkKey]}</p>
      </div>
    </div>
  );
};

export const RightPanel: React.FC<RightPanelProps> = ({
  user,
  suggestions,
  followingIds,
  followPendingIds,
  onToggleFollow,
  projects = [],
  joinedProjectIds = new Set<number>(),
  onJoinProject,
  setActiveTab,
}) => {
  const { lang, t } = useI18n();
  const [activeInfo, setActiveInfo] = React.useState<FooterLinkKey | null>(null);

  return (
    <aside className="hidden lg:block fixed inset-y-0 right-0 z-30 w-80 border-l border-neutral-900 bg-black px-5 py-6 overflow-y-auto no-scrollbar">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
        <div className="flex items-center gap-3">
          <UserAvatar name={user?.full_name} avatarUrl={user?.avatar_url || user?.profile_picture} className="w-12 h-12" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">{user?.full_name || t('userGeneric')}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email || 'turkhub.az'}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400 leading-relaxed">
          {user?.country || 'Azerbaijan'} • {user?.university || t('memberRole')} —{' '}
          <span className="text-skyBlue font-medium">{user?.bio || t('innovatorBio')}</span>
        </p>
        <button
          onClick={() => setActiveTab('profile')}
          className="mt-4 w-full py-2 rounded-lg text-xs font-semibold text-skyBlue bg-skyBlue/10 border border-skyBlue/30 hover:bg-skyBlue/20 transition-colors duration-200"
        >
          {t('viewProfile')}
        </button>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('suggestionsForYou')}</h3>
          <TrendingUp className="w-4 h-4 text-skyBlue" />
        </div>
        <ul className="space-y-2">
          {suggestions.slice(0, 3).map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-2.5 hover:border-skyBlue/40 transition-colors duration-200"
            >
              <UserAvatar name={u.full_name} avatarUrl={u.avatar_url || u.profile_picture} className="w-8 h-8 text-xs" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-slate-100 truncate">{u.full_name}</span>
                <span className="block text-[10px] text-slate-500">
                  {u.country} • {u.followers_count} {t('followersSuffix')}
                </span>
              </span>
              <button
                onClick={() => onToggleFollow(u.id)}
                disabled={followPendingIds.has(u.id)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                  followingIds.has(u.id)
                    ? 'text-slate-300 border border-neutral-800 hover:border-red-500/50 hover:text-red-400'
                    : 'text-black bg-skyBlue hover:bg-skyBlue-hover'
                }`}
              >
                {followingIds.has(u.id) ? t('following') : t('follow')}
              </button>
            </li>
          ))}
          {suggestions.length === 0 && (
            <li className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-3 text-[11px] text-slate-500">
              {t('loadingUsers')}
            </li>
          )}
        </ul>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('trendingProjects')}</h3>
          <TrendingUp className="w-4 h-4 text-skyBlue" />
        </div>
        <ul className="space-y-2">
          {projects.slice(0, 4).map((project) => {
            const joined = joinedProjectIds.has(project.id);
            return (
              <li
                key={project.id}
                className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-2.5 hover:border-skyBlue/40 transition-colors duration-200"
              >
                <span className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center">
                  <Rocket className="w-4 h-4 text-skyBlue" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-100 truncate">{project.title}</span>
                  <span className="block text-[10px] text-slate-500 truncate">
                    {project.required_skills || t('openTeam')}
                  </span>
                </span>
                <button
                  onClick={() => onJoinProject?.(project.id)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                    joined
                      ? 'text-emerald-400 border border-emerald-500/30 bg-emerald-500/10'
                      : 'text-black bg-skyBlue hover:bg-skyBlue-hover'
                  }`}
                >
                  {joined ? t('joined') : t('joinAction')}
                </button>
              </li>
            );
          })}
          {projects.length === 0 && (
            <li className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-3 text-[11px] text-slate-500">
              {t('loadingProjectsRight')}
            </li>
          )}
        </ul>
      </div>

      <div className="mt-6 rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-skyBlue/10 p-4">
        <div className="flex items-center gap-2 text-skyBlue">
          <Sparkles className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">{t('trendingNow')}</span>
        </div>
        <ul className="mt-3 space-y-2">
          {TRENDING_KEYS.map((key) => (
            <li key={key}>
              <button
                onClick={() => setActiveTab('explore')}
                className="group flex w-full items-center justify-between text-xs text-slate-300 hover:text-skyBlue transition-colors"
              >
                <span className="truncate">{t(key)}</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <footer className="mt-8 text-[10px] leading-relaxed text-neutral-600">
        <p className="flex flex-wrap gap-x-2 gap-y-1">
          {FOOTER_LINK_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveInfo(key)}
              className="hover:text-slate-400 transition-colors"
            >
              {t(key)}
            </button>
          ))}
        </p>
        <p className="mt-3">{t('feedFooter')}</p>
      </footer>
      {activeInfo && (
        <InfoModal
          linkKey={activeInfo}
          lang={lang}
          title={t(activeInfo)}
          onClose={() => setActiveInfo(null)}
          closeLabel={t('close')}
        />
      )}
    </aside>
  );
};