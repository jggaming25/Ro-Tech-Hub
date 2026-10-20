import { CONFIG } from './config.js';
import { isAdmin, rankLabel, safeNextUrl, currentPageFile } from './supabase.js';

const ICONS = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6Z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/><path d="M19 16.5 19.7 18l1.5.7-1.5.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7.7-1.5Z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5 5L20 6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v6c0 4.5 3 7.6 7 9 4-1.4 7-4.5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m3 3 18 18M10.5 6.2A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.8M6.2 6.7C3.6 8.4 2 12 2 12s3.5 6 10 6c1.3 0 2.5-.2 3.6-.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  discord: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.6 5.6A18 18 0 0 0 15.2 4l-.6 1.3a16 16 0 0 0-5.2 0L8.8 4a18 18 0 0 0-4.4 1.6C1.6 9.5.8 13.2 1.2 16.9a18 18 0 0 0 5.4 2.7l1.1-1.8c-.6-.2-1.2-.5-1.7-.9l.4-.3c3.3 1.5 6.9 1.5 10.1 0l.4.3c-.5.4-1.1.7-1.7.9l1.1 1.8a18 18 0 0 0 5.4-2.7c.5-4.3-.8-8-2.1-11.3ZM8.5 14.6c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  google: '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.4 3-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a5.9 5.9 0 0 1-5.6-4.2H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6A5.9 5.9 0 0 1 12 6Z"/></svg>',
  percent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 7v14M12 7H7.5A2.5 2.5 0 1 1 10 4.5L12 7Zm0 0h4.5A2.5 2.5 0 1 0 14 4.5L12 7Z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m8 5 11 7-11 7V5Z"/></svg>'
};

let toastContainer = null;

export function icon(name) {
  return ICONS[name] || '';
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function safeUrl(value, fallback = '') {
  if (!value) return fallback;
  try {
    const raw = String(value).trim();
    if (/^(javascript|vbscript|data:text|data:html)/i.test(raw)) return fallback;
    const url = new URL(raw, window.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) return fallback;
    return url.href;
  } catch (error) {
    return fallback;
  }
}

export function formatPrice(value, currency = 'EUR') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(number);
  } catch (error) {
    return `${number.toFixed(2)} ${currency || 'EUR'}`;
  }
}

export function effectivePrice(product) {
  const base = Number(product?.price) || 0;
  if (!product?.on_sale || !product?.discount_percent) return base;
  const factor = 1 - Number(product.discount_percent) / 100;
  return Math.round(base * factor * 100) / 100;
}

export function priceHtml(product) {
  if (!product?.for_sale) {
    return '<span class="price price-muted">Nicht im Verkauf</span>';
  }
  if (product.purchase_type === 'free' || Number(product.price) <= 0) {
    return '<span class="price price-free">Kostenlos</span>';
  }
  if (product.on_sale && product.discount_percent > 0) {
    return `<span class="price"><span class="price-old">${escapeHtml(formatPrice(product.price, product.currency))}</span>${escapeHtml(formatPrice(effectivePrice(product), product.currency))}</span>`;
  }
  return `<span class="price">${escapeHtml(formatPrice(product.price, product.currency))}</span>`;
}

