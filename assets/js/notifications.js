import { supabase } from './supabase.js';
import { escapeHtml, formatDate, icon, toast, safeUrl } from './ui.js';

const LAST_DESKTOP_KEY = 'rth.notif.lastDesktopAt';
const POLL_MS = 60000;

let profile = null;
let items = [];
let readIds = new Set();
let panel = null;
let bell = null;
let dot = null;
let pollTimer = null;
let initialized = false;

function kindIcon(kind) {
  if (kind === 'success') return 'check';
  if (kind === 'warning') return 'clock';
  if (kind === 'sale') return 'percent';
  return 'spark';
}

function unreadCount() {
  return items.filter((item) => !readIds.has(item.id)).length;
}

function updateDot() {
  if (!dot) return;
  const count = unreadCount();
  dot.hidden = count === 0;
  dot.classList.toggle('is-pulse', count > 0);
  if (bell) {
    bell.classList.toggle('has-unread', count > 0);
    bell.setAttribute('aria-label', count > 0 ? `Benachrichtigungen, ${count} ungelesen` : 'Benachrichtigungen');
  }
}

function renderPanel() {
  if (!panel) return;
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  const canAskDesktop = profile?.notify_desktop && permission === 'default';
  const itemsHtml = items.length
    ? items.map((item) => {
      const unread = !readIds.has(item.id);
      const href = item.link ? safeUrl(item.link, '#') : '#';
      return `
        <a class="notif-item${unread ? ' is-unread' : ''}" href="${escapeHtml(href)}" data-notif-id="${escapeHtml(item.id)}" data-notif-link="${item.link ? '1' : '0'}">
          <span class="notif-kind notif-kind-${escapeHtml(item.kind)}">${icon(kindIcon(item.kind))}</span>
          <span class="notif-copy">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.body)}</span>
            <small>${escapeHtml(formatDate(item.created_at, true))}${item.user_id ? ' · Persönlich' : ''}</small>
          </span>
          ${unread ? '<span class="notif-unread-dot"></span>' : ''}
        </a>`;
    }).join('')
    : `<div class="notif-empty">${icon('bell')}<p>Aktuell keine Benachrichtigungen.</p></div>`;

  panel.innerHTML = `
    <div class="notif-head">
      <div>
        <strong>Benachrichtigungen</strong>
        <small>${unreadCount() ? `${unreadCount()} ungelesen` : 'Alles gelesen'}</small>
      </div>
      ${unreadCount() ? '<button type="button" class="text-btn" id="notif-read-all">Alle lesen</button>' : ''}
    </div>
    <div class="notif-list">${itemsHtml}</div>
    <div class="notif-foot">
      ${canAskDesktop ? '<button type="button" class="text-btn" id="notif-ask-desktop">Desktop-Meldungen aktivieren</button>' : ''}
      <a class="text-btn" href="account.html#notifications">Einstellungen</a>
    </div>`;

  panel.querySelector('#notif-read-all')?.addEventListener('click', async (event) => {
    event.preventDefault();
    await markAllRead();
  });
  panel.querySelector('#notif-ask-desktop')?.addEventListener('click', async (event) => {
    event.preventDefault();
    await requestDesktopPermission();
  });
  panel.querySelectorAll('[data-notif-id]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.dataset.notifId;
      if (link.dataset.notifLink !== '1') event.preventDefault();
      markRead(id);
    });
  });
}

async function markRead(id) {
  if (!profile || readIds.has(id)) return;
  readIds.add(id);
  updateDot();
  renderPanel();
  await supabase.from('notification_reads').upsert({
    notification_id: id,
    user_id: profile.id
  }, { onConflict: 'notification_id,user_id' });
}

async function markAllRead() {
  if (!profile) return;
  const unread = items.filter((item) => !readIds.has(item.id));
  if (!unread.length) return;
  unread.forEach((item) => readIds.add(item.id));
  updateDot();
  renderPanel();
  const rows = unread.map((item) => ({ notification_id: item.id, user_id: profile.id }));
  await supabase.from('notification_reads').upsert(rows, { onConflict: 'notification_id,user_id' });
  toast('Alle Benachrichtigungen als gelesen markiert.', 'success');
}

async function requestDesktopPermission() {
  if (!('Notification' in window)) {
    toast('Dieser Browser unterstützt keine Desktop-Benachrichtigungen.', 'warning');
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    toast('Desktop-Benachrichtigungen sind aktiviert.', 'success');
  } else {
    toast('Desktop-Benachrichtigungen wurden nicht erlaubt.', 'warning');
  }
  renderPanel();
}

function showDesktopNotifications(newItems) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!profile?.notify_desktop) return;
  newItems.forEach((item) => {
    const notification = new Notification(`Ro-Tech Hub · ${item.title}`, {
      body: item.body || '',
      icon: new URL('assets/img/favicon.svg', window.location.href).href,
      tag: `rth-${item.id}`
    });
    notification.onclick = () => {
      window.focus();
      markRead(item.id);
      if (item.link) window.location.href = safeUrl(item.link, '#');
      notification.close();
    };
  });
}

async function loadNotifications({ desktop = false } = {}) {
  if (!profile) return;
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('is_active', true)
    .or(`user_id.is.null,user_id.eq.${profile.id}`)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.warn('Benachrichtigungen konnten nicht geladen werden:', error.message);
    return;
  }

  const previousIds = new Set(items.map((item) => item.id));
  items = data || [];

  const { data: reads } = await supabase
    .from('notification_reads')
    .select('notification_id')
    .eq('user_id', profile.id);
  readIds = new Set((reads || []).map((row) => row.notification_id));

  updateDot();
  if (panel && !panel.hidden) renderPanel();

  const lastDesktop = Number(localStorage.getItem(LAST_DESKTOP_KEY) || 0);
  if (!lastDesktop) {
    localStorage.setItem(LAST_DESKTOP_KEY, String(Date.now()));
    return;
  }
  if (desktop) {
    const cutoff = lastDesktop;
    const fresh = items.filter((item) => (
      !readIds.has(item.id)
      && new Date(item.created_at).getTime() > cutoff
      && !previousIds.has(item.id)
    ));
    if (fresh.length) showDesktopNotifications(fresh);
    localStorage.setItem(LAST_DESKTOP_KEY, String(Date.now()));
  }
}

function togglePanel(open) {
  if (!panel || !bell) return;
  const shouldOpen = typeof open === 'boolean' ? open : panel.hidden;
  panel.hidden = !shouldOpen;
  bell.setAttribute('aria-expanded', String(shouldOpen));
  if (shouldOpen) {
    renderPanel();
    loadNotifications();
  }
}

export async function initNotifications(currentProfile) {
  profile = currentProfile;
  if (!profile || initialized) return;
  bell = document.getElementById('notif-bell');
  dot = document.getElementById('notif-dot');
  panel = document.getElementById('notif-panel');
  if (!bell || !panel) return;

  if (profile.notify_inapp === false) bell.hidden = true;

  initialized = true;

  bell.addEventListener('click', (event) => {
    event.stopPropagation();
    togglePanel();
  });

  document.addEventListener('click', (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !bell.contains(event.target)) {
      togglePanel(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') togglePanel(false);
  });

  await loadNotifications();
  updateDot();

  pollTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') loadNotifications({ desktop: true });
  }, POLL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadNotifications({ desktop: true });
  });
}

export function stopNotifications() {
  if (pollTimer) window.clearInterval(pollTimer);
  initialized = false;
}
