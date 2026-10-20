import { initApp } from './app.js';
import { CONFIG } from './config.js';
import { supabase } from './supabase.js';
import {
  productCard, initReveal, emptyState, escapeHtml, safeUrl,
  priceHtml, formatPrice, effectivePrice, stars, toast, openModal, loginUrl, setLoading,
  icon
} from './ui.js';

const { session } = await initApp('products');

const grid = document.getElementById('products-grid');
const countLabel = document.getElementById('product-count');
const searchInput = document.getElementById('product-search');
const categoryChips = document.getElementById('category-chips');
const saleFilter = document.getElementById('filter-sale');
const discountFilter = document.getElementById('filter-discount');
const sortSelect = document.getElementById('sort-products');

const state = {
  products: [],
  ratings: new Map(),
  category: 'Alle',
  search: '',
  onlySale: false,
  onlyDiscount: false,
  sort: 'newest'
};

function purchaseLabel(type) {
  return type === 'subscription' ? 'Roblox-Abo' : type === 'free' ? 'Kostenlos' : 'Roblox Gamepass';
}

function robloxUrl(product) {
  if (product.purchase_type === 'subscription') {
    return product.roblox_subscription_id
      ? `${CONFIG.ROBLOX_SUBSCRIPTION_URL}${encodeURIComponent(product.roblox_subscription_id)}`
      : null;
  }
  return product.roblox_gamepass_id
    ? `${CONFIG.ROBLOX_GAMEPASS_URL}${encodeURIComponent(product.roblox_gamepass_id)}`
    : null;
}

