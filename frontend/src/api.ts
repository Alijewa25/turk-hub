import axios, { type AxiosError } from 'axios';
import { normalizeLangCode } from './i18n';

export const AUTH_EXPIRED_EVENT = 'turkhub:auth-expired';

const PRODUCTION_API_URL = 'https://turk-hub.onrender.com';
const LOCAL_API_URL = 'http://localhost:8000';
const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i;

function resolveApiUrl(): string {
  const configured = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    ''
  ).trim();

  const pageIsLocal =
    typeof window !== 'undefined' &&
    /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

  // Never let a localhost API URL leak into a deployed build.
  if (configured && !(LOCALHOST_PATTERN.test(configured) && !pageIsLocal)) {
    return configured.replace(/\/$/, '');
  }

  return import.meta.env.PROD ? PRODUCTION_API_URL : LOCAL_API_URL;
}

export const API_URL = resolveApiUrl();
export const API_BASE_URL = API_URL;

export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('/')) {
    return `${API_BASE_URL.replace(/\/api\/?$/, '')}${url}`;
  }
  return `${API_BASE_URL.replace(/\/api\/?$/, '')}/${url}`;
}

/** Resolve relative upload paths against the API host. */
export function mediaUrl(path?: string | null): string {
  return resolveMediaUrl(path) || '';
}

export interface StoryAuthor {
  id: number;
  full_name: string;
  email?: string | null;
  username?: string | null;
  country?: string | null;
  university?: string | null;
  bio?: string | null;
  profile_picture?: string | null;
  avatar_url?: string | null;
  account_type?: 'individual' | 'organization';
  is_admin?: boolean;
  is_verified?: boolean;
  org_name?: string | null;
  org_category?: string | null;
  website?: string | null;
}

export interface ApiPost {
  id: number;
  user_id: number;
  body?: string | null;
  image_url?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  likes_count?: number | null;
  comments_count?: number | null;
  is_liked?: boolean | null;
  liked_by_me?: boolean | null;
  is_saved?: boolean | null;
  source_lang?: string | null;
  created_at?: string | null;
  author?: StoryAuthor | null;
}

export interface StoryItem {
  id: number;
  user: StoryAuthor;
  country?: string | null;
  text?: string | null;
  media_url?: string | null;
  created_at?: string | null;
}

export interface FollowUser extends StoryAuthor {
  role?: string | null;
  followers_count: number;
  following_count: number;
  posts_count?: number;
  is_following: boolean;
}

