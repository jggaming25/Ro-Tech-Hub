import { initApp } from './app.js';
import { CONFIG } from './config.js';
import { supabase, isMaster, rankLabel } from './supabase.js';
import {
  escapeHtml, formatDate, formatPrice, effectivePrice, initReveal, emptyState,
  statusBadge, rankBadge, stars, toast, openModal, confirmDialog, setLoading, icon,
  safeUrl, loginUrl
} from './ui.js';

const { session, profile: me } = await initApp('admin');

const gate = document.getElementById('admin-gate');
const dashboard = document.getElementById('admin-dashboard');
const panel = document.getElementById('admin-panel');

const state = {
  tab: new URLSearchParams(window.location.search).get('tab') || 'overview',
  reviewFilter: 'all',
  suggestionFilter: 'all',
  purchaseFilter: 'all',
  botLoaded: false,
  botLoading: false,
  botSettings: null,
  botWarnings: [],
  botActions: [],
  botHeartbeat: null
};

const BOT_COMMANDS = [
  ['warn', 'Warnen'], ['warnings', 'Warnungen anzeigen'], ['clearwarnings', 'Warnungen löschen'],
  ['kick', 'Kick'], ['ban', 'Ban'], ['unban', 'Unban'], ['timeout', 'Timeout'], ['untimeout', 'Timeout aufheben'],
  ['purge', 'Nachrichten löschen'], ['slowmode', 'Slowmode'], ['lock', 'Kanal sperren'], ['unlock', 'Kanal entsperren'],
  ['nickname', 'Nickname'], ['role', 'Rolle vergeben/entfernen'], ['userinfo', 'Nutzerinfo'], ['serverinfo', 'Serverinfo'],
  ['say', 'Nachricht senden'], ['help', 'Hilfe'], ['botinfo', 'Bot-Info'], ['ping', 'Ping']
];

let users = [];
let products = [];
let reviews = [];
let suggestions = [];
let purchases = [];
let notifications = [];
let actions = [];
let ratings = new Map();

if (!session || !me) {
  gate?.removeAttribute('hidden');
  gate.innerHTML = gateContent('Anmeldung erforderlich', 'Bitte melde dich mit einem Admin- oder Master-Admin-Account an.', loginUrl('admin.html'), 'Zum Login');
  dashboard?.setAttribute('hidden', '');
} else if (me.rank === 'user') {
  gate?.removeAttribute('hidden');
  gate.innerHTML = gateContent('Kein Zugriff', 'Dieser Bereich ist ausschließlich für Admins und Master Admins sichtbar.', 'index.html', 'Zur Startseite');
  dashboard?.setAttribute('hidden', '');
} else {
  gate?.setAttribute('hidden', '');
  dashboard?.removeAttribute('hidden');
  if (!isMaster(me)) {
    document.querySelectorAll('[data-master-only]').forEach((element) => { element.hidden = true; });
  }
  await loadData();
  renderPanel();
}

function gateContent(title, text, href, label) {
  return `
    <div class="gate-card">
      <span class="gate-icon">${icon('shield')}</span>
      <div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>
      <a class="btn btn-primary" href="${escapeHtml(href)}">${escapeHtml(label)} ${icon('arrow')}</a>
    </div>`;
}

async function loadData() {
  const [usersRes, productsRes, reviewsRes, suggestionsRes, purchasesRes, notificationsRes, actionsRes, ratingsRes] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('products').select('*').order('created_at', { ascending: false }),
    supabase.from('reviews')
      .select('*, product:products(name), author:profiles!reviews_user_id_fkey(username,email)')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('product_suggestions')
      .select('*, author:profiles!product_suggestions_user_id_fkey(username,email)')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('purchases')
      .select('*, product:products(name), buyer:profiles!purchases_user_id_fkey(username,email)')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('admin_actions').select('*').order('created_at', { ascending: false }).limit(300),
    supabase.from('product_ratings').select('*')
  ]);

  users = usersRes.data || [];
  products = productsRes.data || [];
  reviews = reviewsRes.data || [];
  suggestions = suggestionsRes.data || [];
  purchases = purchasesRes.data || [];
  notifications = notificationsRes.data || [];
  actions = actionsRes.data || [];
  ratings = new Map((ratingsRes.data || []).map((rating) => [rating.product_id, rating]));

  const errors = [usersRes.error, productsRes.error, reviewsRes.error, suggestionsRes.error, purchasesRes.error, notificationsRes.error, actionsRes.error]
    .filter(Boolean);
  if (errors.length) {
    console.warn('Verwaltungsdaten teilweise nicht geladen:', errors.map((error) => error.message));
    toast('Einige Verwaltungsdaten konnten nicht geladen werden.', 'warning');
  }
}

async function refresh() {
  await loadData();
  renderPanel();
}

function userById(id) {
  return users.find((user) => user.id === id);
}

function productById(id) {
  return products.find((product) => product.id === id);
}

function userName(user) {
  return user?.username || user?.email || 'Unbekannt';
}

function avatar(user, extra = '') {
  return `<span class="avatar ${extra}">${escapeHtml((userName(user) || '?').slice(0, 1).toUpperCase())}</span>`;
}

function setTab(tab) {
  if (tab === 'bot' && !isMaster(me)) {
    toast('Der Bot-Bereich ist nur für den Master Admin sichtbar.', 'warning');
    tab = 'overview';
  }
  state.tab = tab;
  const url = new URL(window.location.href);
  if (tab === 'overview') url.searchParams.delete('tab');
  else url.searchParams.set('tab', tab);
  window.history.replaceState({}, '', url);
  renderPanel();
}

document.getElementById('admin-tabs')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-admin-tab]');
  if (!button) return;
  setTab(button.dataset.adminTab);
});

function renderPanel() {
  if (!dashboard || dashboard.hidden || !panel) return;
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.adminTab === state.tab);
  });
  if (state.tab === 'users') renderUsers();
  else if (state.tab === 'products') renderProducts();
  else if (state.tab === 'reviews') renderReviews();
  else if (state.tab === 'suggestions') renderSuggestions();
  else if (state.tab === 'purchases') renderPurchases();
  else if (state.tab === 'notifications') renderNotifications();
  else if (state.tab === 'log') renderLog();
  else if (state.tab === 'bot') renderBot();
  else renderOverview();
  initReveal(panel);
}

function statCard(iconName, value, label, tone = '') {
  return `
    <div class="admin-stat ${tone}">
      <span class="admin-stat-icon">${icon(iconName)}</span>
      <div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>
    </div>`;
}

function renderOverview() {
  const pendingReviews = reviews.filter((review) => review.status === 'pending');
  const pendingSuggestions = suggestions.filter((item) => item.status === 'pending');
  const pendingPurchases = purchases.filter((purchase) => purchase.status === 'pending');
  const blocked = users.filter((user) => user.blocked);
  const visibleProducts = products.filter((product) => product.visible);

  panel.innerHTML = `
    <div class="admin-section-head">
      <div>
        <h2>Übersicht</h2>
        <p>Willkommen, ${escapeHtml(me.username)}. Hier siehst du den aktuellen Stand.</p>
      </div>
      <button class="btn btn-ghost btn-sm" type="button" data-action="refresh">${icon('spark')} Aktualisieren</button>
    </div>
    <div class="admin-stats">
      ${statCard('user', users.length, 'Nutzer')}
      ${statCard('box', products.length, 'Produkte')}
      ${statCard('eye', visibleProducts.length, 'Sichtbar')}
      ${statCard('clock', pendingReviews.length, 'Offene Bewertungen', pendingReviews.length ? 'is-warn' : '')}
      ${statCard('spark', pendingSuggestions.length, 'Offene Vorschläge', pendingSuggestions.length ? 'is-warn' : '')}
      ${statCard('tag', pendingPurchases.length, 'Offene Käufe', pendingPurchases.length ? 'is-warn' : '')}
      ${statCard('lock', blocked.length, 'Gesperrt')}
      ${statCard('chart', actions.length, 'Protokoll-Einträge')}
    </div>
    <div class="admin-columns">
      <section class="admin-card">
        <div class="admin-card-head">
          <h3>Zu erledigen</h3>
          <a class="text-btn" href="#" data-goto-tab="reviews">Alle ansehen</a>
        </div>
        <div class="task-list">
          <button type="button" class="task-row" data-goto-tab="reviews">
            <span class="task-icon">${icon('star')}</span>
            <span><strong>${pendingReviews.length} Bewertungen</strong><small>warten auf Freigabe</small></span>
            ${icon('arrow')}
          </button>
          <button type="button" class="task-row" data-goto-tab="suggestions">
            <span class="task-icon">${icon('spark')}</span>
            <span><strong>${pendingSuggestions.length} Vorschläge</strong><small>warten auf Prüfung</small></span>
            ${icon('arrow')}
          </button>
          <button type="button" class="task-row" data-goto-tab="purchases">
            <span class="task-icon">${icon('tag')}</span>
            <span><strong>${pendingPurchases.length} Käufe</strong><small>warten auf Bestätigung</small></span>
            ${icon('arrow')}
          </button>
        </div>
      </section>
      <section class="admin-card">
        <div class="admin-card-head"><h3>Letzte Aktivität</h3><a class="text-btn" href="#" data-goto-tab="log">Protokoll</a></div>
        <div class="activity-list">
          ${actions.slice(0, 6).map((entry) => `
            <div class="activity-row">
              <span class="activity-dot"></span>
              <span><strong>${escapeHtml(entry.action)}</strong><small>${escapeHtml(userName(userById(entry.actor_id)))} · ${escapeHtml(formatDate(entry.created_at, true))}</small></span>
            </div>`).join('') || '<p class="muted-text">Noch keine protokollierten Aktionen.</p>'}
        </div>
      </section>
    </div>
    <section class="admin-card">
      <div class="admin-card-head"><h3>Neueste Bewertungen</h3><a class="text-btn" href="#" data-goto-tab="reviews">Moderieren</a></div>
      <div class="admin-mini-list">
        ${reviews.slice(0, 5).map((review) => `
          <div class="admin-mini-row">
            ${avatar(review.author)}
            <div><strong>${escapeHtml(review.author?.username || 'Nutzer')}</strong><small>${escapeHtml(review.product?.name || 'Produkt')} · ${stars(review.rating)}</small></div>
            ${statusBadge(review.status)}
          </div>`).join('') || '<p class="muted-text">Noch keine Bewertungen.</p>'}
      </div>
    </section>`;
}

