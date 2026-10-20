import { initApp } from './app.js';
import {
  supabase, signOutAndClear
} from './supabase.js';
import {
  escapeHtml, formatDate, formatPrice, initReveal, emptyState, statusBadge, rankBadge,
  toast, setLoading, icon, safeUrl
} from './ui.js';

const { session, profile } = await initApp('account');

const gate = document.getElementById('account-gate');
const dashboard = document.getElementById('account-dashboard');
const message = document.getElementById('account-message');

function showAccountMessage(text, type = 'success') {
  if (!message) {
    toast(text, type);
    return;
  }
  message.hidden = false;
  message.className = `form-alert form-alert-${type}`;
  message.innerHTML = `<span>${icon(type === 'success' ? 'check' : 'clock')}</span><span>${escapeHtml(text)}</span>`;
}

if (!session || !profile) {
  gate?.removeAttribute('hidden');
  dashboard?.setAttribute('hidden', '');
} else {
  gate?.setAttribute('hidden', '');
  dashboard?.removeAttribute('hidden');
  await renderAccount();
}

async function renderAccount() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  const identities = user?.identities || [];

  const [purchaseResult, reviewsCount, suggestionsCount] = await Promise.all([
    supabase.from('purchases')
      .select('*, products(name, image_url, category)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false }),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
    supabase.from('product_suggestions').select('id', { count: 'exact', head: true }).eq('user_id', profile.id)
  ]);

  const avatar = document.getElementById('profile-avatar');
  const username = document.getElementById('profile-username');
  const email = document.getElementById('profile-email');
  const rank = document.getElementById('profile-rank');
  const since = document.getElementById('profile-since');
  if (avatar) avatar.textContent = (profile.username || '?').slice(0, 1).toUpperCase();
  if (username) username.textContent = profile.username;
  if (email) email.textContent = user?.email || profile.email || '—';
  if (rank) rank.innerHTML = rankBadge(profile.rank);
  if (since) since.textContent = formatDate(profile.created_at);

  const usernameInput = document.getElementById('account-username');
  if (usernameInput) usernameInput.value = profile.username;

  const mfaToggle = document.getElementById('mfa-toggle');
  if (mfaToggle) mfaToggle.checked = !!profile.mfa_email_enabled;
  const notifyInapp = document.getElementById('notify-inapp');
  if (notifyInapp) notifyInapp.checked = profile.notify_inapp !== false;
  const notifyDesktop = document.getElementById('notify-desktop');
  if (notifyDesktop) notifyDesktop.checked = profile.notify_desktop !== false;

  const providerHost = document.getElementById('linked-providers');
  if (providerHost) {
    const providerLabels = {
      email: ['E-Mail', 'mail'],
      google: ['Google', 'google'],
      discord: ['Discord', 'discord']
    };
    providerHost.innerHTML = identities.length
      ? identities.map((identity) => {
        const [label, iconName] = providerLabels[identity.provider] || [identity.provider, 'user'];
        return `<span class="provider-chip">${icon(iconName)} ${escapeHtml(label)}</span>`;
      }).join('')
      : '<span class="muted-text">Keine verknüpften Anmeldewege gefunden.</span>';
  }

  const discordStatus = document.getElementById('discord-status');
  if (discordStatus) {
    discordStatus.innerHTML = profile.discord_id
      ? `<span class="status-ok">${icon('check')} Verbunden</span><small>ID: ${escapeHtml(profile.discord_id)}</small>`
      : '<span class="status-warn">Wird synchronisiert</span><small>Die Discord-ID wird beim nächsten Login automatisch übernommen.</small>';
  }

  const stats = document.getElementById('account-stats');
  if (stats) {
    stats.innerHTML = `
      <div class="mini-stat"><strong>${purchaseResult.data?.length || 0}</strong><span>Käufe</span></div>
      <div class="mini-stat"><strong>${reviewsCount.count || 0}</strong><span>Bewertungen</span></div>
      <div class="mini-stat"><strong>${suggestionsCount.count || 0}</strong><span>Vorschläge</span></div>`;
  }

  const history = document.getElementById('purchase-history');
  if (history) {
    const purchases = purchaseResult.data || [];
    if (!purchases.length) {
      history.innerHTML = emptyState('Noch keine Käufe', 'Sobald du ein Produkt kaufst, erscheint die Bestellung hier.');
    } else {
      history.innerHTML = purchases.map((purchase) => {
        const productName = purchase.products?.name || purchase.product_name;
        const image = safeUrl(purchase.products?.image_url, 'assets/img/placeholder.svg');
        const roleState = purchase.role_granted_at
          ? '<span class="status-ok">Rolle vergeben</span>'
          : purchase.status === 'confirmed'
            ? '<span class="status-warn">Rolle wird vergeben</span>'
            : '<span class="muted-text">Nach Bestätigung</span>';
        return `
          <article class="purchase-card reveal">
            <img src="${escapeHtml(image)}" alt="" data-fallback="assets/img/placeholder.svg">
            <div class="purchase-main">
              <div class="purchase-head">
                <div>
                  <strong>${escapeHtml(productName)}</strong>
                  <small>${escapeHtml(formatDate(purchase.created_at, true))} · ${escapeHtml(purchase.purchase_type === 'subscription' ? 'Abo' : purchase.purchase_type === 'free' ? 'Kostenlos' : 'Gamepass')}</small>
                </div>
                ${statusBadge(purchase.status)}
              </div>
              <div class="purchase-meta">
                <span>${escapeHtml(formatPrice(purchase.amount, purchase.currency))}</span>
                ${purchase.roblox_username ? `<span>Roblox: ${escapeHtml(purchase.roblox_username)}</span>` : ''}
                ${roleState}
              </div>
              ${purchase.admin_note ? `<p class="purchase-note">${escapeHtml(purchase.admin_note)}</p>` : ''}
            </div>
          </article>`;
      }).join('');
    }
  }

  document.getElementById('username-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = form.username.value.trim();
    const submit = form.querySelector('button[type="submit"]');
    if (!/^[\p{L}\p{N}._ -]{3,32}$/u.test(value)) {
      showAccountMessage('Der Nutzername muss 3–32 Zeichen lang sein (Buchstaben, Zahlen, Leerzeichen, . _ -).', 'error');
      return;
    }
    setLoading(submit, true, 'Speichern …');
    const { error } = await supabase.from('profiles').update({ username: value }).eq('id', profile.id);
    setLoading(submit, false);
    if (error) {
      showAccountMessage(error.code === '23505' ? 'Dieser Nutzername ist bereits vergeben.' : error.message, 'error');
      return;
    }
    profile.username = value;
    if (username) username.textContent = value;
    const headerName = document.querySelector('.account-meta strong');
    if (headerName) headerName.textContent = value;
    showAccountMessage('Nutzername aktualisiert.', 'success');
  });

  mfaToggle?.addEventListener('change', async () => {
    const { error } = await supabase.from('profiles')
      .update({ mfa_email_enabled: mfaToggle.checked })
      .eq('id', profile.id);
    if (error) {
      mfaToggle.checked = !mfaToggle.checked;
      showAccountMessage(error.message, 'error');
      return;
    }
    profile.mfa_email_enabled = mfaToggle.checked;
    showAccountMessage(mfaToggle.checked
      ? 'E-Mail-MFA aktiviert. Beim nächsten Login wird zusätzlich ein Code per E-Mail benötigt.'
      : 'E-Mail-MFA deaktiviert.', 'success');
  });

  notifyInapp?.addEventListener('change', async () => {
    const { error } = await supabase.from('profiles')
      .update({ notify_inapp: notifyInapp.checked })
      .eq('id', profile.id);
    if (error) {
      notifyInapp.checked = !notifyInapp.checked;
      showAccountMessage(error.message, 'error');
      return;
    }
    profile.notify_inapp = notifyInapp.checked;
    const bell = document.getElementById('notif-bell');
    if (bell) bell.hidden = !notifyInapp.checked;
    toast(notifyInapp.checked ? 'Benachrichtigungsbox aktiviert.' : 'Benachrichtigungsbox deaktiviert.', 'success');
  });

  notifyDesktop?.addEventListener('change', async () => {
    if (notifyDesktop.checked && 'Notification' in window && Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        notifyDesktop.checked = false;
        toast('Desktop-Benachrichtigungen wurden nicht erlaubt.', 'warning');
      }
    }
    const { error } = await supabase.from('profiles')
      .update({ notify_desktop: notifyDesktop.checked })
      .eq('id', profile.id);
    if (error) {
      notifyDesktop.checked = !notifyDesktop.checked;
      showAccountMessage(error.message, 'error');
      return;
    }
    profile.notify_desktop = notifyDesktop.checked;
    toast(notifyDesktop.checked ? 'Desktop-Benachrichtigungen aktiviert.' : 'Desktop-Benachrichtigungen deaktiviert.', 'success');
  });

  document.getElementById('logout-button')?.addEventListener('click', async () => {
    await signOutAndClear();
    window.location.replace('index.html');
  });

  const mfaState = document.getElementById('mfa-state');
  if (mfaState) mfaState.textContent = profile.mfa_email_enabled ? 'Aktiv' : 'Inaktiv';
  const emailVerifiedState = document.getElementById('email-verified-state');
  if (emailVerifiedState) emailVerifiedState.textContent = profile.email_verified ? 'Bestätigt' : 'Nicht bestätigt';

  initReveal();
}
