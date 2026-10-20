import { getSessionProfile, syncDiscordIdentity, signOutAndClear } from './supabase.js';
import { initLayout, initReveal, toast, escapeHtml, icon } from './ui.js';
import { initNotifications } from './notifications.js';

let contextPromise = null;

function showBlockedOverlay(profile) {
  document.body.classList.add('is-account-blocked');
  const overlay = document.createElement('div');
  overlay.className = 'account-blocked-overlay';
  overlay.innerHTML = `
    <div class="blocked-card">
      <span class="blocked-icon">${icon('lock')}</span>
      <h1>Account gesperrt</h1>
      <p>${escapeHtml(profile.blocked_reason || 'Dein Account wurde von der Verwaltung gesperrt. Bitte wende dich an das Team, wenn du Fragen hast.')}</p>
      <button class="btn btn-primary" type="button" id="blocked-logout">Abmelden</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#blocked-logout')?.addEventListener('click', async () => {
    await signOutAndClear();
    window.location.href = 'index.html';
  });
}

async function boot(active) {
  let session = null;
  let profile = null;
  try {
    const context = await getSessionProfile();
    session = context.session;
    profile = context.profile;
  } catch (error) {
    console.error(error);
    toast('Verbindung zu Supabase fehlgeschlagen. Bitte später erneut versuchen.', 'error');
  }

  if (profile && profile.blocked) showBlockedOverlay(profile);

  initLayout({ active, profile });
  if (profile) {
    initNotifications(profile);
    if (session) {
      syncDiscordIdentity().then((discordId) => {
        if (discordId) profile.discord_id = discordId;
      }).catch(() => {});
    }
  }
  initReveal();

  return { session, profile };
}

export function initApp(active = 'home') {
  if (!contextPromise) contextPromise = boot(active);
  return contextPromise;
}
