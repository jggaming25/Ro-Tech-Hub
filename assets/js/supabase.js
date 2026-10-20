import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from './config.js';

const REMEMBER_KEY = 'rth.remember';
const UNTIL_KEY = 'rth.sessionUntil';

function targetStorage() {
  return localStorage.getItem(REMEMBER_KEY) === '0' ? sessionStorage : localStorage;
}

function isAuthKey(key) {
  return typeof key === 'string' && key.startsWith('sb-') && key.includes('auth');
}

function clearStore(store) {
  const keys = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (isAuthKey(key)) keys.push(key);
  }
  keys.forEach((key) => store.removeItem(key));
}

export function clearAuthStorage(removeRemember = true) {
  clearStore(localStorage);
  clearStore(sessionStorage);
  localStorage.removeItem(UNTIL_KEY);
  if (removeRemember) localStorage.removeItem(REMEMBER_KEY);
}

export function prepareAuthStorage(remember = true) {
  clearAuthStorage(false);
  localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
  if (remember) {
    const until = Date.now() + CONFIG.SESSION_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(UNTIL_KEY, String(until));
  }
}

const authStorage = {
  getItem(key) {
    const until = Number(localStorage.getItem(UNTIL_KEY) || 0);
    if (until && Date.now() > until) {
      clearAuthStorage();
      return null;
    }
    if (localStorage.getItem(REMEMBER_KEY) === '0') {
      return sessionStorage.getItem(key);
    }
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  },
  setItem(key, value) {
    targetStorage().setItem(key, value);
  },
  removeItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
};

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit'
  }
});

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session ?? null;
}

export async function fetchProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('Profil konnte nicht geladen werden:', error.message);
    return null;
  }
  return data;
}

export async function getSessionProfile() {
  const session = await getSession();
  if (!session) return { session: null, profile: null };
  const profile = await fetchProfile(session.user.id);
  return { session, profile };
}

export function isAdmin(profile) {
  return !!profile && (profile.rank === 'admin' || profile.rank === 'master');
}

export function isMaster(profile) {
  return !!profile && profile.rank === 'master';
}

export function rankLabel(rank) {
  return rank === 'master' ? 'Master Admin' : rank === 'admin' ? 'Admin' : 'Nutzer';
}

export async function signOutAndClear() {
  try {
    await supabase.auth.signOut();
  } catch (error) {
    /* Session kann bereits abgelaufen sein. */
  }
  clearAuthStorage();
}

export async function syncDiscordIdentity() {
  try {
    const { data, error } = await supabase.rpc('sync_discord_identity');
    if (error) return null;
    return data;
  } catch (error) {
    return null;
  }
}

export function authRedirectUrl(page = 'login.html', params = '') {
  const base = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}${page}`;
  return params ? `${base}?${params}` : base;
}

export function currentPageFile() {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1] || 'index.html';
}

export function safeNextUrl(next, fallback = 'index.html') {
  if (!next) return fallback;
  try {
    const url = new URL(next, window.location.href);
    if (url.origin !== window.location.origin) return fallback;
    return `${url.pathname.split('/').pop() || 'index.html'}${url.search}${url.hash}`;
  } catch (error) {
    return fallback;
  }
}
