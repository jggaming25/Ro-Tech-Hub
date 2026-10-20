import { initApp } from './app.js';
import { CONFIG } from './config.js';
import { supabase } from './supabase.js';
import {
  escapeHtml, formatDate, initReveal, emptyState, statusBadge, stars, toast,
  setLoading, loginUrl, safeUrl, icon, confirmDialog
} from './ui.js';

const { session, profile } = await initApp('reviews');

const params = new URLSearchParams(window.location.search);
const reviewForm = document.getElementById('review-form');
const suggestionForm = document.getElementById('suggestion-form');
const productSelect = document.getElementById('review-product');
const contentInput = document.getElementById('review-content');
const counter = document.getElementById('review-counter');
const ratingButtons = [...document.querySelectorAll('#rating-input [data-rating]')];
const authGate = document.getElementById('review-auth-gate');
const myReviewsHost = document.getElementById('my-reviews');
const mySuggestionsHost = document.getElementById('my-suggestions');
const myEmpty = document.getElementById('my-empty');
const suggestionCounter = document.getElementById('suggestion-counter');

let rating = 0;
let products = [];

function visibleCharacters(value) {
  return String(value || '').replace(/\s/g, '').length;
}

function paintRating(value) {
  ratingButtons.forEach((button) => {
    const active = Number(button.dataset.rating) <= value;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-checked', String(Number(button.dataset.rating) === rating));
  });
}

ratingButtons.forEach((button) => {
  button.addEventListener('click', () => {
    rating = Number(button.dataset.rating);
    paintRating(rating);
  });
  button.addEventListener('mouseenter', () => paintRating(Number(button.dataset.rating)));
  button.addEventListener('mouseleave', () => paintRating(rating));
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      rating = Math.min(5, rating + 1);
      paintRating(rating);
      ratingButtons[rating - 1]?.focus();
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      rating = Math.max(1, rating - 1);
      paintRating(rating);
      ratingButtons[rating - 1]?.focus();
    }
  });
});

function updateCounter() {
  if (!counter) return;
  const count = visibleCharacters(contentInput?.value);
  counter.textContent = `${count} / ${CONFIG.REVIEW_MAX_CHARS} Zeichen (ohne Leerzeichen)`;
  counter.classList.toggle('is-over', count > CONFIG.REVIEW_MAX_CHARS);
}

contentInput?.addEventListener('input', updateCounter);
suggestionForm?.description?.addEventListener('input', () => {
  if (!suggestionCounter) return;
  suggestionCounter.textContent = `${suggestionForm.description.value.length} / 2000 Zeichen`;
});

function switchTab(name, updateUrl = true) {
  document.querySelectorAll('[data-review-tab]').forEach((tab) => {
    const active = tab.dataset.reviewTab === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-review-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.reviewPanel !== name;
  });
  if (updateUrl) {
    const url = new URL(window.location.href);
    if (name === 'review') url.searchParams.delete('tab');
    else url.searchParams.set('tab', name);
    window.history.replaceState({}, '', url);
  }
  initReveal();
}

document.querySelectorAll('[data-review-tab]').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.reviewTab));
});

function renderGate() {
  if (!authGate) return;
  if (profile) {
    authGate.hidden = true;
    if (reviewForm) reviewForm.hidden = false;
    if (suggestionForm) suggestionForm.hidden = false;
    return;
  }
  authGate.hidden = false;
  authGate.innerHTML = `
    <div class="gate-card">
      <span class="gate-icon">${icon('lock')}</span>
      <div>
        <h3>Anmeldung erforderlich</h3>
        <p>Melde dich an, um Bewertungen und Produktvorschläge einzureichen.</p>
      </div>
      <a class="btn btn-primary" href="${loginUrl('reviews.html')}">Anmelden ${icon('arrow')}</a>
    </div>`;
  if (reviewForm) reviewForm.hidden = true;
  if (suggestionForm) suggestionForm.hidden = true;
  const mine = document.querySelector('[data-review-panel="mine"]');
  if (mine) {
    mine.innerHTML = `
      <div class="gate-card">
        <span class="gate-icon">${icon('lock')}</span>
        <div>
          <h3>Deine Beiträge</h3>
          <p>Melde dich an, um den Status deiner Einreichungen zu sehen.</p>
        </div>
        <a class="btn btn-primary" href="${loginUrl('reviews.html?tab=mine')}">Anmelden ${icon('arrow')}</a>
      </div>`;
  }
}