function renderUsers() {
  panel.innerHTML = `
    <div class="admin-section-head">
      <div><h2>Nutzer</h2><p>${users.length} Accounts · Details, Käufe, Sperren und Ränge.</p></div>
      <div class="search-field admin-search">
        ${icon('search')}
        <input type="search" id="admin-user-search" placeholder="Nutzer suchen …" autocomplete="off">
      </div>
    </div>
    <div class="admin-card table-card">
      <table class="data-table">
        <thead><tr><th>Nutzer</th><th>Rang</th><th>Status</th><th>Registriert</th><th></th></tr></thead>
        <tbody>
          ${users.map((user) => `
            <tr data-user-row data-search="${escapeHtml(`${user.username} ${user.email}`.toLowerCase())}">
              <td><div class="table-user">${avatar(user)}<span><strong>${escapeHtml(user.username)}</strong><small>${escapeHtml(user.email)}</small></span></div></td>
              <td>${rankBadge(user.rank)}</td>
              <td>${user.blocked ? '<span class="badge badge-danger">Gesperrt</span>' : '<span class="badge badge-success">Aktiv</span>'}</td>
              <td>${escapeHtml(formatDate(user.created_at))}</td>
              <td class="table-actions"><button class="btn btn-ghost btn-xs" type="button" data-user-view="${escapeHtml(user.id)}">Details</button></td>
            </tr>`).join('') || `<tr><td colspan="5">${emptyState('Keine Nutzer', 'Es wurden noch keine Accounts gefunden.')}</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function renderProducts() {
  panel.innerHTML = `
    <div class="admin-section-head">
      <div><h2>Produkte</h2><p>${products.length} Produkte · ${isMaster(me) ? 'Volle Verwaltung als Master Admin.' : 'Admins können Produkte nur ausblenden.'}</p></div>
      ${isMaster(me) ? `<button class="btn btn-primary" type="button" data-action="product-create">${icon('box')} Neues Produkt</button>` : ''}
    </div>
    <div class="admin-card table-card">
      <table class="data-table">
        <thead><tr><th>Produkt</th><th>Preis</th><th>Verkauf</th><th>Sichtbarkeit</th><th></th></tr></thead>
        <tbody>
          ${products.map((product) => {
            const rating = ratings.get(product.id);
            return `
              <tr>
                <td>
                  <div class="table-product">
                    <img src="${escapeHtml(safeUrl(product.image_url, 'assets/img/placeholder.svg'))}" alt="" data-fallback="assets/img/placeholder.svg">
                    <span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category)} · ${rating ? `${Number(rating.avg_rating).toFixed(1)} ★ (${rating.review_count})` : 'Keine Bewertungen'}</small></span>
                  </div>
                </td>
                <td>${escapeHtml(formatPrice(product.on_sale ? effectivePrice(product) : product.price, product.currency))}</td>
                <td>
                  ${product.for_sale ? '<span class="badge badge-success">Im Verkauf</span>' : '<span class="badge badge-muted">Nicht im Verkauf</span>'}
                  ${product.on_sale && product.discount_percent > 0 ? `<span class="badge badge-sale">−${product.discount_percent}%</span>` : ''}
                </td>
                <td>${product.visible ? '<span class="badge badge-success">Sichtbar</span>' : '<span class="badge badge-muted">Ausgeblendet</span>'}</td>
                <td class="table-actions">
                  ${isMaster(me) ? `<button class="btn btn-ghost btn-xs" type="button" data-product-edit="${escapeHtml(product.id)}">${icon('edit')} Bearbeiten</button>` : ''}
                  ${product.visible
                    ? `<button class="btn btn-ghost btn-xs" type="button" data-product-hide="${escapeHtml(product.id)}">${icon('eyeOff')} Ausblenden</button>`
                    : (isMaster(me) ? `<button class="btn btn-ghost btn-xs" type="button" data-product-show="${escapeHtml(product.id)}">${icon('eye')} Einblenden</button>` : '<span class="text-tiny muted-text">Nur Master</span>')}
                  ${isMaster(me) ? `<button class="btn btn-danger btn-xs" type="button" data-product-delete="${escapeHtml(product.id)}">${icon('trash')}</button>` : ''}
                </td>
              </tr>`;
          }).join('') || `<tr><td colspan="5">${emptyState('Keine Produkte', 'Lege als Master Admin das erste Produkt an.')}</td></tr>`}
        </tbody>
      </table>
    </div>
    ${!isMaster(me) ? '<p class="admin-hint">Ausgeblendete Produkte können ausschließlich vom Master Admin wieder eingeblendet werden.</p>' : ''}`;
}

function renderReviews() {
  const filtered = reviews.filter((review) => state.reviewFilter === 'all' || review.status === state.reviewFilter);
  panel.innerHTML = `
    <div class="admin-section-head">
      <div><h2>Bewertungen</h2><p>Freigeben, ablehnen oder unsichtbar machen. Ausgeblendete Bewertungen sehen nur Admins.</p></div>
      <select class="input select" id="review-status-filter">
        ${filterOption('all', 'Alle', state.reviewFilter)}
        ${filterOption('pending', 'In Prüfung', state.reviewFilter)}
        ${filterOption('approved', 'Freigegeben', state.reviewFilter)}
        ${filterOption('hidden', 'Ausgeblendet', state.reviewFilter)}
        ${filterOption('rejected', 'Abgelehnt', state.reviewFilter)}
      </select>
    </div>
    <div class="moderation-grid">
      ${filtered.map((review) => `
        <article class="mod-card">
          <div class="mod-head">
            <div class="table-user">${avatar(review.author)}<span><strong>${escapeHtml(review.author?.username || 'Nutzer')}</strong><small>${escapeHtml(review.product?.name || 'Produkt')} · ${escapeHtml(formatDate(review.created_at))}</small></span></div>
            ${statusBadge(review.status)}
          </div>
          <div class="mod-rating">${stars(review.rating, { showValue: true })}</div>
          <p class="mod-content">${escapeHtml(review.content)}</p>
          ${review.moderation_note ? `<div class="submission-note">${escapeHtml(review.moderation_note)}</div>` : ''}
          <div class="mod-actions">
            ${review.status !== 'approved' ? `<button class="btn btn-success btn-xs" type="button" data-review-status="approved" data-review-id="${escapeHtml(review.id)}">${icon('check')} Freigeben</button>` : ''}
            ${review.status === 'approved' ? `<button class="btn btn-ghost btn-xs" type="button" data-review-status="hidden" data-review-id="${escapeHtml(review.id)}">${icon('eyeOff')} Ausblenden</button>` : ''}
            ${review.status !== 'rejected' ? `<button class="btn btn-danger btn-xs" type="button" data-review-status="rejected" data-review-id="${escapeHtml(review.id)}">Ablehnen</button>` : ''}
          </div>
        </article>`).join('') || `<div class="admin-card">${emptyState('Keine Bewertungen', 'In diesem Filter sind keine Bewertungen vorhanden.')}</div>`}
    </div>`;
}