export async function fetchFollowers(userId: number, token: string | null): Promise<FollowUser[]> {
  const res = await axios.get(`${API_URL}/api/users/${userId}/followers`, { headers: headers(token) });
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchFollowing(userId: number, token: string | null): Promise<FollowUser[]> {
  const res = await axios.get(`${API_URL}/api/users/${userId}/following`, { headers: headers(token) });
  return Array.isArray(res.data) ? res.data : [];
}

export interface ProjectItem {
  id: number;
  title: string;
  description: string;
  required_skills?: string | null;
  target_countries?: string | null;
  contact_info?: string | null;
  owner_id?: number | null;
  creator_id?: number | null;
  member_count?: number | null;
  members_count?: number | null;
  member_ids?: number[] | null;
  participant_ids?: number[] | null;
  members?: Array<{ id?: number; user_id?: number }> | null;
  participants?: Array<{ id?: number; user_id?: number }> | null;
  created_at?: string | null;
}

export interface ApiComment {
  id: number;
  post_id: number;
  user_id: number;
  parent_id?: number | null;
  text: string;
  body: string;
  source_lang?: string | null;
  created_at?: string | null;
  author?: StoryAuthor | null;
  replies?: ApiComment[];
}

export interface NewsItem {
  id: number;
  title: string;
  content: string;
  category: string;
  cover_image_url?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  is_pinned: boolean;
  author_id: number;
  created_at?: string | null;
  author?: StoryAuthor | null;
}

export interface AdminStats {
  total_users: number;
  individual_users: number;
  organization_users: number;
  verified_organizations: number;
  total_posts: number;
  total_comments: number;
  pending_news: number;
  approved_news: number;
  total_projects: number;
}

export interface AdminUser {
  id: number;
  username?: string | null;
  email: string;
  full_name: string;
  org_name?: string | null;
  account_type: 'individual' | 'organization';
  is_verified: boolean;
  is_admin: boolean;
  country?: string | null;
  created_at?: string | null;
  avatar_url?: string | null;
}

export interface AdminPost {
  id: number;
  user_id: number;
  body?: string | null;
  image_url?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  likes_count: number;
  comments_count: number;
  created_at?: string | null;
  author?: StoryAuthor | null;
}

export interface TranslationResult {
  original_text: string;
  translated_text: string;
  source_lang: string;
  target_lang: string;
  provider: string;
  same_language?: boolean;
}

function cleanTranslationResult(result: TranslationResult, original: string): TranslationResult {
  const sourceLang = normalizeLangCode(result.source_lang);
  const targetLang = normalizeLangCode(result.target_lang);
  const sameLanguage =
    result.same_language === true ||
    (Boolean(sourceLang) && sourceLang === targetLang) ||
    /PLEASE SELECT TWO DISTINCT LANGUAGES/i.test(result.translated_text || '');
  return {
    ...result,
    translated_text: sameLanguage ? original : result.translated_text,
    source_lang: sourceLang,
    target_lang: targetLang,
    same_language: sameLanguage,
  };
}

export async function translateText(
  token: string | null,
  text: string,
  targetLang: string,
  sourceLang?: string
): Promise<TranslationResult> {
  const clean = (text || '').trim();
  const normalizedTarget = normalizeLangCode(targetLang);
  const normalizedSource = normalizeLangCode(sourceLang);
  if (!clean) {
    return {
      original_text: text,
      translated_text: text,
      source_lang: normalizedSource,
      target_lang: normalizedTarget,
      provider: 'original',
      same_language: Boolean(normalizedSource && normalizedSource === normalizedTarget),
    };
  }

  if (normalizedSource && normalizedSource !== 'auto' && normalizedSource === normalizedTarget) {
    return {
      original_text: clean,
      translated_text: clean,
      source_lang: normalizedSource,
      target_lang: normalizedTarget,
      provider: 'original',
      same_language: true,
    };
  }

  let backendError: any;
  try {
    const response = await axios.post(
      `${API_URL}/api/translate`,
      { text: clean, target_lang: normalizedTarget, source_lang: normalizedSource || undefined },
      { headers: headers(token) }
    );
    return cleanTranslationResult(response.data as TranslationResult, clean);
  } catch (err: any) {
    if (err?.response?.status === 404) {
      try {
        const response = await axios.post(
          `${API_URL}/translate`,
          { text: clean, target_lang: normalizedTarget, source_lang: normalizedSource || undefined },
          { headers: headers(token) }
        );
        return cleanTranslationResult(response.data as TranslationResult, clean);
      } catch (fallbackError: any) {
        backendError = fallbackError;
        logApiFailure('translateText fallback', fallbackError);
      }
    } else {
      backendError = err;
      logApiFailure('translateText', err);
    }
  }

  const inferredSource = normalizedSource && normalizedSource !== 'auto'
    ? normalizedSource
    : (/[ґА-яЁёӘәҒғҚқӨөҰұҮүҺһІі]/u.test(clean)
      ? (/ҚқҒғӨөҰұҮүҺһІі/u.test(clean) ? 'kk' : 'ky')
      : (/[ıİəƏşŞçÇğĞöÖüÜ]/u.test(clean) ? 'az' : 'en'));
  const myMemorySources = normalizedSource && normalizedSource !== 'auto'
    ? [normalizedSource]
    : ['Autodetect', inferredSource, 'en', 'tr', 'az'];
  for (const myMemorySource of [...new Set(myMemorySources)]) {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=${encodeURIComponent(myMemorySource)}|${encodeURIComponent(normalizedTarget)}`;
      const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      if (response.ok) {
        const data = await response.json();
        const translated = typeof data?.responseData?.translatedText === 'string'
          ? data.responseData.translatedText.trim()
          : '';
        if (
          translated &&
          translated !== clean &&
          !/MYMEMORY WARNING/i.test(translated)
        ) {
          const detectedSource = typeof data?.responseData?.detectedLanguage === 'string'
            ? data.responseData.detectedLanguage.toLowerCase()
            : myMemorySource === 'Autodetect' ? 'auto' : myMemorySource;
          return cleanTranslationResult({
            original_text: clean,
            translated_text: translated,
            source_lang: normalizeLangCode(detectedSource),
            target_lang: normalizedTarget,
            provider: 'mymemory-browser',
          }, clean);
        }
      }
    } catch {
      // Try the next public provider/source pair.
    }
  }

  for (const lingvaBase of [
    'https://lingva.ml',
    'https://lingva.lunar.icu',
  ]) {
    try {
      const response = await fetch(
        `${lingvaBase}/api/v1/auto/${encodeURIComponent(normalizedTarget)}/${encodeURIComponent(clean)}`,
        { method: 'GET', headers: { Accept: 'application/json' } }
      );
      if (response.ok) {
        const data = await response.json();
        const translated = typeof data?.translation === 'string'
          ? data.translation.trim()
          : '';
        if (translated && translated !== clean) {
          return cleanTranslationResult({
            original_text: clean,
            translated_text: translated,
            source_lang: inferredSource,
            target_lang: normalizedTarget,
            provider: 'lingva-browser',
          }, clean);
        }
      }
    } catch {
      // Try the next Lingva instance.
    }
  }

  throw friendlyError(backendError, 'Tərcümə alınmadı.');
}

const TRANSLATION_CACHE_VERSION = 'th_translation_v5_';
const LEGACY_TRANSLATION_CACHE_PREFIX = 'th_translation:';
const translationCache = new Map<string, TranslationResult>();
let legacyTranslationCacheCleared = false;

function clearLegacyTranslationCache(): void {
  if (legacyTranslationCacheCleared || typeof localStorage === 'undefined') return;
  legacyTranslationCacheCleared = true;
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (
        key?.startsWith(LEGACY_TRANSLATION_CACHE_PREFIX) ||
        key?.startsWith('th_translation_v4_') ||
        key?.startsWith('th_translation_v2_') ||
        key?.startsWith('th_translation_v3_')
      ) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage can be unavailable in private browsing; the in-memory cache still works.
  }
}

export async function translateCached(
  token: string | null,
  text: string,
  targetLang: string,
  sourceLang?: string,
  cacheScope?: string
): Promise<TranslationResult> {
  clearLegacyTranslationCache();
  const clean = (text || '').trim();
  if (!clean) {
    return {
      original_text: text,
      translated_text: text,
      source_lang: sourceLang || '',
      target_lang: targetLang,
      provider: 'original',
    };
  }
  const cacheKey = `${cacheScope || 'text'}:${targetLang}:${sourceLang || 'auto'}:${clean}`;
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;
  const storageKey = `${TRANSLATION_CACHE_VERSION}${cacheKey}`;
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as TranslationResult;
        translationCache.set(cacheKey, parsed);
        return parsed;
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }
  const result = await translateText(token, clean, targetLang, sourceLang);
  if (result?.translated_text?.trim()) {
    translationCache.set(cacheKey, result);
    try {
      localStorage.setItem(storageKey, JSON.stringify(result));
    } catch {
      // Translation remains available in memory when storage is unavailable.
    }
  }
  return result;
}

export function translationChanged(result: TranslationResult, original: string): boolean {
  const translated = (result?.translated_text || '').trim();
  const sourceLang = normalizeLangCode(result?.source_lang);
  const targetLang = normalizeLangCode(result?.target_lang);
  return (
    Boolean(translated) &&
    translated !== (original || '').trim() &&
    result.same_language !== true &&
    !/PLEASE SELECT TWO DISTINCT LANGUAGES/i.test(translated) &&
    sourceLang !== targetLang
  );
}

export interface ProjectDraft {
  title: string;
  description: string;
  required_skills: string;
  target_countries?: string;
  contact_info?: string;
}

function headers(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

axios.defaults.timeout = 15000;

axios.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const hadToken = typeof localStorage !== 'undefined' && localStorage.getItem('token') !== null;
      if (hadToken) {
        localStorage.removeItem('token');
      }
      if (hadToken && typeof window !== 'undefined') {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
    }
    return Promise.reject(error);
  }
);

function logApiFailure(label: string, error: any) {
  if (error?.response?.status === 401) return;
  console.warn(`[api] ${label} failed`, error?.message || error);
}

function friendlyError(error: any, fallback: string): Error {
  const detail = error?.response?.data?.detail;
  const message = typeof detail === 'string' && detail.trim() ? detail : fallback;
  const normalized = new Error(message);
  (normalized as Error & { status?: number }).status = error?.response?.status;
  return normalized;
}

async function safeGet<T>(
  label: string,
  path: string,
  token: string | null,
  fallback: T
): Promise<T> {
  try {
    const res = await axios.get(`${API_URL}${path}`, { headers: headers(token) });
    return res.data as T;
  } catch (error) {
    logApiFailure(label, error);
    return fallback;
  }
}

export async function fetchCurrentUser(token: string | null): Promise<StoryAuthor> {
  try {
    const res = await axios.get(`${API_URL}/api/auth/me`, { headers: headers(token) });
    return res.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      logApiFailure('fetchCurrentUser', err);
      throw friendlyError(err, 'İstifadəçi məlumatı yüklənə bilmədi.');
    }
    try {
      const res = await axios.get(`${API_URL}/me`, { headers: headers(token) });
      return res.data;
    } catch (fallbackErr) {
      logApiFailure('fetchCurrentUser fallback', fallbackErr);
      throw friendlyError(fallbackErr, 'İstifadəçi məlumatı yüklənə bilmədi.');
    }
  }
}

export async function fetchUserStats(token: string | null, userId: number): Promise<FollowUser> {
  try {
    const res = await axios.get(`${API_URL}/api/users/${userId}`, { headers: headers(token) });
    return res.data;
  } catch (err) {
    logApiFailure('fetchUserStats', err);
    throw friendlyError(err, 'İstifadəçi statistikası yüklənə bilmədi.');
  }
}

export async function fetchUserByUsername(
  token: string | null,
  username: string
): Promise<FollowUser> {
  const clean = username.trim().replace(/^@/, '');
  try {
    const res = await axios.get(
      `${API_URL}/api/users/by-username/${encodeURIComponent(clean)}`,
      { headers: headers(token) }
    );
    return res.data;
  } catch (err) {
    logApiFailure('fetchUserByUsername', err);
    throw friendlyError(err, 'İstifadəçi tapıla bilmədi.');
  }
}

export async function fetchProjects(token: string | null = null): Promise<ProjectItem[]> {
  try {
    const res = await axios.get(`${API_URL}/api/projects`, { headers: headers(token) });
    return Array.isArray(res.data) ? res.data : [];
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      logApiFailure('fetchProjects', err);
      return [];
    }
    try {
      const res = await axios.get(`${API_URL}/projects`, { headers: headers(token) });
      return Array.isArray(res.data) ? res.data : [];
    } catch (fallbackErr) {
      logApiFailure('fetchProjects fallback', fallbackErr);
      return [];
    }
  }
}

export async function createProject(
  token: string | null,
  draft: ProjectDraft
): Promise<ProjectItem> {
  try {
    const res = await axios.post(`${API_URL}/api/projects`, draft, { headers: headers(token) });
    return res.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      logApiFailure('createProject', err);
      throw friendlyError(err, 'Layihə yaradıla bilmədi.');
    }
    try {
      const res = await axios.post(`${API_URL}/projects`, draft, { headers: headers(token) });
      return res.data;
    } catch (fallbackErr) {
      logApiFailure('createProject fallback', fallbackErr);
      throw friendlyError(fallbackErr, 'Layihə yaradıla bilmədi.');
    }
  }
}

export async function fetchStories(token: string | null): Promise<StoryItem[]> {
  try {
    const res = await axios.get(`${API_URL}/api/stories/feed`, { headers: headers(token) });
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    logApiFailure('fetchStories', err);
    try {
      const res = await axios.get(`${API_URL}/stories/feed`, { headers: headers(token) });
      return Array.isArray(res.data) ? res.data : [];
    } catch (fallbackErr) {
      logApiFailure('fetchStories fallback', fallbackErr);
      return [];
    }
  }
}

export async function publishStory(
  token: string | null,
  text: string,
  country?: string,
  mediaUrlValue?: string | null
): Promise<StoryItem> {
  const payload = {
    text,
    country: country ?? null,
    media_url: mediaUrlValue ?? null,
  };
  try {
    const res = await axios.post(`${API_URL}/api/stories`, payload, { headers: headers(token) });
    return res.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      logApiFailure('publishStory', err);
      throw friendlyError(err, 'Story paylaşıla bilmədi.');
    }
    try {
      const res = await axios.post(`${API_URL}/stories`, payload, { headers: headers(token) });
      return res.data;
    } catch (fallbackErr) {
      logApiFailure('publishStory fallback', fallbackErr);
      throw friendlyError(fallbackErr, 'Story paylaşıla bilmədi.');
    }
  }
}

export async function fetchPosts(token: string | null): Promise<ApiPost[]> {
  const posts = await safeGet<ApiPost[]>('fetchPosts', '/api/posts', token, []);
  return Array.isArray(posts) ? posts : [];
}

export async function fetchUserPosts(userId: number, token: string | null = null): Promise<ApiPost[]> {
  const posts = await safeGet<ApiPost[]>(
    'fetchUserPosts',
    `/api/users/${userId}/posts`,
    token,
    []
  );
  return Array.isArray(posts) ? posts : [];
}

export async function fetchSavedPosts(token: string | null): Promise<ApiPost[]> {
  const res = await axios.get(`${API_URL}/api/users/me/saved-posts`, { headers: headers(token) });
  return Array.isArray(res.data) ? res.data : [];
}

export async function toggleSavePost(
  token: string | null,
  postId: number | string
): Promise<{ is_saved: boolean }> {
  const res = await axios.post(`${API_URL}/api/posts/${postId}/save`, {}, { headers: headers(token) });
  return { is_saved: Boolean(res.data?.is_saved) };
}

export async function likePost(token: string | null, postId: number | string) {
  try {
    const res = await axios.post(`${API_URL}/api/posts/${postId}/like`, {}, { headers: headers(token) });
    return res.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      logApiFailure('likePost', err);
      throw friendlyError(err, 'Bəyənmə əməliyyatı alınmadı.');
    }
    try {
      const res = await axios.post(`${API_URL}/posts/${postId}/like`, {}, { headers: headers(token) });
      return res.data;
    } catch (fallbackErr) {
      logApiFailure('likePost fallback', fallbackErr);
      throw friendlyError(fallbackErr, 'Bəyənmə əməliyyatı alınmadı.');
    }
  }
}

export async function commentPost(token: string | null, postId: number | string, text: string, parentId?: number | null) {
  try {
    const res = await axios.post(`${API_URL}/api/posts/${postId}/comments`, { text, parent_id: parentId ?? null }, { headers: headers(token) });
    return res.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      logApiFailure('commentPost', err);
      throw friendlyError(err, 'Şərh göndərilə bilmədi.');
    }
    try {
      const res = await axios.post(`${API_URL}/posts/${postId}/comment`, { text }, { headers: headers(token) });
      return res.data;
    } catch (fallbackErr) {
      logApiFailure('commentPost fallback', fallbackErr);
      throw friendlyError(fallbackErr, 'Şərh göndərilə bilmədi.');
    }
  }
}

export async function fetchPostComments(token: string | null, postId: number | string): Promise<ApiComment[]> {
  const res = await axios.get(`${API_URL}/api/posts/${postId}/comments`, { headers: headers(token) });
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchPostLikes(token: string | null, postId: number | string): Promise<StoryAuthor[]> {
  const res = await axios.get(`${API_URL}/api/posts/${postId}/likes`, { headers: headers(token) });
  return Array.isArray(res.data) ? res.data : [];
}

export async function deletePost(token: string | null, postId: number | string): Promise<void> {
  await axios.delete(`${API_URL}/api/posts/${postId}`, { headers: headers(token) });
}

export async function deleteComment(token: string | null, commentId: number): Promise<void> {
  await axios.delete(`${API_URL}/api/comments/${commentId}`, { headers: headers(token) });
}

export async function fetchNews(token: string | null): Promise<NewsItem[]> {
  const res = await axios.get(`${API_URL}/api/news`, { headers: headers(token) });
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchMyNews(token: string | null): Promise<NewsItem[]> {
  const res = await axios.get(`${API_URL}/api/news/my-submissions`, { headers: headers(token) });
  return Array.isArray(res.data) ? res.data : [];
}

export async function submitNews(token: string | null, payload: {
  title: string;
  content: string;
  category: string;
  cover_image_url?: string | null;
}): Promise<NewsItem> {
  const res = await axios.post(`${API_URL}/api/news`, payload, { headers: headers(token) });
  return res.data;
}

export async function fetchAdminStats(token: string | null): Promise<AdminStats> {
  const res = await axios.get(`${API_URL}/api/admin/stats`, { headers: headers(token) });
  return res.data;
}

export async function fetchAdminNews(token: string | null, statusFilter: 'pending' | 'all' = 'all'): Promise<NewsItem[]> {
  const res = await axios.get(`${API_URL}/api/admin/news/pending`, {
    params: { status: statusFilter },
    headers: headers(token),
  });
  return Array.isArray(res.data) ? res.data : [];
}

export async function updateAdminNews(token: string | null, newsId: number, payload: {
  status?: 'approved' | 'rejected';
  is_pinned?: boolean;
}): Promise<any> {
  const res = await axios.patch(`${API_URL}/api/admin/news/${newsId}`, payload, { headers: headers(token) });
  return res.data;
}

export async function fetchAdminUsers(token: string | null, accountType = '', search = ''): Promise<AdminUser[]> {
  const res = await axios.get(`${API_URL}/api/admin/users`, {
    params: { account_type: accountType || undefined, search: search || undefined },
    headers: headers(token),
  });
  return Array.isArray(res.data) ? res.data : [];
}

export async function toggleAdminUserVerification(token: string | null, userId: number, isVerified: boolean): Promise<any> {
  const res = await axios.patch(`${API_URL}/api/admin/users/${userId}/verify`, { is_verified: isVerified }, { headers: headers(token) });
  return res.data;
}

export async function fetchAdminPosts(token: string | null): Promise<AdminPost[]> {
  const res = await axios.get(`${API_URL}/api/admin/posts`, { headers: headers(token) });
  return Array.isArray(res.data) ? res.data : [];
}

export async function deleteAdminPost(token: string | null, postId: number): Promise<void> {
  await axios.delete(`${API_URL}/api/posts/${postId}`, { headers: headers(token) });
}

export async function deleteAdminNews(token: string | null, newsId: number): Promise<void> {
  await axios.delete(`${API_URL}/api/news/${newsId}`, { headers: headers(token) });
}

export async function fetchSuggestions(token: string | null, q?: string): Promise<FollowUser[]> {
  const term = q?.trim();
  const apiPath = term
    ? `/api/users/search?q=${encodeURIComponent(term)}`
    : '/api/users';
  const users = await safeGet<FollowUser[]>('fetchSuggestions', apiPath, token, []);
  if (Array.isArray(users) && users.length > 0) return users;
  const fallbackPath = term
    ? `/users/search?q=${encodeURIComponent(term)}`
    : '/users';
  const fallbackUsers = await safeGet<FollowUser[]>(
    'fetchSuggestions fallback',
    fallbackPath,
    token,
    []
  );
  return Array.isArray(fallbackUsers) ? fallbackUsers : [];
}

export async function followUser(token: string | null, userId: number) {
  try {
    const res = await axios.post(`${API_URL}/api/users/${userId}/follow`, {}, { headers: headers(token) });
    return res.data;
  } catch (err) {
    logApiFailure('followUser', err);
    throw friendlyError(err, 'İstifadəçini izləmək alınmadı.');
  }
}

export async function unfollowUser(token: string | null, userId: number) {
  try {
    const res = await axios.delete(`${API_URL}/api/users/${userId}/follow`, { headers: headers(token) });
    return res.data;
  } catch (err) {
    logApiFailure('unfollowUser', err);
    throw friendlyError(err, 'İzləmədən çıxmaq alınmadı.');
  }
}

export async function uploadAvatar(token: string | null, formData: FormData) {
  try {
    const res = await axios.post(`${API_URL}/api/users/upload-avatar`, formData, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      logApiFailure('uploadAvatar', err);
      throw friendlyError(err, 'Profil şəkli yüklənə bilmədi.');
    }
    try {
      const res = await axios.post(`${API_URL}/users/upload-avatar`, formData, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          'Content-Type': 'multipart/form-data',
        },
      });
      return res.data;
    } catch (fallbackErr) {
      logApiFailure('uploadAvatar fallback', fallbackErr);
      throw friendlyError(fallbackErr, 'Profil şəkli yüklənə bilmədi.');
    }
  }
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}g`;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  actor_id?: number | null;
  actor?: StoryAuthor | null;
  type: 'like' | 'comment' | 'follow' | 'project_join' | 'project_accept' | 'message' | string;
  entity_type?: string | null;
  entity_id?: number | null;
  content?: string | null;
  actor_name?: string | null;
  actor_avatar?: string | null;
  post_id?: number | null;
  message?: string | null;
  is_read: boolean | number;
  created_at?: string | null;
}

export interface NotificationsResponse {
  unread_count: number;
  notifications: NotificationItem[];
}

export async function fetchNotifications(
  token: string | null,
  unreadOnly: boolean = false
): Promise<NotificationsResponse> {
  const url = `${API_URL}/api/notifications${unreadOnly ? '?unread_only=true' : ''}`;
  try {
    const res = await axios.get(url, { headers: headers(token) });
    if (Array.isArray(res.data)) {
      return {
        unread_count: res.data.filter((n: any) => !n.is_read).length,
        notifications: res.data,
      };
    }
    return {
      unread_count: Number(res.data?.unread_count ?? 0),
      notifications: Array.isArray(res.data?.notifications) ? res.data.notifications : [],
    };
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      logApiFailure('fetchNotifications', err);
      return { unread_count: 0, notifications: [] };
    }
    try {
      const fallbackUrl = `${API_URL}/notifications${unreadOnly ? '?unread_only=true' : ''}`;
      const res = await axios.get(fallbackUrl, { headers: headers(token) });
      if (Array.isArray(res.data)) {
        return {
          unread_count: res.data.filter((n: any) => !n.is_read).length,
          notifications: res.data,
        };
      }
      return {
        unread_count: Number(res.data?.unread_count ?? 0),
        notifications: Array.isArray(res.data?.notifications) ? res.data.notifications : [],
      };
    } catch (fallbackErr) {
      logApiFailure('fetchNotifications fallback', fallbackErr);
      return { unread_count: 0, notifications: [] };
    }
  }
}

export async function markNotificationAsRead(
  token: string | null,
  id?: number
): Promise<{ unread_count: number }> {
  const payload = id !== undefined ? { id } : { mark_all: true };
  try {
    const res = await axios.post(`${API_URL}/api/notifications/read`, payload, { headers: headers(token) });
    return { unread_count: Number(res.data?.unread_count ?? 0) };
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      logApiFailure('markNotificationAsRead', err);
      return { unread_count: 0 };
    }
    try {
      const res = await axios.post(`${API_URL}/notifications/read`, payload, { headers: headers(token) });
      return { unread_count: Number(res.data?.unread_count ?? 0) };
    } catch {
      return { unread_count: 0 };
    }
  }
}

