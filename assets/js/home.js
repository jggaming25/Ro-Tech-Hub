import { initApp } from './app.js';
import { supabase, isAdmin } from './supabase.js';
import {
  productCard, skeletonCards, initReveal, emptyState, stars, escapeHtml,
  formatDate, truncate, loginUrl
} from './ui.js';

const { profile } = await initApp('home');

const greeting = document.getElementById('hero-greeting');
if (greeting && profile) {
  greeting.textContent = `Willkommen zurück, ${profile.username}.`;
}

const grid = document.getElementById('latest-products');
if (grid) grid.innerHTML = skeletonCards(6);

function animateNumber(element, target, decimals = 0) {
  if (!element) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    element.textContent = Number(target).toLocaleString('de-DE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    return;
  }
  const end = Number(target) || 0;
  const duration = 900;
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = (end * eased).toLocaleString('de-DE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

try {
  const [productsResult, ratingsResult, reviewsResult] = await Promise.all([
    supabase.from('products').select('*').eq('visible', true).order('created_at', { ascending: false }),
    supabase.from('product_ratings').select('*'),
    supabase.from('reviews')
      .select('id, rating, content, created_at, products(name)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(3)
  ]);

  const products = productsResult.data || [];
  if (productsResult.error) throw productsResult.error;
  if (ratingsResult.error) throw ratingsResult.error;
  const ratings = ratingsResult.data || [];
  const reviewCount = ratings.reduce((sum, row) => sum + Number(row.review_count || 0), 0);
  const weighted = ratings.reduce((sum, row) => sum + Number(row.avg_rating || 0) * Number(row.review_count || 0), 0);
  const average = reviewCount ? weighted / reviewCount : 0;
  const categories = new Set(products.map((product) => product.category).filter(Boolean));

  animateNumber(document.getElementById('stat-products'), products.length);
  animateNumber(document.getElementById('stat-reviews'), reviewCount);
  animateNumber(document.getElementById('stat-rating'), average, 1);
  animateNumber(document.getElementById('stat-categories'), categories.size);

  if (grid) {
    if (!products.length) {
      grid.innerHTML = emptyState(
        'Noch keine Produkte',
        'Sobald der Master Admin Produkte anlegt, erscheinen sie hier.',
        isAdmin(profile) ? '<a class="btn btn-primary" href="admin.html?tab=products">Produkte anlegen</a>' : ''
      );
    } else {
      const ratingMap = new Map(ratings.map((rating) => [rating.product_id, rating]));
      grid.innerHTML = products.slice(0, 6).map((product) => productCard(product, ratingMap.get(product.id))).join('');
    }
  }

  const reviewsHost = document.getElementById('home-reviews');
  const reviewsSection = document.getElementById('home-reviews-section');
  const reviewData = reviewsResult.data || [];
  if (reviewsHost) {
    reviewsSection?.toggleAttribute('hidden', !reviewData.length);
    if (reviewData.length) {
      reviewsHost.innerHTML = reviewData.map((review) => `
        <article class="quote-card reveal">
          <div class="quote-stars">${stars(review.rating, { showValue: true })}</div>
          <p>„${escapeHtml(truncate(review.content, 190))}“</p>
          <footer>
            <span class="avatar avatar-soft">${escapeHtml((review.products?.name || 'R').slice(0, 1).toUpperCase())}</span>
            <span>
              <strong>${escapeHtml(review.products?.name || 'Produkt')}</strong>
              <small>Community-Bewertung · ${escapeHtml(formatDate(review.created_at))}</small>
            </span>
          </footer>
        </article>`).join('');
    }
  }
} catch (error) {
  console.error(error);
  if (grid) grid.innerHTML = emptyState('Produkte konnten nicht geladen werden', 'Bitte prüfe die Verbindung und lade die Seite neu.');
}

const welcomeCta = document.getElementById('hero-cta-account');
if (welcomeCta && !profile) {
  welcomeCta.href = loginUrl('account.html');
}

initReveal();