function renderSuggestions() {
  const filtered = suggestions.filter((item) => state.suggestionFilter === 'all' || item.status === state.suggestionFilter);
  panel.innerHTML = `
    <div class="admin-section-head">
      <div><h2>Produktvorschläge</h2><p>Ideen der Community prüfen und annehmen oder ablehnen.</p></div>
      <select class="input select" id="suggestion-status-filter">
        ${filterOption('all', 'Alle', state.suggestionFilter)}
        ${filterOption('pending', 'In Prüfung', state.suggestionFilter)}
        ${filterOption('approved', 'Angenommen', state.suggestionFilter)}
        ${filterOption('rejected', 'Abgelehnt', state.suggestionFilter)}
      </select>
    </div>
    <div class="moderation-grid">
      ${filtered.map((suggestion) => `
        <article class="mod-card">
          <div class="mod-head">
            <div class="table-user">${avatar(suggestion.author)}<span><strong>${escapeHtml(suggestion.author?.username || 'Nutzer')}</strong><small>${escapeHtml(formatDate(suggestion.created_at))}${suggestion.category ? ` · ${escapeHtml(suggestion.category)}` : ''}</small></span></div>
            ${statusBadge(suggestion.status)}
          </div>
          <h3 class="mod-title">${escapeHtml(suggestion.name)}</h3>
          <p class="mod-content">${escapeHtml(suggestion.description)}</p>
          ${suggestion.link ? `<a class="text-btn" href="${escapeHtml(safeUrl(suggestion.link, '#'))}" target="_blank" rel="noopener">Vorgeschlagener Link</a>` : ''}
          ${suggestion.admin_note ? `<div class="submission-note">${escapeHtml(suggestion.admin_note)}</div>` : ''}
          <div class="mod-actions">
            ${suggestion.status !== 'approved' ? `<button class="btn btn-success btn-xs" type="button" data-suggestion-status="approved" data-suggestion-id="${escapeHtml(suggestion.id)}">${icon('check')} Annehmen</button>` : ''}
            ${suggestion.status !== 'rejected' ? `<button class="btn btn-danger btn-xs" type="button" data-suggestion-status="rejected" data-suggestion-id="${escapeHtml(suggestion.id)}">Ablehnen</button>` : ''}
          </div>
        </article>`).join('') || `<div class="admin-card">${emptyState('Keine Vorschläge', 'In diesem Filter sind keine Vorschläge vorhanden.')}</div>`}
    </div>`;
}