function filteredProducts() {
  const term = state.search.trim().toLowerCase();
  const list = state.products.filter((product) => {
    if (state.category !== 'Alle' && product.category !== state.category) return false;
    if (state.onlySale && !product.for_sale) return false;
    if (state.onlyDiscount && !(product.on_sale && product.discount_percent > 0)) return false;
    if (term) {
      const haystack = `${product.name} ${product.description} ${product.category}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });

  const ratingOf = (product) => Number(state.ratings.get(product.id)?.avg_rating || 0);
  return list.sort((a, b) => {
    if (state.sort === 'price-asc') return effectivePrice(a) - effectivePrice(b);
    if (state.sort === 'price-desc') return effectivePrice(b) - effectivePrice(a);
    if (state.sort === 'rating') return ratingOf(b) - ratingOf(a) || new Date(b.created_at) - new Date(a.created_at);
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

function renderProducts() {
  if (!grid) return;
  const list = filteredProducts();
  if (countLabel) countLabel.textContent = `${list.length} ${list.length === 1 ? 'Produkt' : 'Produkte'}`;
  grid.innerHTML = list.length
    ? list.map((product) => productCard(product, state.ratings.get(product.id))).join('')
    : emptyState('Keine Produkte gefunden', 'Passe Suche oder Filter an, um mehr Produkte zu sehen.');
  initReveal(grid);
}

function renderCategories() {
  if (!categoryChips) return;
  const categories = [...new Set(state.products.map((product) => product.category).filter(Boolean))].sort();
  categoryChips.innerHTML = ['Alle', ...categories].map((category) => `
    <button type="button" class="chip${state.category === category ? ' is-active' : ''}" data-category="${escapeHtml(category)}">
      ${escapeHtml(category)}
    </button>`).join('');
}

function productModal(product) {
  const rating = state.ratings.get(product.id);
  const avg = Number(rating?.avg_rating || 0);
  const count = Number(rating?.review_count || 0);
  const image = safeUrl(product.image_url, 'assets/img/placeholder.svg');
  const isFree = product.purchase_type === 'free' || Number(product.price) <= 0;
  const buyLabel = !product.for_sale
    ? 'Nicht im Verkauf'
    : isFree
      ? 'Kostenlos herunterladen'
      : 'Jetzt kaufen';

  const modal = openModal(`
    <div class="product-detail">
      <div class="detail-media">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" data-fallback="assets/img/placeholder.svg">
        <div class="detail-media-badges">
          <span class="badge badge-category">${escapeHtml(product.category)}</span>
          ${product.on_sale && product.discount_percent > 0 ? `<span class="badge badge-sale">−${Number(product.discount_percent)}%</span>` : ''}
        </div>
      </div>
      <div class="detail-body">
        <div class="detail-kicker">${escapeHtml(purchaseLabel(product.purchase_type))}</div>
        <h2>${escapeHtml(product.name)}</h2>
        <div class="detail-rating">
          ${stars(avg, { showValue: true })}
          <span>${count ? `${count} Bewertung${count === 1 ? '' : 'en'}` : 'Noch keine Bewertungen'}</span>
        </div>
        <p class="detail-desc">${escapeHtml(product.description)}</p>
        <div class="detail-facts">
          <span>${icon('tag')} ${product.on_sale && product.discount_percent > 0 ? `Aktion · ${product.discount_percent}% Rabatt` : 'Regulärer Preis'}</span>
          <span>${icon('box')} ${escapeHtml(product.for_sale ? 'Zum Verkauf' : 'Nicht im Verkauf')}</span>
        </div>
        <div class="detail-buy">
          <div class="detail-price">${priceHtml(product)}</div>
          <button class="btn btn-primary btn-lg" type="button" id="detail-buy-button" ${product.for_sale ? '' : 'disabled'}>
            ${escapeHtml(buyLabel)} ${icon('arrow')}
          </button>
        </div>
        <p class="detail-note">
          ${isFree
            ? 'Bei kostenlosen Produkten öffnet sich der hinterlegte Download-Link.'
            : 'Der Kauf erfolgt sicher über Roblox. Nach der Zahlung wird dein Kauf geprüft und die Discord-Rolle automatisch vergeben.'}
        </p>
      </div>
    </div>`, {
    size: 'lg',
    onClose: () => {
      const url = new URL(window.location.href);
      if (url.searchParams.get('product') === product.id) {
        url.searchParams.delete('product');
        window.history.replaceState({}, '', url);
      }
    }
  });

  modal.element.querySelector('#detail-buy-button')?.addEventListener('click', () => {
    if (!product.for_sale) return;
    if (isFree) {
      const download = safeUrl(product.download_url, '');
      if (!download) {
        toast('Für dieses Produkt ist noch kein Download-Link hinterlegt.', 'warning');
        return;
      }
      window.open(download, '_blank', 'noopener');
      return;
    }
    if (!session) {
      window.location.href = loginUrl(`products.html?product=${product.id}`);
      return;
    }
    modal.close();
    buyModal(product);
  });
}

function buyModal(product) {
  const url = robloxUrl(product);
  const modal = openModal(`
    <div class="buy-head">
      <span class="buy-icon">${icon('box')}</span>
      <div>
        <h2 class="modal-title">${escapeHtml(product.name)}</h2>
        <p class="modal-text">Kauf über ${escapeHtml(purchaseLabel(product.purchase_type))} · ${escapeHtml(formatPrice(effectivePrice(product), product.currency))}</p>
      </div>
    </div>
    <div class="buy-steps">
      <div><span>1</span><p>Roblox-Kauf abschließen</p></div>
      <div><span>2</span><p>Daten hier bestätigen</p></div>
      <div><span>3</span><p>Discord-Rolle & Download</p></div>
    </div>
    <form id="buy-form" class="form-stack">
      <div class="field">
        <label for="buy-roblox">Roblox-Nutzername</label>
        <input id="buy-roblox" name="roblox" type="text" required maxlength="60" placeholder="Dein Roblox-Name" autocomplete="username">
      </div>
      <div class="field">
        <label for="buy-receipt">Beleg / Transaktions-ID <span class="optional">(optional)</span></label>
        <input id="buy-receipt" name="receipt" type="text" maxlength="120" placeholder="z. B. aus der Roblox-Transaktionshistorie">
      </div>
      <div class="form-alert form-alert-warning" id="buy-message" hidden></div>
      <p class="form-hint">Beim Absenden wird Roblox in einem neuen Tab geöffnet. Falls das nicht passiert, erlaube Pop-ups für diese Seite.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" data-close-buy>Abbrechen</button>
        <button class="btn btn-primary" type="submit">${escapeHtml(formatPrice(effectivePrice(product), product.currency))} · Weiter zu Roblox</button>
      </div>
    </form>`, { size: 'md' });

  const form = modal.element.querySelector('#buy-form');
  const message = modal.element.querySelector('#buy-message');
  modal.element.querySelector('[data-close-buy]')?.addEventListener('click', () => modal.close());

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (message) message.hidden = true;

    if (!url) {
      if (message) {
        message.hidden = false;
        message.textContent = 'Für dieses Produkt ist noch keine Roblox-ID hinterlegt. Bitte wende dich an das Team.';
      }
      return;
    }

    const roblox = form.roblox.value.trim();
    if (!roblox) {
      if (message) {
        message.hidden = false;
        message.textContent = 'Bitte deinen Roblox-Nutzernamen eingeben.';
      }
      return;
    }

    window.open(url, '_blank', 'noopener');
    const submit = form.querySelector('button[type="submit"]');
    setLoading(submit, true, 'Bestellung wird erstellt …');

    const { error } = await supabase.rpc('create_purchase', {
      p_product_id: product.id,
      p_roblox_username: roblox,
      p_roblox_receipt: form.receipt.value.trim() || null
    });

    setLoading(submit, false);

    if (error) {
      if (message) {
        message.hidden = false;
        message.textContent = error.message;
      }
      return;
    }

    modal.element.querySelector('.modal')?.classList.add('is-success');
    modal.element.querySelector('.modal-close')?.click();

    const success = openModal(`
      <div class="success-panel">
        <span class="success-icon">${icon('check')}</span>
        <h2>Bestellung eingereicht</h2>
        <p>Der Roblox-Kauf wurde geöffnet. Sobald die Zahlung durch das Team bestätigt wurde, vergibt der Discord-Bot automatisch deine Rolle. Danach findest du den Download im passenden Discord-Kanal.</p>
        <div class="modal-actions">
          <a class="btn btn-ghost" href="account.html">Zum Konto</a>
          <button class="btn btn-primary" type="button" data-success-close>Verstanden</button>
        </div>
      </div>`, { size: 'sm' });
    success.element.querySelector('[data-success-close]')?.addEventListener('click', () => success.close());
  });
}

function openProductById(id, { fromUrl = false } = {}) {
  const product = state.products.find((entry) => entry.id === id);
  if (!product) {
    toast('Produkt wurde nicht gefunden.', 'warning');
    return;
  }
  if (!fromUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('product', product.id);
    window.history.replaceState({}, '', url);
  }
  productModal(product);
}

grid?.addEventListener('click', (event) => {
  const card = event.target.closest('.product-card');
  if (!card || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openProductById(card.dataset.productId);
});

searchInput?.addEventListener('input', () => {
  state.search = searchInput.value;
  renderProducts();
});

saleFilter?.addEventListener('change', () => {
  state.onlySale = saleFilter.checked;
  renderProducts();
});

discountFilter?.addEventListener('change', () => {
  state.onlyDiscount = discountFilter.checked;
  renderProducts();
});

sortSelect?.addEventListener('change', () => {
  state.sort = sortSelect.value;
  renderProducts();
});

categoryChips?.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-category]');
  if (!chip) return;
  state.category = chip.dataset.category;
  categoryChips.querySelectorAll('.chip').forEach((entry) => entry.classList.toggle('is-active', entry === chip));
  renderProducts();
});

try {
  const [productsResult, ratingsResult] = await Promise.all([
    supabase.from('products').select('*').eq('visible', true).order('created_at', { ascending: false }),
    supabase.from('product_ratings').select('*')
  ]);

  if (productsResult.error) throw productsResult.error;
  state.products = productsResult.data || [];
  (ratingsResult.data || []).forEach((rating) => state.ratings.set(rating.product_id, rating));

  renderCategories();
  renderProducts();

  const requested = new URLSearchParams(window.location.search).get('product');
  if (requested) openProductById(requested, { fromUrl: true });
} catch (error) {
  console.error(error);
  if (grid) grid.innerHTML = emptyState('Produkte konnten nicht geladen werden', 'Bitte lade die Seite neu oder prüfe später erneut.');
}