async function loadMySubmissions() {
  if (!profile || !myReviewsHost || !mySuggestionsHost) return;
  const [reviewsResult, suggestionsResult] = await Promise.all([
    supabase.from('reviews')
      .select('*, products(name)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false }),
    supabase.from('product_suggestions')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
  ]);

  const reviews = reviewsResult.data || [];
  const suggestions = suggestionsResult.data || [];

  myReviewsHost.innerHTML = reviews.length
    ? reviews.map((review) => `
      <article class="submission-card reveal">
        <div class="submission-head">
          <div>
            <strong>${escapeHtml(review.products?.name || 'Produkt')}</strong>
            <small>${escapeHtml(formatDate(review.created_at, true))}</small>
          </div>
          ${statusBadge(review.status)}
        </div>
        <div class="submission-rating">${stars(review.rating, { showValue: true })}</div>
        <p>${escapeHtml(review.content)}</p>
        ${review.moderation_note ? `<div class="submission-note">Hinweis: ${escapeHtml(review.moderation_note)}</div>` : ''}
        ${review.status === 'pending' ? `<button class="text-btn text-btn-danger" type="button" data-delete-review="${escapeHtml(review.id)}">Bewertung zurückziehen</button>` : ''}
      </article>`).join('')
    : '';

  mySuggestionsHost.innerHTML = suggestions.length
    ? suggestions.map((suggestion) => `
      <article class="submission-card reveal">
        <div class="submission-head">
          <div>
            <strong>${escapeHtml(suggestion.name)}</strong>
            <small>${escapeHtml(formatDate(suggestion.created_at, true))}${suggestion.category ? ` · ${escapeHtml(suggestion.category)}` : ''}</small>
          </div>
          ${statusBadge(suggestion.status)}
        </div>
        <p>${escapeHtml(suggestion.description)}</p>
        ${suggestion.link ? `<a class="text-btn" href="${escapeHtml(safeUrl(suggestion.link, '#'))}" target="_blank" rel="noopener">Link ansehen</a>` : ''}
        ${suggestion.admin_note ? `<div class="submission-note">Hinweis: ${escapeHtml(suggestion.admin_note)}</div>` : ''}
        ${suggestion.status === 'pending' ? `<button class="text-btn text-btn-danger" type="button" data-delete-suggestion="${escapeHtml(suggestion.id)}">Vorschlag zurückziehen</button>` : ''}
      </article>`).join('')
    : '';

  if (myEmpty) myEmpty.hidden = reviews.length + suggestions.length > 0;
  initReveal(document.querySelector('[data-review-panel="mine"]') || document);
}

async function loadLatestReviews() {
  const host = document.getElementById('latest-reviews');
  if (!host) return;
  const { data } = await supabase.from('reviews')
    .select('id, rating, content, created_at, products(name)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(6);

  const section = document.getElementById('latest-reviews-section');
  if (!data?.length) {
    section?.setAttribute('hidden', '');
    return;
  }
  section?.removeAttribute('hidden');

  host.innerHTML = data.map((review) => `
    <article class="quote-card reveal">
      <div class="quote-stars">${stars(review.rating, { showValue: true })}</div>
      <p>„${escapeHtml(review.content)}“</p>
      <footer>
        <span class="avatar avatar-soft">${escapeHtml((review.products?.name || 'R').slice(0, 1).toUpperCase())}</span>
        <span>
          <strong>${escapeHtml(review.products?.name || 'Produkt')}</strong>
          <small>${escapeHtml(formatDate(review.created_at))}</small>
        </span>
      </footer>
    </article>`).join('');
  initReveal(host);
}

reviewForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!profile) {
    window.location.href = loginUrl('reviews.html');
    return;
  }

  const productId = reviewForm.product.value;
  const content = contentInput.value.trim();
  const count = visibleCharacters(content);
  const submit = reviewForm.querySelector('button[type="submit"]');
  const message = document.getElementById('review-form-message');

  if (!productId) {
    toast('Bitte wähle ein Produkt aus.', 'warning');
    return;
  }
  if (rating < 1) {
    toast('Bitte vergebe 1 bis 5 Sterne.', 'warning');
    return;
  }
  if (count < 1 || count > CONFIG.REVIEW_MAX_CHARS) {
    toast(`Deine Bewertung muss 1–${CONFIG.REVIEW_MAX_CHARS} Zeichen (ohne Leerzeichen) enthalten.`, 'warning');
    return;
  }

  if (message) message.hidden = true;
  setLoading(submit, true, 'Wird eingereicht …');
  const { error } = await supabase.from('reviews').insert({
    product_id: productId,
    rating,
    content
  });
  setLoading(submit, false);

  if (error) {
    if (message) {
      message.hidden = false;
      message.className = 'form-alert form-alert-error';
      message.textContent = error.code === '23505'
        ? 'Du hast dieses Produkt bereits bewertet.'
        : error.message;
    } else {
      toast(error.message, 'error');
    }
    return;
  }

  toast('Bewertung eingereicht. Ein Admin prüft sie jetzt.', 'success');
  reviewForm.reset();
  rating = 0;
  paintRating(0);
  updateCounter();
  await loadMySubmissions();
  switchTab('mine');
});

suggestionForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!profile) {
    window.location.href = loginUrl('reviews.html?tab=suggestion');
    return;
  }

  const name = suggestionForm.elements.name.value.trim();
  const description = suggestionForm.description.value.trim();
  const category = suggestionForm.category.value.trim();
  const link = suggestionForm.link.value.trim();
  const submit = suggestionForm.querySelector('button[type="submit"]');
  const message = document.getElementById('suggestion-form-message');

  if (name.length < 2) {
    toast('Bitte gib einen Produktnamen an (min. 2 Zeichen).', 'warning');
    return;
  }
  if (description.length < 5) {
    toast('Bitte beschreibe deinen Vorschlag etwas genauer.', 'warning');
    return;
  }
  if (link && !safeUrl(link, '')) {
    toast('Der Link ist ungültig. Bitte verwende eine http(s)-URL.', 'warning');
    return;
  }

  if (message) message.hidden = true;
  setLoading(submit, true, 'Wird eingereicht …');
  const { error } = await supabase.from('product_suggestions').insert({
    name,
    description,
    category: category || null,
    link: link || null
  });
  setLoading(submit, false);

  if (error) {
    if (message) {
      message.hidden = false;
      message.className = 'form-alert form-alert-error';
      message.textContent = error.message;
    } else {
      toast(error.message, 'error');
    }
    return;
  }

  toast('Danke! Dein Produktvorschlag wartet auf Prüfung.', 'success');
  suggestionForm.reset();
  if (suggestionCounter) suggestionCounter.textContent = '0 / 2000 Zeichen';
  await loadMySubmissions();
  switchTab('mine');
});

document.getElementById('my-submissions')?.addEventListener('click', async (event) => {
  const reviewButton = event.target.closest('[data-delete-review]');
  const suggestionButton = event.target.closest('[data-delete-suggestion]');
  if (!reviewButton && !suggestionButton) return;

  const ok = await confirmDialog({
    title: 'Einreichung zurückziehen?',
    message: 'Dieser Beitrag wird dauerhaft gelöscht.',
    confirmText: 'Zurückziehen',
    danger: true
  });
  if (!ok) return;

  if (reviewButton) {
    await supabase.from('reviews').delete().eq('id', reviewButton.dataset.deleteReview);
  } else {
    await supabase.from('product_suggestions').delete().eq('id', suggestionButton.dataset.deleteSuggestion);
  }
  toast('Einreichung zurückgezogen.', 'success');
  await loadMySubmissions();
});

try {
  const { data, error } = await supabase.from('products').select('id, name, category').eq('visible', true).order('name');
  if (error) throw error;
  products = data || [];
  if (productSelect) {
    productSelect.innerHTML = '<option value="">Produkt auswählen …</option>' + products.map((product) => (
      `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)} · ${escapeHtml(product.category)}</option>`
    )).join('');
    const preselect = params.get('product');
    if (preselect && products.some((product) => product.id === preselect)) {
      productSelect.value = preselect;
    }
  }
} catch (error) {
  console.error(error);
  toast('Produkte konnten nicht geladen werden.', 'error');
}

renderGate();
updateCounter();
paintRating(0);
const initialTab = params.get('tab');
if (initialTab === 'suggestion' || initialTab === 'mine') switchTab(initialTab, false);
await Promise.all([loadLatestReviews(), profile ? loadMySubmissions() : Promise.resolve()]);
initReveal();