function renderPurchases() {
  const filtered = purchases.filter((purchase) => state.purchaseFilter === 'all' || purchase.status === state.purchaseFilter);
  panel.innerHTML = `
    <div class="admin-section-head">
      <div><h2>Käufe</h2><p>Zahlungen prüfen. Nach Bestätigung vergibt der Discord-Bot automatisch die Produktrolle.</p></div>
      <select class="input select" id="purchase-status-filter">
        ${filterOption('all', 'Alle', state.purchaseFilter)}
        ${filterOption('pending', 'Offen', state.purchaseFilter)}
        ${filterOption('confirmed', 'Bestätigt', state.purchaseFilter)}
        ${filterOption('rejected', 'Abgelehnt', state.purchaseFilter)}
        ${filterOption('refunded', 'Erstattet', state.purchaseFilter)}
      </select>
    </div>
    <div class="admin-card table-card">
      <table class="data-table">
        <thead><tr><th>Käufer</th><th>Produkt</th><th>Betrag</th><th>Roblox / Beleg</th><th>Status</th><th>Datum</th><th></th></tr></thead>
        <tbody>
          ${filtered.map((purchase) => `
            <tr>
              <td><div class="table-user">${avatar(purchase.buyer)}<span><strong>${escapeHtml(purchase.buyer?.username || 'Nutzer')}</strong><small>${escapeHtml(purchase.buyer?.email || '')}</small></span></div></td>
              <td>${escapeHtml(purchase.product?.name || purchase.product_name)}<br><small class="muted-text">${escapeHtml(purchase.purchase_type)}</small></td>
              <td>${escapeHtml(formatPrice(purchase.amount, purchase.currency))}</td>
              <td>${escapeHtml(purchase.roblox_username || '—')}<br><small class="muted-text">${escapeHtml(purchase.roblox_receipt || 'Kein Beleg')}</small></td>
              <td>${statusBadge(purchase.status)}${purchase.role_granted_at ? '<br><small class="status-ok">Rolle vergeben</small>' : ''}</td>
              <td>${escapeHtml(formatDate(purchase.created_at, true))}</td>
              <td class="table-actions">
                ${purchase.status === 'pending' ? `
                  <button class="btn btn-success btn-xs" type="button" data-purchase-status="confirmed" data-purchase-id="${escapeHtml(purchase.id)}">${icon('check')} Bestätigen</button>
                  <button class="btn btn-danger btn-xs" type="button" data-purchase-status="rejected" data-purchase-id="${escapeHtml(purchase.id)}">Ablehnen</button>` : ''}
                ${purchase.status === 'confirmed' ? `<button class="btn btn-ghost btn-xs" type="button" data-purchase-status="refunded" data-purchase-id="${escapeHtml(purchase.id)}">Erstatten</button>` : ''}
              </td>
            </tr>`).join('') || `<tr><td colspan="7">${emptyState('Keine Käufe', 'In diesem Filter sind keine Käufe vorhanden.')}</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function filterOption(value, label, selected) {
  return `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`;
}

function renderNotifications() {
  panel.innerHTML = `
    <div class="admin-section-head">
      <div><h2>Benachrichtigungen</h2><p>Wichtige Hinweise für alle Nutzer veröffentlichen. Persönliche Statusmeldungen werden automatisch erzeugt.</p></div>
    </div>
    <div class="admin-columns">
      <section class="admin-card">
        <div class="admin-card-head"><h3>Neue Mitteilung</h3></div>
        <form id="admin-notification-form" class="form-stack">
          <div class="field"><label for="notif-title">Titel</label><input id="notif-title" name="title" required maxlength="160" placeholder="z. B. Neue Aktion verfügbar"></div>
          <div class="field"><label for="notif-body">Text</label><textarea id="notif-body" name="body" rows="4" maxlength="1000" placeholder="Was sollen die Nutzer wissen?"></textarea></div>
          <div class="field-row">
            <div class="field"><label for="notif-kind">Art</label><select id="notif-kind" name="kind" class="input select">
              <option value="info">Info</option><option value="success">Erfolg</option><option value="warning">Warnung</option><option value="sale">Aktion</option>
            </select></div>
            <div class="field"><label for="notif-link">Link <span class="optional">(optional)</span></label><input id="notif-link" name="link" placeholder="products.html"></div>
          </div>
          <div class="form-alert form-alert-error" id="notif-form-error" hidden></div>
          <button class="btn btn-primary" type="submit">${icon('bell')} Veröffentlichen</button>
        </form>
      </section>
      <section class="admin-card">
        <div class="admin-card-head"><h3>Hinweise</h3></div>
        <ul class="info-list">
          <li>Globale Mitteilungen erscheinen in der Glocke aller angemeldeten Nutzer.</li>
          <li>Desktop-Meldungen werden nur angezeigt, wenn der Browser es erlaubt und der Nutzer es aktiviert hat.</li>
          <li>Persönliche Meldungen entstehen automatisch bei Bewertungs-, Vorschlags- und Kaufstatus.</li>
          <li>Deaktivierte Mitteilungen verschwinden sofort aus der Box.</li>
        </ul>
      </section>
    </div>
    <section class="admin-card table-card">
      <table class="data-table">
        <thead><tr><th>Titel</th><th>Ziel</th><th>Art</th><th>Status</th><th>Erstellt</th><th></th></tr></thead>
        <tbody>
          ${notifications.map((notification) => `
            <tr>
              <td><strong>${escapeHtml(notification.title)}</strong><br><small class="muted-text">${escapeHtml(notification.body)}</small></td>
              <td>${notification.user_id ? escapeHtml(userName(userById(notification.user_id))) : '<span class="badge badge-category">Alle</span>'}</td>
              <td>${escapeHtml(notification.kind)}</td>
              <td>${notification.is_active ? '<span class="badge badge-success">Aktiv</span>' : '<span class="badge badge-muted">Inaktiv</span>'}</td>
              <td>${escapeHtml(formatDate(notification.created_at, true))}</td>
              <td class="table-actions">
                <button class="btn btn-ghost btn-xs" type="button" data-notification-toggle="${escapeHtml(notification.id)}">${notification.is_active ? 'Deaktivieren' : 'Aktivieren'}</button>
                ${isMaster(me) ? `<button class="btn btn-danger btn-xs" type="button" data-notification-delete="${escapeHtml(notification.id)}">${icon('trash')}</button>` : ''}
              </td>
            </tr>`).join('') || `<tr><td colspan="6">${emptyState('Keine Mitteilungen', 'Veröffentliche die erste Benachrichtigung.')}</td></tr>`}
        </tbody>
      </table>
    </section>`;
}

function renderLog() {
  panel.innerHTML = `
    <div class="admin-section-head">
      <div><h2>Protokoll</h2><p>Die letzten Verwaltungsaktionen. Einträge werden beim Ausführen gespeichert.</p></div>
    </div>
    <div class="admin-card table-card">
      <table class="data-table">
        <thead><tr><th>Zeitpunkt</th><th>Akteur</th><th>Aktion</th><th>Ziel</th><th>Details</th></tr></thead>
        <tbody>
          ${actions.map((entry) => `
            <tr>
              <td>${escapeHtml(formatDate(entry.created_at, true))}</td>
              <td>${escapeHtml(userName(userById(entry.actor_id)))}</td>
              <td><strong>${escapeHtml(entry.action)}</strong></td>
              <td>${entry.target_user_id ? escapeHtml(userName(userById(entry.target_user_id))) : '—'}</td>
              <td><small class="muted-text">${escapeHtml(entry.details ? JSON.stringify(entry.details) : '—')}</small></td>
            </tr>`).join('') || `<tr><td colspan="5">${emptyState('Noch kein Protokoll', 'Aktionen erscheinen hier nach der ersten Änderung.')}</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function loadBotData(force = false) {
  if (!isMaster(me)) return;
  if (state.botLoading) return;
  state.botLoading = true;
  const [settingsRes, warningsRes, actionsRes, heartbeatRes] = await Promise.all([
    supabase.from('bot_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('warnings').select('*').eq('active', true).order('created_at', { ascending: false }).limit(300),
    supabase.from('moderation_actions').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('bot_heartbeat').select('*').eq('id', 1).maybeSingle()
  ]);
  state.botSettings = settingsRes.data || null;
  state.botWarnings = warningsRes.data || [];
  state.botActions = actionsRes.data || [];
  state.botHeartbeat = heartbeatRes.data || null;
  state.botLoaded = true;
  state.botLoading = false;
  if (settingsRes.error) toast('Bot-Einstellungen konnten nicht geladen werden: ' + settingsRes.error.message, 'error');
}

function renderBot() {
  if (!isMaster(me)) {
    panel.innerHTML = '<div class="admin-card">' + emptyState('Kein Zugriff', 'Der Bot-Bereich ist ausschließlich für den Master Admin sichtbar.') + '</div>';
    return;
  }
  if (!state.botLoaded) {
    panel.innerHTML = '<div class="admin-card loading-card"><span class="spinner"></span> Bot-Daten werden geladen …</div>';
    loadBotData().then(() => renderBot());
    return;
  }

  const s = state.botSettings || {
    guild_id: '', mod_log_channel_id: '', welcome_channel_id: '', mute_role_id: '',
    mod_role_ids: [], auto_role_ids: [], welcome_enabled: false,
    welcome_message: 'Willkommen {user} auf {server}!', automod_enabled: false,
    automod_invites: true, automod_links: false, automod_caps: true, automod_spam: true,
    automod_banned_words: [], automod_action: 'delete', log_messages: true, log_members: true,
    log_moderation: true, dm_on_action: true, warn_timeout_at: 3, warn_ban_at: 0,
    purchases_enabled: true, bot_activity: 'Ro-Tech Hub', disabled_commands: []
  };
  const heartbeat = state.botHeartbeat;
  const lastSeen = heartbeat?.last_seen ? new Date(heartbeat.last_seen).getTime() : 0;
  const online = lastSeen && Date.now() - lastSeen < 120000;
  const warningCounts = state.botWarnings.reduce((map, warning) => {
    map.set(warning.user_id, (map.get(warning.user_id) || 0) + 1);
    return map;
  }, new Map());
  const disabled = new Set(s.disabled_commands || []);

  panel.innerHTML = `
    <div class="admin-section-head">
      <div><h2>Discord-Bot</h2><p>Nur für den Master Admin. Alle Einstellungen werden direkt vom Bot übernommen.</p></div>
      <a class="btn btn-ghost btn-sm" href="${escapeHtml(safeUrl(CONFIG.DISCORD_BOT_INVITE_URL, '#'))}" target="_blank" rel="noopener">${icon('discord')} Bot einladen</a>
      <button class="btn btn-ghost btn-sm" type="button" data-action="bot-refresh">${icon('spark')} Aktualisieren</button>
    </div>
    <div class="admin-stats bot-stats">
      <div class="admin-stat ${online ? 'is-online' : 'is-offline'}">
        <span class="admin-stat-icon">${icon('discord')}</span>
        <div><strong>${online ? 'Online' : 'Offline'}</strong><span>Bot-Status</span></div>
      </div>
      ${statCard('clock', heartbeat?.last_seen ? formatDate(heartbeat.last_seen, true) : 'Noch nie', 'Letzter Heartbeat')}
      ${statCard('lock', state.botWarnings.length, 'Aktive Warnungen')}
      ${statCard('chart', state.botActions.length, 'Aktionen protokolliert')}
    </div>
    <div class="admin-card">
      <div class="admin-card-head"><h3>Verbindung & Rollen</h3><span class="text-tiny muted-text">${heartbeat?.guild_name ? escapeHtml(heartbeat.guild_name) : 'Guild noch nicht verbunden'}</span></div>
      <form id="bot-settings-form" class="form-stack">
        <div class="field-row">
          <div class="field"><label for="bot-guild">Discord Server-ID</label><input id="bot-guild" name="guild_id" value="${escapeHtml(s.guild_id || '')}" placeholder="z. B. 123456789012345678"></div>
          <div class="field"><label for="bot-activity">Bot-Aktivität</label><input id="bot-activity" name="bot_activity" value="${escapeHtml(s.bot_activity || '')}" maxlength="80" placeholder="Ro-Tech Hub"></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="bot-modlog">Mod-Log Kanal-ID</label><input id="bot-modlog" name="mod_log_channel_id" value="${escapeHtml(s.mod_log_channel_id || '')}" placeholder="Kanal-ID"></div>
          <div class="field"><label for="bot-welcome-channel">Willkommens-Kanal-ID</label><input id="bot-welcome-channel" name="welcome_channel_id" value="${escapeHtml(s.welcome_channel_id || '')}" placeholder="Kanal-ID"></div>
          <div class="field"><label for="bot-mute-role">Mute-Rollen-ID</label><input id="bot-mute-role" name="mute_role_id" value="${escapeHtml(s.mute_role_id || '')}" placeholder="Optional"></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="bot-mod-roles">Moderator-Rollen-IDs</label><input id="bot-mod-roles" name="mod_role_ids" value="${escapeHtml((s.mod_role_ids || []).join(', '))}" placeholder="Komma-getrennt"><span class="form-hint">Diese Rollen dürfen alle Bot-Befehle nutzen.</span></div>
          <div class="field"><label for="bot-auto-roles">Auto-Rollen-IDs</label><input id="bot-auto-roles" name="auto_role_ids" value="${escapeHtml((s.auto_role_ids || []).join(', '))}" placeholder="Komma-getrennt"><span class="form-hint">Rollen, die neue Mitglieder automatisch erhalten.</span></div>
        </div>
        <div class="toggle-grid">
          <label class="switch-row"><input type="checkbox" name="purchases_enabled" ${s.purchases_enabled !== false ? 'checked' : ''}><span>Kauf-Rollen-Sync</span></label>
          <label class="switch-row"><input type="checkbox" name="log_moderation" ${s.log_moderation !== false ? 'checked' : ''}><span>Moderations-Logs</span></label>
          <label class="switch-row"><input type="checkbox" name="log_messages" ${s.log_messages !== false ? 'checked' : ''}><span>Nachrichten-Logs</span></label>
          <label class="switch-row"><input type="checkbox" name="log_members" ${s.log_members !== false ? 'checked' : ''}><span>Mitglieder-Logs</span></label>
          <label class="switch-row"><input type="checkbox" name="dm_on_action" ${s.dm_on_action !== false ? 'checked' : ''}><span>DM bei Moderationsaktionen</span></label>
        </div>

        <div class="bot-subhead"><h3>Willkommen & Auto-Rollen</h3></div>
        <div class="toggle-grid">
          <label class="switch-row"><input type="checkbox" name="welcome_enabled" ${s.welcome_enabled ? 'checked' : ''}><span>Willkommensnachricht senden</span></label>
        </div>
        <div class="field"><label for="bot-welcome-message">Willkommenstext</label><textarea id="bot-welcome-message" name="welcome_message" rows="3">${escapeHtml(s.welcome_message || '')}</textarea><span class="form-hint">Platzhalter: {user}, {username}, {server}, {memberCount}</span></div>

        <div class="bot-subhead"><h3>AutoMod</h3></div>
        <div class="toggle-grid">
          <label class="switch-row"><input type="checkbox" name="automod_enabled" ${s.automod_enabled ? 'checked' : ''}><span>AutoMod aktiv</span></label>
          <label class="switch-row"><input type="checkbox" name="automod_invites" ${s.automod_invites ? 'checked' : ''}><span>Invite-Links blockieren</span></label>
          <label class="switch-row"><input type="checkbox" name="automod_links" ${s.automod_links ? 'checked' : ''}><span>Alle Links blockieren</span></label>
          <label class="switch-row"><input type="checkbox" name="automod_caps" ${s.automod_caps ? 'checked' : ''}><span>Caps-Limit</span></label>
          <label class="switch-row"><input type="checkbox" name="automod_spam" ${s.automod_spam ? 'checked' : ''}><span>Spam-Schutz</span></label>
        </div>
        <div class="field-row">
          <div class="field"><label for="bot-automod-action">AutoMod-Aktion</label><select id="bot-automod-action" name="automod_action" class="input select">
            <option value="delete"${s.automod_action === 'delete' ? ' selected' : ''}>Nur löschen</option>
            <option value="timeout"${s.automod_action === 'timeout' ? ' selected' : ''}>Löschen + 10 Min Timeout</option>
          </select></div>
          <div class="field"><label for="bot-banned-words">Verbotene Wörter</label><textarea id="bot-banned-words" name="automod_banned_words" rows="3" placeholder="Komma- oder zeilengetrennt">${escapeHtml((s.automod_banned_words || []).join(', '))}</textarea></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="bot-warn-timeout">Timeout ab Warnungen</label><input id="bot-warn-timeout" name="warn_timeout_at" type="number" min="0" max="20" value="${Number(s.warn_timeout_at) || 0}"><span class="form-hint">0 = deaktiviert. Bei Erreichen wird 10 Min Timeout verhängt.</span></div>
          <div class="field"><label for="bot-warn-ban">Ban ab Warnungen</label><input id="bot-warn-ban" name="warn_ban_at" type="number" min="0" max="20" value="${Number(s.warn_ban_at) || 0}"><span class="form-hint">0 = deaktiviert. Bei Erreichen wird automatisch gebannt.</span></div>
        </div>

        <div class="bot-subhead"><h3>Befehle</h3><p>Deaktivierte Befehle werden vom Bot abgelehnt.</p></div>
        <div class="command-grid">
          ${BOT_COMMANDS.map(([name, label]) => `<label class="switch-row command-toggle"><input type="checkbox" name="cmd_${name}" ${disabled.has(name) ? '' : 'checked'}><span><code>/${name}</code> ${escapeHtml(label)}</span></label>`).join('')}
        </div>
        <div class="form-alert form-alert-error" id="bot-settings-error" hidden></div>
        <div class="modal-actions">
          <button class="btn btn-primary" type="submit">${icon('shield')} Bot-Einstellungen speichern</button>
        </div>
      </form>
    </div>

    <div class="admin-columns">
      <section class="admin-card table-card">
        <div class="admin-card-head" style="padding:20px 20px 0"><h3>Aktive Warnungen</h3><span class="text-tiny muted-text">${warningCounts.size} Nutzer</span></div>
        <table class="data-table">
          <thead><tr><th>Nutzer</th><th>Grund</th><th>Von</th><th>Datum</th><th></th></tr></thead>
          <tbody>
            ${state.botWarnings.slice(0, 30).map((warning) => `
              <tr>
                <td><strong>${escapeHtml(warning.username || warning.user_id)}</strong><br><small class="muted-text">${escapeHtml(warning.user_id)}</small></td>
                <td>${escapeHtml(warning.reason)}</td>
                <td>${escapeHtml(warning.moderator_name || warning.moderator_id || '?')}</td>
                <td>${escapeHtml(formatDate(warning.created_at, true))}</td>
                <td class="table-actions"><button class="btn btn-ghost btn-xs" type="button" data-warning-remove="${escapeHtml(warning.id)}">Entfernen</button></td>
              </tr>`).join('') || '<tr><td colspan="5">Keine aktiven Warnungen.</td></tr>'}
          </tbody>
        </table>
      </section>
      <section class="admin-card table-card">
        <div class="admin-card-head" style="padding:20px 20px 0"><h3>Letzte Bot-Aktionen</h3><span class="text-tiny muted-text">${state.botActions.length}</span></div>
        <table class="data-table">
          <thead><tr><th>Aktion</th><th>Ziel</th><th>Von</th><th>Datum</th></tr></thead>
          <tbody>
            ${state.botActions.slice(0, 30).map((action) => `
              <tr>
                <td><strong>${escapeHtml(action.action)}</strong><br><small class="muted-text">${escapeHtml(action.reason || '')}</small></td>
                <td>${escapeHtml(action.target_name || action.target_id || '?')}</td>
                <td>${escapeHtml(action.moderator_name || action.moderator_id || '?')}</td>
                <td>${escapeHtml(formatDate(action.created_at, true))}</td>
              </tr>`).join('') || '<tr><td colspan="4">Noch keine Aktionen.</td></tr>'}
          </tbody>
        </table>
      </section>
    </div>
    <div class="admin-card">
      <div class="admin-card-head"><h3>Einrichtung</h3></div>
      <div class="info-list">
        <p>1. Bot im Discord-Server einladen und ihm die Intents <strong>Server Members</strong> und <strong>Message Content</strong> geben.</p>
        <p>2. Bot-Rolle in der Rollenhierarchie über die Rollen platzieren, die er vergeben oder entfernen soll.</p>
        <p>3. Server-ID, Kanal-IDs und Moderator-Rollen-IDs hier eintragen und speichern.</p>
        <p>4. Der Bot lädt die Konfiguration automatisch alle 30 Sekunden neu. Der Heartbeat zeigt, ob er verbunden ist.</p>
        <p>5. Produktrollen werden beim Anlegen automatisch erzeugt und beim Löschen entfernt, sofern außer dem Master niemand die Rolle hat. Kauf-Rollen-Sync vergibt bestätigte Käufe automatisch.</p>
      </div>
    </div>`;
}

async function saveBotSettings(event) {
  event.preventDefault();
  const form = event.target;
  const errorBox = document.getElementById('bot-settings-error');
  const submit = form.querySelector('button[type="submit"]');
  const val = (name) => form.elements[name]?.value?.trim() || '';
  const checked = (name) => !!form.elements[name]?.checked;
  const splitIds = (value) => value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
  const splitWords = (value) => value.split(/[,\n]+/).map((item) => item.trim()).filter(Boolean);
  const snowflake = /^\d{17,20}$/;

  const guildId = val('guild_id');
  const modRoles = splitIds(val('mod_role_ids'));
  const autoRoles = splitIds(val('auto_role_ids'));
  const singleIds = [
    ['guild_id', guildId], ['mod_log_channel_id', val('mod_log_channel_id')],
    ['welcome_channel_id', val('welcome_channel_id')], ['mute_role_id', val('mute_role_id')]
  ];
  const invalid = singleIds.find(([name, value]) => value && !snowflake.test(value));
  const invalidRole = modRoles.find((id) => !snowflake.test(id)) || autoRoles.find((id) => !snowflake.test(id));
  const warnTimeout = Math.max(0, Math.min(20, Number(val('warn_timeout_at')) || 0));
  const warnBan = Math.max(0, Math.min(20, Number(val('warn_ban_at')) || 0));

  if (errorBox) errorBox.hidden = true;
  if (invalid || invalidRole) {
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = 'Discord-IDs müssen 17–20 Ziffern haben. Bitte prüfe Server-, Kanal- und Rollen-IDs.';
    }
    return;
  }

  const disabledCommands = BOT_COMMANDS
    .filter(([name]) => !checked('cmd_' + name))
    .map(([name]) => name);

  const payload = {
    id: 1,
    guild_id: guildId || null,
    mod_log_channel_id: val('mod_log_channel_id') || null,
    welcome_channel_id: val('welcome_channel_id') || null,
    mute_role_id: val('mute_role_id') || null,
    mod_role_ids: modRoles,
    auto_role_ids: autoRoles,
    welcome_enabled: checked('welcome_enabled'),
    welcome_message: val('welcome_message') || 'Willkommen {user} auf {server}!',
    automod_enabled: checked('automod_enabled'),
    automod_invites: checked('automod_invites'),
    automod_links: checked('automod_links'),
    automod_caps: checked('automod_caps'),
    automod_spam: checked('automod_spam'),
    automod_banned_words: splitWords(val('automod_banned_words')),
    automod_action: val('automod_action') || 'delete',
    log_messages: checked('log_messages'),
    log_members: checked('log_members'),
    log_moderation: checked('log_moderation'),
    dm_on_action: checked('dm_on_action'),
    warn_timeout_at: warnTimeout,
    warn_ban_at: warnBan,
    purchases_enabled: checked('purchases_enabled'),
    bot_activity: val('bot_activity') || 'Ro-Tech Hub',
    disabled_commands: disabledCommands,
    updated_by: me.id
  };

  setLoading(submit, true, 'Speichern …');
  const { error } = await supabase.from('bot_settings').upsert(payload, { onConflict: 'id' });
  setLoading(submit, false);

  if (error) {
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = error.message;
    }
    return;
  }

  state.botSettings = payload;
  state.botLoaded = true;
  await logAction('Bot-Einstellungen gespeichert', null, { guild_id: payload.guild_id, disabled_commands: disabledCommands });
  toast('Bot-Einstellungen gespeichert. Der Bot übernimmt sie automatisch.', 'success');
  renderBot();
}

async function removeWarning(warningId) {
  const warning = state.botWarnings.find((entry) => entry.id === warningId);
  if (!warning) return;
  const ok = await confirmDialog({
    title: 'Warnung entfernen?',
    message: 'Die Warnung wird deaktiviert und zählt nicht mehr für automatische Schwellen.',
    confirmText: 'Entfernen'
  });
  if (!ok) return;
  const { error } = await supabase.from('warnings').update({
    active: false,
    removed_at: new Date().toISOString(),
    removed_by: me.username
  }).eq('id', warningId);
  if (error) {
    toast(error.message, 'error');
    return;
  }
  await logAction('Warnung entfernt', null, { warning_id: warningId, target: warning.username || warning.user_id });
  toast('Warnung entfernt.', 'success');
  await loadBotData(true);
  renderBot();
}

async function logAction(action, targetUserId = null, details = null) {
  try {
    await supabase.from('admin_actions').insert({
      actor_id: me.id,
      target_user_id: targetUserId,
      action,
      details
    });
  } catch (error) {
    /* Protokoll ist optional. */
  }
}

panel?.addEventListener('click', async (event) => {
  const goto = event.target.closest('[data-goto-tab]');
  if (goto) {
    event.preventDefault();
    setTab(goto.dataset.gotoTab);
    return;
  }

  const refreshButton = event.target.closest('[data-action="refresh"]');
  if (refreshButton) {
    await refresh();
    return;
  }

  const botRefreshButton = event.target.closest('[data-action="bot-refresh"]');
  if (botRefreshButton) {
    state.botLoaded = false;
    await loadBotData(true);
    renderBot();
    return;
  }

  const warningRemove = event.target.closest('[data-warning-remove]');
  if (warningRemove) {
    await removeWarning(warningRemove.dataset.warningRemove);
    return;
  }

  const createProduct = event.target.closest('[data-action="product-create"]');
  if (createProduct) {
    openProductEditor(null);
    return;
  }

  const userView = event.target.closest('[data-user-view]');
  if (userView) {
    openUserDetail(userView.dataset.userView);
    return;
  }

  const editProduct = event.target.closest('[data-product-edit]');
  if (editProduct) {
    openProductEditor(productById(editProduct.dataset.productEdit));
    return;
  }

  const hideProduct = event.target.closest('[data-product-hide]');
  if (hideProduct) {
    await setProductVisibility(hideProduct.dataset.productHide, false);
    return;
  }

  const showProduct = event.target.closest('[data-product-show]');
  if (showProduct) {
    await setProductVisibility(showProduct.dataset.productShow, true);
    return;
  }

  const deleteProductButton = event.target.closest('[data-product-delete]');
  if (deleteProductButton) {
    await deleteProduct(deleteProductButton.dataset.productDelete);
    return;
  }

  const reviewStatus = event.target.closest('[data-review-status]');
  if (reviewStatus) {
    await setReviewStatus(reviewStatus.dataset.reviewId, reviewStatus.dataset.reviewStatus);
    return;
  }

  const suggestionStatus = event.target.closest('[data-suggestion-status]');
  if (suggestionStatus) {
    await setSuggestionStatus(suggestionStatus.dataset.suggestionId, suggestionStatus.dataset.suggestionStatus);
    return;
  }

  const purchaseStatus = event.target.closest('[data-purchase-status]');
  if (purchaseStatus) {
    await setPurchaseStatus(purchaseStatus.dataset.purchaseId, purchaseStatus.dataset.purchaseStatus);
    return;
  }

  const notificationToggle = event.target.closest('[data-notification-toggle]');
  if (notificationToggle) {
    await toggleNotification(notificationToggle.dataset.notificationToggle);
    return;
  }

  const notificationDelete = event.target.closest('[data-notification-delete]');
  if (notificationDelete) {
    await deleteNotification(notificationDelete.dataset.notificationDelete);
  }
});

panel?.addEventListener('input', (event) => {
  if (event.target.id !== 'admin-user-search') return;
  const term = event.target.value.trim().toLowerCase();
  panel.querySelectorAll('[data-user-row]').forEach((row) => {
    row.hidden = term && !row.dataset.search.includes(term);
  });
});

panel?.addEventListener('change', (event) => {
  if (event.target.id === 'review-status-filter') {
    state.reviewFilter = event.target.value;
    renderReviews();
  }
  if (event.target.id === 'suggestion-status-filter') {
    state.suggestionFilter = event.target.value;
    renderSuggestions();
  }
  if (event.target.id === 'purchase-status-filter') {
    state.purchaseFilter = event.target.value;
    renderPurchases();
  }
});

panel?.addEventListener('submit', async (event) => {
  if (event.target.id === 'bot-settings-form') {
    await saveBotSettings(event);
    return;
  }
  if (event.target.id !== 'admin-notification-form') return;
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector('button[type="submit"]');
  const errorBox = document.getElementById('notif-form-error');
  const title = form.elements.title.value.trim();
  const body = form.elements.body.value.trim();
  const link = form.elements.link.value.trim();

  if (errorBox) errorBox.hidden = true;
  if (!title) {
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = 'Bitte einen Titel eingeben.';
    }
    return;
  }
  if (link && !safeUrl(link, '')) {
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = 'Der Link ist ungültig.';
    }
    return;
  }

  setLoading(submit, true, 'Veröffentlichen …');
  const { error } = await supabase.from('notifications').insert({
    title,
    body,
    kind: form.elements.kind.value,
    link: link ? safeUrl(link, '') : null,
    is_active: true,
    created_by: me.id
  });
  setLoading(submit, false);

  if (error) {
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = error.message;
    }
    return;
  }

  await logAction('Benachrichtigung veröffentlicht', null, { title });
  toast('Benachrichtigung veröffentlicht.', 'success');
  form.reset();
  await refresh();
});