export async function markAllNotificationsAsRead(
  token: string | null
): Promise<{ unread_count: number }> {
  try {
    const res = await axios.post(`${API_URL}/api/notifications/mark-all-read`, {}, { headers: headers(token) });
    return { unread_count: Number(res.data?.unread_count ?? 0) };
  } catch {
    return markNotificationAsRead(token, undefined);
  }
}

export async function markNotificationReadById(
  token: string | null,
  id: number
): Promise<{ unread_count: number }> {
  const res = await axios.patch(`${API_URL}/api/notifications/${id}/read`, {}, { headers: headers(token) });
  return { unread_count: Number(res.data?.unread_count ?? 0) };
}

export async function joinProject(
  token: string | null,
  projectId: number
): Promise<{ status: string; message: string; joined: boolean }> {
  try {
    const res = await axios.post(`${API_URL}/api/projects/${projectId}/join`, {}, { headers: headers(token) });
    return res.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      logApiFailure('joinProject', err);
      throw friendlyError(err, 'Layihəyə qoşulma xətası.');
    }
    try {
      const res = await axios.post(`${API_URL}/projects/${projectId}/join`, {}, { headers: headers(token) });
      return res.data;
    } catch (fallbackErr) {
      logApiFailure('joinProject fallback', fallbackErr);
      throw friendlyError(fallbackErr, 'Layihəyə qoşulma xətası.');
    }
  }
}

