import axios from 'axios';

export const API_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8000'
).replace(/\/$/, '');

/** Resolve relative upload paths against the API host. */
export function mediaUrl(path?: string | null): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
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
  followers_count: number;
  following_count: number;
  is_following: boolean;
}

export interface ProjectItem {
  id: number;
  title: string;
  description: string;
  required_skills?: string | null;
  target_countries?: string | null;
  contact_info?: string | null;
  owner_id?: number | null;
  created_at?: string | null;
}

export interface TranslationResult {
  original_text: string;
  translated_text: string;
  source_lang: string;
  target_lang: string;
  provider: string;
}

export async function translateText(
  token: string | null,
  text: string,
  targetLang: string,
  sourceLang?: string
): Promise<TranslationResult> {
  try {
    const res = await axios.post(
      `${API_URL}/api/translate`,
      { text, target_lang: targetLang, source_lang: sourceLang },
      { headers: headers(token) }
    );
    return res.data as TranslationResult;
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      logApiFailure('translateText', err);
      throw friendlyError(err, 'Tərcümə alınmadı.');
    }
    const res = await axios.post(
      `${API_URL}/translate`,
      { text, target_lang: targetLang, source_lang: sourceLang },
      { headers: headers(token) }
    );
    return res.data as TranslationResult;
  }
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

function logApiFailure(label: string, error: any) {
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

export async function commentPost(token: string | null, postId: number | string, text: string) {
  try {
    const res = await axios.post(`${API_URL}/api/posts/${postId}/comment`, { text }, { headers: headers(token) });
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