async function setProductVisibility(productId, visible) {
  const product = productById(productId);
  if (!product) return;
  if (visible && !isMaster(me)) {
    toast('Nur der Master Admin kann Produkte wieder einblenden.', 'warning');
    return;
  }
  const { error } = await supabase.from('products').update({ visible }).eq('id', productId);
  if (error) {
    toast(error.message, 'error');
    return;
  }
  await logAction(visible ? 'Produkt eingeblendet' : 'Produkt ausgeblendet', null, { product: product.name });
  toast(visible ? 'Produkt eingeblendet.' : 'Produkt ausgeblendet.', 'success');
  await refresh();
}

async function deleteProduct(productId) {
  const product = productById(productId);
  if (!product) return;
  const ok = await confirmDialog({
    title: 'Produkt löschen?',
    message: `„${product.name}“ wird dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden. Die Discord-Rolle wird automatisch entfernt, sofern sie niemandem außer dem Master zugewiesen ist.`,
    confirmText: 'Dauerhaft löschen',
    danger: true
  });
  if (!ok) return;
  const { error } = await supabase.from('products').delete().eq('id', productId);
  if (error) {
    toast(error.message, 'error');
    return;
  }
  await logAction('Produkt gelöscht', null, { product: product.name });
  toast('Produkt gelöscht.', 'success');
  await refresh();
}