export function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('de-DE', withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function truncate(value, length = 160) {
  const text = String(value ?? '').trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length).trimEnd()}…`;
}

export function stars(rating, { showValue = false } = {}) {
  const numeric = Number(rating) || 0;
  const rounded = Math.round(numeric);
  const starHtml = Array.from({ length: 5 }, (_, index) => (
    `<span class="star${index < rounded ? ' is-filled' : ''}">${ICONS.star}</span>`
  )).join('');
  return `<span class="stars" aria-label="${numeric ? `${numeric.toFixed(1)} von 5 Sternen` : 'Noch keine Bewertung'}">${starHtml}${showValue && numeric ? `<span class="stars-value">${numeric.toFixed(1)}</span>` : ''}</span>`;
}

export function statusBadge(status) {
  const map = {
    pending: ['In Prüfung', 'warning'],
    approved: ['Freigegeben', 'success'],
    hidden: ['Ausgeblendet', 'muted'],
    rejected: ['Abgelehnt', 'danger'],
    confirmed: ['Bestätigt', 'success'],
    refunded: ['Erstattet', 'info']
  };
  const [label, tone] = map[status] || [status || 'Unbekannt', 'muted'];
  return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
}

export function rankBadge(rank) {
  const tone = rank === 'master' ? 'master' : rank === 'admin' ? 'admin' : 'muted';
  return `<span class="badge badge-${tone}">${escapeHtml(rankLabel(rank))}</span>`;
}

export function productCard(product, rating) {
  const avg = rating?.avg_rating ?? 0;
  const count = rating?.review_count ?? 0;
  const image = safeUrl(product.image_url, 'assets/img/placeholder.svg');
  const discount = product.on_sale && product.discount_percent > 0
    ? `<span class="badge badge-sale">−${Number(product.discount_percent)}%</span>`
    : '';
  const state = !product.for_sale ? '<span class="badge badge-muted">Nicht im Verkauf</span>' : '';
  return `
    <a class="product-card reveal" href="products.html?product=${encodeURIComponent(product.id)}" data-product-id="${escapeHtml(product.id)}">
      <div class="product-media">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" loading="lazy" data-fallback="assets/img/placeholder.svg">
        <div class="product-badges">
          <span class="badge badge-category">${escapeHtml(product.category)}</span>
          ${discount}${state}
        </div>
        <span class="product-arrow">${icon('arrow')}</span>
      </div>
      <div class="product-body">
        <div class="product-heading">
          <h3>${escapeHtml(product.name)}</h3>
          ${count > 0
            ? `<span class="rating-pill">${icon('star')} ${Number(avg).toFixed(1)}</span>`
            : '<span class="rating-pill rating-pill-new">Neu</span>'}
        </div>
        <p class="product-desc">${escapeHtml(truncate(product.description, 150))}</p>
        <div class="product-foot">
          ${priceHtml(product)}
          <span class="product-more">Details ${icon('arrow')}</span>
        </div>
      </div>
    </a>`;
}

export function skeletonCards(count = 3) {
  return Array.from({ length: count }, () => `
    <div class="product-card skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton-media"></div>
      <div class="product-body">
        <div class="skeleton skeleton-line w-70"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line w-90"></div>
        <div class="skeleton skeleton-line w-40"></div>
      </div>
    </div>`).join('');
}

export function emptyState(title, text, action = '') {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon('spark')}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      ${action}
    </div>`;
}

export function toast(message, type = 'info', timeout = 4600) {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastContainer);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const iconName = type === 'success' ? 'check' : type === 'error' ? 'x' : type === 'warning' ? 'clock' : 'spark';
  el.innerHTML = `<span class="toast-icon">${icon(iconName)}</span><span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  window.setTimeout(() => {
    el.classList.remove('is-visible');
    window.setTimeout(() => el.remove(), 260);
  }, timeout);
}

export function setLoading(button, loading, label = 'Bitte warten …') {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span><span>${escapeHtml(label)}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

export function openModal(html, options = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${options.size ? `modal-${options.size}` : ''}" role="dialog" aria-modal="true">
      <button class="modal-close" type="button" aria-label="Schließen">${icon('x')}</button>
      ${html}
    </div>`;
  document.body.appendChild(backdrop);
  document.body.classList.add('no-scroll');

  const close = () => {
    backdrop.classList.remove('is-open');
    document.body.classList.remove('no-scroll');
    window.setTimeout(() => backdrop.remove(), 220);
    document.removeEventListener('keydown', onKey);
    if (typeof options.onClose === 'function') options.onClose();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };

  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => backdrop.classList.add('is-open'));

  const focusable = backdrop.querySelector('input, textarea, select, button:not(.modal-close)');
  if (focusable) window.setTimeout(() => focusable.focus(), 120);
  return { element: backdrop, close };
}

export function confirmDialog({ title = 'Bestätigen', message = '', confirmText = 'Bestätigen', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const modal = openModal(`
      <h2 class="modal-title">${escapeHtml(title)}</h2>
      <p class="modal-text">${escapeHtml(message)}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" data-confirm="no">Abbrechen</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-confirm="yes">${escapeHtml(confirmText)}</button>
      </div>`, {
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }
    });
    modal.element.querySelector('[data-confirm="no"]').addEventListener('click', () => {
      settled = true;
      modal.close();
      resolve(false);
    });
    modal.element.querySelector('[data-confirm="yes"]').addEventListener('click', () => {
      settled = true;
      modal.close();
      resolve(true);
    });
  });
}

export function loginUrl(next = null) {
  const target = next || `${currentPageFile()}${window.location.search}`;
  return `login.html?next=${encodeURIComponent(safeNextUrl(target, 'index.html'))}`;
}