export async function acceptProjectMember(
  token: string | null,
  projectId: number,
  applicantId: number
): Promise<{ status: string; message: string }> {
  try {
    const res = await axios.post(`${API_URL}/api/projects/${projectId}/accept/${applicantId}`, {}, { headers: headers(token) });
    return res.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      logApiFailure('acceptProjectMember', err);
      throw friendlyError(err, 'Qəbul etmə əməliyyatı alınmadı.');
    }
    const res = await axios.post(`${API_URL}/projects/${projectId}/accept/${applicantId}`, {}, { headers: headers(token) });
    return res.data;
  }
}

export function getWebSocketBaseUrl(): string {
  const apiBase = new URL(API_URL, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000');
  const wsProtocol = apiBase.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = apiBase.pathname.replace(/\/+$/, '').replace(/\/(?:api\/)?ws(?:\/chat)?$/i, '');
  return `${wsProtocol}//${apiBase.host}${basePath}`;
}

export function createNotificationWebSocket(
  token: string | null,
  userId: number | null | undefined,
  onNotification: (notif: NotificationItem) => void,
  onStatusChange?: (status: 'connected' | 'disconnected' | 'connecting') => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  let disposed = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let attempt = 0;
  const delays = [1500, 3000, 6000, 12000];

  const clearPing = () => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = undefined;
    }
  };

  const connect = () => {
    if (disposed) return;
    onStatusChange?.('connecting');

    const wsBase = getWebSocketBaseUrl();
    const endpoint = userId ? `${wsBase}/ws/notifications/${userId}` : `${wsBase}/ws/notifications`;
    const socketUrl = new URL(endpoint);
    if (token) socketUrl.searchParams.set('token', token);

    try {
      socket = new WebSocket(socketUrl.toString());
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      if (disposed) {
        socket?.close();
        return;
      }
      attempt = 0;
      onStatusChange?.('connected');
      clearPing();
      pingTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 15000);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === 'ping' && socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        if (data?.type === 'notification' && data.notification) {
          onNotification(data.notification);
        }
      } catch {
        // ignore non-json
      }
    };

    socket.onclose = () => {
      clearPing();
      if (!disposed) {
        onStatusChange?.('disconnected');
        scheduleReconnect();
      }
    };

    socket.onerror = () => {
      socket?.close();
    };
  };

  const scheduleReconnect = () => {
    if (disposed) return;
    const delay = delays[Math.min(attempt, delays.length - 1)];
    attempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  };

  connect();

  return () => {
    disposed = true;
    clearPing();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    }
  };
}