async function setReviewStatus(reviewId, status) {
  const review = reviews.find((entry) => entry.id === reviewId);
  const { error } = await supabase.from('reviews').update({ status }).eq('id', reviewId);
  if (error) {
    toast(error.message, 'error');
    return;
  }
  await logAction(`Bewertung: ${status}`, review?.user_id || null, { review_id: reviewId });
  toast(status === 'hidden' ? 'Bewertung ist jetzt nur für Admins sichtbar.' : 'Bewertungsstatus aktualisiert.', 'success');
  await refresh();
}

async function setSuggestionStatus(suggestionId, status) {
  const suggestion = suggestions.find((entry) => entry.id === suggestionId);
  const { error } = await supabase.from('product_suggestions').update({ status }).eq('id', suggestionId);
  if (error) {
    toast(error.message, 'error');
    return;
  }
  await logAction(`Vorschlag: ${status}`, suggestion?.user_id || null, { suggestion_id: suggestionId });
  toast('Vorschlag aktualisiert.', 'success');
  await refresh();
}

async function setPurchaseStatus(purchaseId, status) {
  const purchase = purchases.find((entry) => entry.id === purchaseId);
  const { error } = await supabase.from('purchases').update({ status }).eq('id', purchaseId);
  if (error) {
    toast(error.message, 'error');
    return;
  }
  await logAction(`Kauf: ${status}`, purchase?.user_id || null, { purchase_id: purchaseId, product: purchase?.product_name });
  toast(status === 'confirmed' ? 'Kauf bestätigt. Der Bot vergibt die Rolle automatisch.' : 'Kaufstatus aktualisiert.', 'success');
  await refresh();
}

