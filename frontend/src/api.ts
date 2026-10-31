import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export interface StoryAuthor {
  id: number;
  full_name: string;
  email?: string | null;
  country?: string | null;
  university?: string | null;
  bio?: string | null;
  profile_picture?: string | null;
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
  owner_id?: number | null;
  created_at?: string | null;
}

export interface ProjectDraft {
  title: string;
  description: string;
  required_skills: string;
}

function headers(token: string | null) {
  return { Authorization: `Bearer ${token}` };
}

export async function fetchCurrentUser(token: string | null): Promise<StoryAuthor> {
  try {
    const res = await axios.get(`${API_URL}/api/auth/me`, { headers: headers(token) });
    return res.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
    const res = await axios.get(`${API_URL}/me`, { headers: headers(token) });
    return res.data;
  }
}

export async function fetchUserStats(token: string | null, userId: number): Promise<FollowUser> {
  const res = await axios.get(`${API_URL}/api/users/${userId}`, { headers: headers(token) });
  return res.data;
}

export async function fetchProjects(token: string | null = null): Promise<ProjectItem[]> {
  try {
    const res = await axios.get(`${API_URL}/api/projects`, { headers: headers(token) });
    return res.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
    const res = await axios.get(`${API_URL}/projects`, { headers: headers(token) });
    return res.data;
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
    if (err?.response?.status !== 404) throw err;
    const res = await axios.post(`${API_URL}/projects`, draft, { headers: headers(token) });
    return res.data;
  }
}

export async function fetchStories(token: string | null): Promise<StoryItem[]> {
  try {
    const res = await axios.get(`${API_URL}/api/stories/feed`, { headers: headers(token) });
    return res.data;
  } catch {
    const res = await axios.get(`${API_URL}/stories/feed`, { headers: headers(token) });
    return res.data;
  }
}

export async function publishStory(
  token: string | null,
  text: string,
  country?: string
): Promise<StoryItem> {
  try {
    const res = await axios.post(
      `${API_URL}/api/stories`,
      { text, country: country ?? null },
      { headers: headers(token) }
    );
    return res.data;
  } catch {
    const res = await axios.post(
      `${API_URL}/stories`,
      { text, country: country ?? null },
      { headers: headers(token) }
    );
    return res.data;
  }
}

export async function fetchSuggestions(token: string | null): Promise<FollowUser[]> {
  const res = await axios.get(`${API_URL}/api/users`, { headers: headers(token) });
  return res.data;
}

export async function followUser(token: string | null, userId: number) {
  const res = await axios.post(`${API_URL}/api/users/${userId}/follow`, {}, { headers: headers(token) });
  return res.data;
}

export async function unfollowUser(token: string | null, userId: number) {
  const res = await axios.delete(`${API_URL}/api/users/${userId}/follow`, { headers: headers(token) });
  return res.data;
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