export function initReveal(root = document) {
  const nodes = root.querySelectorAll('.reveal:not(.in)');
  if (!('IntersectionObserver' in window)) {
    nodes.forEach((node) => node.classList.add('in'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  nodes.forEach((node) => observer.observe(node));
}

function footerHtml(profile) {
  const year = new Date().getFullYear();
  const discord = CONFIG.DISCORD_INVITE_URL
    ? `<a href="${escapeHtml(safeUrl(CONFIG.DISCORD_INVITE_URL, '#'))}" target="_blank" rel="noopener">Discord</a>`
    : '<span class="footer-muted">Discord-Link folgt</span>';
  return `
    <footer class="site-footer">
      <div class="container footer-grid">
        <div class="footer-brand">
          <a class="brand" href="index.html">
            <span class="brand-mark">${icon('play')}</span>
            <span class="brand-text">Ro-Tech <em>Hub</em></span>
          </a>
          <p>Premium Scripts, Assets und Tools für Roblox-Creator. Kuratiert, getestet und bereit für dein nächstes Projekt.</p>
          <div class="footer-social">${discord}</div>
        </div>
        <div class="footer-col">
          <h4>Entdecken</h4>
          <a href="products.html">Produkte</a>
          <a href="reviews.html">Bewertungen</a>
          <a href="index.html#how">So funktioniert's</a>
        </div>
        <div class="footer-col">
          <h4>Konto</h4>
          <a href="account.html">Mein Konto</a>
          <a href="reviews.html?tab=suggestion">Produkt vorschlagen</a>
          ${profile && isAdmin(profile) ? '<a href="admin.html">Verwaltung</a>' : ''}
        </div>
        <div class="footer-col">
          <h4>Status</h4>
          <span class="footer-status"><span class="status-dot"></span> Systeme online</span>
          <span class="footer-muted">Sichere Anmeldung via Supabase</span>
        </div>
      </div>
      <div class="container footer-bottom">
        <span>© ${year} Ro-Tech Hub. Alle Rechte vorbehalten.</span>
        <span>Kein offizielles Produkt von Roblox Corporation.</span>
      </div>
    </footer>`;
}

export function initLayout({ active = 'home', profile = null } = {}) {
  const headerHost = document.getElementById('site-header');
  const footerHost = document.getElementById('site-footer');
  document.body.dataset.page = active;

  if (headerHost) {
    const adminLink = profile && isAdmin(profile)
      ? `<a href="admin.html" data-nav="admin">Verwaltung</a>`
      : '';
    const authArea = profile
      ? `<a class="account-chip" href="account.html" title="Mein Konto">
           <span class="avatar">${escapeHtml((profile.username || '?').slice(0, 1).toUpperCase())}</span>
           <span class="account-meta"><strong>${escapeHtml(profile.username || 'Konto')}</strong><small>${escapeHtml(rankLabel(profile.rank))}</small></span>
         </a>`
      : `<a class="btn btn-primary btn-sm header-login" href="${loginUrl()}">Anmelden ${icon('arrow')}</a>`;
    const bell = profile
      ? `<div class="notif-wrap">
           <button class="icon-btn notif-bell" id="notif-bell" type="button" aria-label="Benachrichtigungen" aria-expanded="false">
             ${icon('bell')}<span class="notif-dot" id="notif-dot" hidden></span>
           </button>
           <div class="notif-panel" id="notif-panel" hidden></div>
         </div>`
      : '';

    headerHost.innerHTML = `
      <header class="site-header">
        <div class="header-inner container">
          <a class="brand" href="index.html" aria-label="Ro-Tech Hub Startseite">
            <span class="brand-mark">${icon('play')}</span>
            <span class="brand-text">Ro-Tech <em>Hub</em></span>
          </a>
          <nav class="main-nav" aria-label="Hauptnavigation">
            <a href="index.html" data-nav="home">Start</a>
            <a href="products.html" data-nav="products">Produkte</a>
            <a href="reviews.html" data-nav="reviews">Bewertungen</a>
            <a href="account.html" data-nav="account">Konto</a>
            ${adminLink}
          </nav>
          <div class="header-actions">
            <button class="icon-btn theme-toggle" id="theme-toggle" type="button" aria-label="Design wechseln" title="Hell / Dunkel">
              <span class="theme-icon theme-sun">${icon('sun')}</span>
              <span class="theme-icon theme-moon">${icon('moon')}</span>
            </button>
            ${bell}
            ${authArea}
          </div>
        </div>
      </header>`;

    headerHost.querySelectorAll('[data-nav]').forEach((link) => {
      if (link.dataset.nav === active) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
      }
    });

    const themeButton = document.getElementById('theme-toggle');
    themeButton?.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem('rth.theme', next);
      } catch (error) {
        /* Ignorieren */
      }
    });
  }

  if (footerHost) footerHost.innerHTML = footerHtml(profile);
  initReveal();
}

document.addEventListener('error', (event) => {
  const target = event.target;
  if (target instanceof HTMLImageElement && target.dataset.fallback && target.src.indexOf(target.dataset.fallback) === -1) {
    target.src = target.dataset.fallback;
  }
}, true);