async function toggleNotification(notificationId) {
  const notification = notifications.find((entry) => entry.id === notificationId);
  if (!notification) return;
  const { error } = await supabase.from('notifications')
    .update({ is_active: !notification.is_active })
    .eq('id', notificationId);
  if (error) {
    toast(error.message, 'error');
    return;
  }
  await logAction(notification.is_active ? 'Benachrichtigung deaktiviert' : 'Benachrichtigung aktiviert', null, { id: notificationId });
  await refresh();
}

async function deleteNotification(notificationId) {
  const ok = await confirmDialog({
    title: 'Benachrichtigung löschen?',
    message: 'Die Mitteilung wird dauerhaft entfernt.',
    confirmText: 'Löschen',
    danger: true
  });
  if (!ok) return;
  const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
  if (error) {
    toast(error.message, 'error');
    return;
  }
  await logAction('Benachrichtigung gelöscht', null, { id: notificationId });
  toast('Benachrichtigung gelöscht.', 'success');
  await refresh();
}

function openUserDetail(userId) {
  const user = userById(userId);
  if (!user) return;
  const userPurchases = purchases.filter((purchase) => purchase.user_id === user.id);
  const userReviews = reviews.filter((review) => review.user_id === user.id);
  const userSuggestions = suggestions.filter((item) => item.user_id === user.id);
  const canBlock = user.id !== me.id
    && user.rank !== 'master'
    && !(me.rank === 'admin' && user.rank !== 'user');
  const canRank = isMaster(me) && user.id !== me.id && user.rank !== 'master';

  const modal = openModal(`
    <div class="admin-user-head">
      ${avatar(user, 'avatar-lg')}
      <div>
        <h2 class="modal-title">${escapeHtml(user.username)}</h2>
        <p class="modal-text">${escapeHtml(user.email)}</p>
        <div class="badge-row">${rankBadge(user.rank)}${user.blocked ? '<span class="badge badge-danger">Gesperrt</span>' : '<span class="badge badge-success">Aktiv</span>'}${user.mfa_email_enabled ? '<span class="badge badge-category">E-Mail-MFA</span>' : ''}</div>
      </div>
    </div>
    <div class="account-detail-grid">
      <div><span>Registriert</span><strong>${escapeHtml(formatDate(user.created_at, true))}</strong></div>
      <div><span>Discord</span><strong>${user.discord_id ? escapeHtml(user.discord_id) : 'Nicht verknüpft'}</strong></div>
      <div><span>Benachrichtigungen</span><strong>${user.notify_inapp ? 'Box an' : 'Box aus'} · ${user.notify_desktop ? 'Desktop an' : 'Desktop aus'}</strong></div>
      <div><span>Käufe / Bewertungen / Vorschläge</span><strong>${userPurchases.length} / ${userReviews.length} / ${userSuggestions.length}</strong></div>
    </div>
    ${user.blocked ? `<div class="form-alert form-alert-error">Gesperrt${user.blocked_reason ? `: ${escapeHtml(user.blocked_reason)}` : ''}</div>` : ''}

    <section class="modal-section">
      <h3>Kaufhistorie</h3>
      ${userPurchases.length ? `
        <div class="admin-mini-list">
          ${userPurchases.map((purchase) => `
            <div class="admin-mini-row">
              <div><strong>${escapeHtml(purchase.product?.name || purchase.product_name)}</strong><small>${escapeHtml(formatDate(purchase.created_at))} · ${escapeHtml(formatPrice(purchase.amount, purchase.currency))}</small></div>
              ${statusBadge(purchase.status)}
            </div>`).join('')}
        </div>` : '<p class="muted-text">Keine Käufe vorhanden.</p>'}
    </section>

    ${canBlock ? `
      <section class="modal-section">
        <h3>Account-Verwaltung</h3>
        <form id="user-block-form" class="form-stack">
          <div class="field"><label for="block-reason">${user.blocked ? 'Grund (optional)' : 'Sperrgrund'}</label>
            <input id="block-reason" name="reason" value="${escapeHtml(user.blocked_reason || '')}" maxlength="300" placeholder="Grund für die Sperre">
          </div>
          <div class="modal-actions">
            ${user.blocked
              ? '<button class="btn btn-success" type="submit" data-block-state="false">Account entsperren</button>'
              : `<button class="btn btn-danger" type="submit" data-block-state="true">Account sperren</button>`}
          </div>
        </form>
        <p class="form-hint">Admins und Master Admins sind gegenseitig immun. Master Admins können nicht gesperrt werden.</p>
      </section>` : `<p class="form-hint">${user.rank === 'master' ? 'Master Admins sind immun gegen Sperren.' : 'Für diesen Account besteht keine Sperrberechtigung.'}</p>`}

    ${canRank ? `
      <section class="modal-section">
        <h3>Rang ändern</h3>
        <form id="user-rank-form" class="form-row">
          <select class="input select" name="rank">
            <option value="user"${user.rank === 'user' ? ' selected' : ''}>Nutzer</option>
            <option value="admin"${user.rank === 'admin' ? ' selected' : ''}>Admin</option>
            <option value="master"${user.rank === 'master' ? ' selected' : ''}>Master Admin</option>
          </select>
          <button class="btn btn-primary" type="submit">Speichern</button>
        </form>
        <p class="form-hint">Der eigene Rang kann nicht geändert werden. Master Admins sind untereinander immun.</p>
      </section>` : ''}
  `, { size: 'lg' });

  modal.element.querySelector('#user-block-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const block = form.querySelector('[data-block-state]')?.dataset.blockState === 'true';
    const reason = form.reason.value.trim();
    const { error } = await supabase.from('profiles').update({
      blocked: block,
      blocked_reason: block ? (reason || 'Kein Grund angegeben') : null
    }).eq('id', user.id);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    await logAction(block ? 'Account gesperrt' : 'Account entsperrt', user.id, { reason });
    toast(block ? 'Account gesperrt.' : 'Account entsperrt.', 'success');
    modal.close();
    await refresh();
  });

  modal.element.querySelector('#user-rank-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const rank = event.currentTarget.elements.rank.value;
    const { error } = await supabase.from('profiles').update({ rank }).eq('id', user.id);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    await logAction(`Rang geändert: ${rankLabel(rank)}`, user.id, { rank });
    toast('Rang aktualisiert.', 'success');
    modal.close();
    await refresh();
  });
}

function openProductEditor(product) {
  if (!isMaster(me)) return;
  const isNew = !product;
  let uploadPromise = null;
  const modal = openModal(`
    <h2 class="modal-title">${isNew ? 'Neues Produkt' : 'Produkt bearbeiten'}</h2>
    <form id="product-form" class="form-stack">
      <div class="field-row">
        <div class="field"><label for="p-name">Produktname</label><input id="p-name" name="name" required maxlength="120" value="${escapeHtml(product?.name || '')}"></div>
        <div class="field"><label for="p-category">Kategorie</label><input id="p-category" name="category" required maxlength="60" list="category-list" value="${escapeHtml(product?.category || '')}">
          <datalist id="category-list"><option value="Scripts"><option value="3D-Assets"><option value="Tools"><option value="Vorlagen"><option value="Bundles"><option value="Analytics"><option value="Sonstiges"></datalist>
        </div>
      </div>
      <div class="field"><label for="p-description">Beschreibung</label><textarea id="p-description" name="description" rows="4" maxlength="3000">${escapeHtml(product?.description || '')}</textarea></div>
      <div class="field-row">
        <div class="field"><label for="p-price">Preis</label><input id="p-price" name="price" type="number" min="0" step="0.01" value="${product?.price ?? 0}"></div>
        <div class="field"><label for="p-currency">Währung</label><select id="p-currency" name="currency" class="input select">
          <option value="EUR"${product?.currency === 'EUR' ? ' selected' : ''}>EUR</option>
          <option value="USD"${product?.currency === 'USD' ? ' selected' : ''}>USD</option>
        </select></div>
        <div class="field"><label for="p-discount">Rabatt %</label><input id="p-discount" name="discount" type="number" min="0" max="100" value="${product?.discount_percent ?? 0}"></div>
      </div>
      <div class="field"><label for="p-image">Vorschaubild-URL</label><input id="p-image" name="image_url" value="${escapeHtml(product?.image_url || '')}" placeholder="https://… oder assets/img/…">
        <div class="image-preview"><img id="product-image-preview" src="${escapeHtml(safeUrl(product?.image_url, 'assets/img/placeholder.svg'))}" alt="" data-fallback="assets/img/placeholder.svg"></div>
        <label class="file-label">Bild hochladen<input type="file" id="p-image-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
      </div>
      <div class="toggle-grid">
        <label class="switch-row"><input type="checkbox" name="for_sale" ${product?.for_sale !== false ? 'checked' : ''}><span>Zum Verkauf</span></label>
        <label class="switch-row"><input type="checkbox" name="on_sale" ${product?.on_sale ? 'checked' : ''}><span>Aktion aktiv</span></label>
        <label class="switch-row"><input type="checkbox" name="visible" ${product?.visible !== false ? 'checked' : ''}><span>Sichtbar</span></label>
      </div>
      <div class="field-row">
        <div class="field"><label for="p-type">Kaufart</label><select id="p-type" name="purchase_type" class="input select">
          <option value="gamepass"${product?.purchase_type === 'gamepass' ? ' selected' : ''}>Roblox Gamepass</option>
          <option value="subscription"${product?.purchase_type === 'subscription' ? ' selected' : ''}>Roblox Abo</option>
          <option value="free"${product?.purchase_type === 'free' ? ' selected' : ''}>Kostenlos</option>
        </select></div>
        <div class="field"><label for="p-gamepass">Gamepass-ID</label><input id="p-gamepass" name="roblox_gamepass_id" value="${escapeHtml(product?.roblox_gamepass_id || '')}" placeholder="z. B. 1234567890"><span class="form-hint">Pflicht bei Game-Pass-Produkten. Der Bot erstellt die Discord-Rolle automatisch.</span></div>
        <div class="field"><label for="p-subscription">Abo-ID</label><input id="p-subscription" name="roblox_subscription_id" value="${escapeHtml(product?.roblox_subscription_id || '')}" placeholder="Optional"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="p-role">Discord-Rolle</label><input id="p-role" value="${escapeHtml(product?.discord_role_id || '')}" placeholder="Wird automatisch erstellt" disabled><span class="form-hint">Die Rolle wird beim Anlegen automatisch vom Bot erstellt und beim Löschen wieder entfernt.</span></div>
        <div class="field"><label for="p-download">Download-Link <span class="optional">(kostenlos)</span></label><input id="p-download" name="download_url" value="${escapeHtml(product?.download_url || '')}" placeholder="https://…"></div>
      </div>
      <div class="form-alert form-alert-error" id="product-form-error" hidden></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" data-close-product>Abbrechen</button>
        <button class="btn btn-primary" type="submit">${isNew ? 'Produkt anlegen' : 'Speichern'}</button>
      </div>
    </form>`, { size: 'lg' });

  const form = modal.element.querySelector('#product-form');
  const imageInput = form.elements.image_url;
  const preview = modal.element.querySelector('#product-image-preview');
  const fileInput = modal.element.querySelector('#p-image-file');

  modal.element.querySelector('[data-close-product]')?.addEventListener('click', () => modal.close());

  imageInput?.addEventListener('input', () => {
    if (preview) preview.src = safeUrl(imageInput.value, 'assets/img/placeholder.svg');
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    uploadPromise = (async () => {
      if (file.size > 5 * 1024 * 1024) {
        toast('Das Bild darf maximal 5 MB groß sein.', 'warning');
        uploadPromise = null;
        return;
      }
      const extension = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `products/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from(CONFIG.STORAGE_BUCKET).upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false
      });
      if (error) {
        toast(`Upload fehlgeschlagen: ${error.message}`, 'error');
        uploadPromise = null;
        return;
      }
      const { data } = supabase.storage.from(CONFIG.STORAGE_BUCKET).getPublicUrl(path);
      imageInput.value = data.publicUrl;
      if (preview) preview.src = data.publicUrl;
      toast('Bild hochgeladen.', 'success');
    })();
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = modal.element.querySelector('#product-form-error');
    if (errorBox) errorBox.hidden = true;
    if (uploadPromise) await uploadPromise;

    const name = form.elements.name.value.trim();
    if (!name) {
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = 'Bitte einen Produktnamen eingeben.';
      }
      return;
    }

    const purchaseType = form.elements.purchase_type.value;
    const gamepassId = form.elements.roblox_gamepass_id.value.trim();
    const subscriptionId = form.elements.roblox_subscription_id.value.trim();
    if (purchaseType === 'gamepass' && !gamepassId) {
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = 'Bitte die Roblox-Game-Pass-ID eingeben.';
      }
      return;
    }
    if (purchaseType === 'subscription' && !subscriptionId) {
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = 'Bitte die Roblox-Abo-ID eingeben.';
      }
      return;
    }

    const payload = {
      name,
      category: form.elements.category.value.trim() || 'Sonstiges',
      description: form.elements.description.value.trim(),
      image_url: form.elements.image_url.value.trim() || null,
      price: Math.max(0, Number(form.elements.price.value) || 0),
      currency: form.elements.currency.value,
      for_sale: form.elements.for_sale.checked,
      on_sale: form.elements.on_sale.checked,
      discount_percent: form.elements.on_sale.checked ? Math.min(100, Math.max(0, Number(form.elements.discount.value) || 0)) : 0,
      visible: form.elements.visible.checked,
      purchase_type: purchaseType,
      roblox_gamepass_id: gamepassId || null,
      roblox_subscription_id: subscriptionId || null,
      download_url: form.elements.download_url.value.trim() || null
    };

    const submit = form.querySelector('button[type="submit"]');
    setLoading(submit, true, 'Speichern …');
    const query = isNew
      ? supabase.from('products').insert({ ...payload, created_by: me.id })
      : supabase.from('products').update(payload).eq('id', product.id);
    const { error } = await query;
    setLoading(submit, false);

    if (error) {
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = error.message;
      }
      return;
    }

    await logAction(isNew ? 'Produkt angelegt' : 'Produkt bearbeitet', null, { product: name });
    toast(isNew ? 'Produkt angelegt.' : 'Produkt gespeichert.', 'success');
    modal.close();
    await refresh();
  });
}
