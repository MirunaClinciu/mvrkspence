const navigationItems = [
    { label: 'Home', href: 'index.html', page: 'home' },
    { label: 'Concept', href: 'concept.html', page: 'concept' },
    { label: 'Artwork', href: 'artwork.html', page: 'artwork' },
    { label: 'Contact', href: 'contact.html', page: 'contact' }
];

const page = document.body.dataset.page;
const pageContent = document.getElementById('page-content');
const siteHeader = document.getElementById('site-header');
const siteFooter = document.getElementById('site-footer');
const siteModalRoot = document.getElementById('site-modal-root');

window.siteConfig = null;
window.siteProducts = [];
window.siteReady = false;

function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function safeImagePath(path) {
    if (typeof path !== 'string' || !path.trim()) return '';
    try {
        const url = new URL(path, window.location.href);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
        if (url.origin !== window.location.origin) return '';
        return url.href;
    } catch (error) {
        console.error('Invalid image URL in site content.', error);
        return '';
    }
}

function safeLinkPath(path) {
    if (typeof path !== 'string' || !path.trim()) return 'index.html';
    try {
        const url = new URL(path, window.location.href);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'index.html';
        if (url.origin !== window.location.origin) return 'index.html';
        return url.href;
    } catch (error) {
        console.error('Invalid link in site content.', error);
        return 'index.html';
    }
}

function renderNavigation() {
    const nav = makeElement('nav', 'site-nav');
    nav.setAttribute('aria-label', 'Main navigation');

    const brand = document.createElement('a');
    brand.className = 'brand';
    brand.href = 'index.html';
    brand.setAttribute('aria-label', 'Mvrk Spence home');
    const logo = document.createElement('img');
    logo.src = 'stuff/img/logo.png';
    logo.alt = 'Mvrk Spence';
    brand.append(logo);

    const toggle = makeElement('button', 'menu-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'primary-navigation');
    toggle.setAttribute('aria-label', 'Open navigation');
    toggle.innerHTML = '<span></span><span></span><span></span>';

    const links = makeElement('div', 'nav-links');
    links.id = 'primary-navigation';
    const list = makeElement('ul');
    navigationItems.forEach(item => {
        const listItem = document.createElement('li');
        const link = makeElement('a', item.page === page ? 'nav-link active' : 'nav-link', item.label);
        link.href = item.href;
        if (item.page === page) link.setAttribute('aria-current', 'page');
        listItem.append(link);
        list.append(listItem);
    });

    const basketButton = makeElement('button', 'basket-link');
    basketButton.type = 'button';
    basketButton.id = 'desktop-basket-link';
    basketButton.setAttribute('aria-label', 'Open shopping basket');
    basketButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 8h14l-1 13H6L5 8Zm4 0V6a3 3 0 0 1 6 0v2" /></svg><span class="cart-count" id="nav-cart-count-root" hidden>0</span>';
    list.append(basketButton);
    links.append(list);

    nav.append(brand, toggle, links);
    siteHeader.replaceChildren(nav);

    toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));
        toggle.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
        nav.classList.toggle('menu-open', !expanded);
    });
    links.addEventListener('click', event => {
        if (event.target.closest('a')) {
            nav.classList.remove('menu-open');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', 'Open navigation');
        }
    });
}

function renderModal() {
    const overlay = makeElement('div', 'modal-overlay');
    overlay.id = 'shopping-cart-modal';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <section class="modal-content" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <button class="modal-close-btn" id="close-cart-modal" type="button" aria-label="Close basket">&times;</button>
        <p class="eyebrow">Your selection</p>
        <h2 id="cart-title">Shopping basket</h2>
        <div id="cart-items-container"></div>
        <p class="cart-total">Total <strong id="cart-total-amount">0.00</strong></p>
        <div id="paypal-buttons" class="paypal-buttons"></div>
        <p class="cart-status" id="cart-status" role="status" aria-live="polite"></p>
        <button class="text-button" id="clear-basket-btn" type="button">Clear basket</button>
      </section>`;
    siteModalRoot.replaceChildren(overlay);

    document.getElementById('desktop-basket-link').addEventListener('click', openShoppingBasket);
    document.getElementById('close-cart-modal').addEventListener('click', closeShoppingBasket);
    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeShoppingBasket();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && overlay.classList.contains('show')) closeShoppingBasket();
    });
}

function openShoppingBasket() {
    const overlay = document.getElementById('shopping-cart-modal');
    if (!overlay) return;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('close-cart-modal').focus();
    window.dispatchEvent(new CustomEvent('basket:open'));
}

function closeShoppingBasket() {
    const overlay = document.getElementById('shopping-cart-modal');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
}

function renderFooter() {
    const footer = makeElement('div', 'footer-inner');
    const copyright = makeElement('p', '', `© ${new Date().getFullYear()} Mvrk Spence`);
    const links = document.createElement('nav');
    links.setAttribute('aria-label', 'Footer');
    navigationItems.forEach(item => {
        const link = makeElement('a', '', item.label);
        link.href = item.href;
        links.append(link);
    });
    const admin = makeElement('a', 'admin-link', 'Admin');
    admin.href = 'admin/';
    admin.setAttribute('aria-label', 'Open site administration');
    footer.append(copyright, links, admin);
    siteFooter.className = 'site-footer';
    siteFooter.replaceChildren(footer);
}

function renderPageIntro(data) {
    const intro = makeElement('section', 'page-intro');
    if (data.eyebrow) intro.append(makeElement('p', 'eyebrow', data.eyebrow));
    intro.append(makeElement('h1', '', data.title || 'Mvrk Spence'));
    if (data.intro) intro.append(makeElement('p', 'intro-copy', data.intro));
    return intro;
}

function renderHome(data) {
    const intro = makeElement('section', 'home-intro');
    intro.append(makeElement('p', 'eyebrow', data.eyebrow || 'Photography · Concepts · Artwork'));
    intro.append(makeElement('h1', '', data.title || 'Mvrk Spence'));
    if (data.intro) intro.append(makeElement('p', 'intro-copy', data.intro));

    const cards = makeElement('section', 'home-cards');
    cards.setAttribute('aria-label', 'Explore the work');
    (Array.isArray(data.cards) ? data.cards : []).forEach(card => {
        if (!card || typeof card.title !== 'string') return;
        const link = makeElement('a', 'home-card');
        link.href = safeLinkPath(card.link);
        const imagePath = safeImagePath(card.image);
        if (imagePath) {
            const image = document.createElement('img');
            image.src = imagePath;
            image.alt = typeof card.alt === 'string' ? card.alt : card.title;
            image.loading = 'lazy';
            link.append(image);
        }
        link.append(makeElement('span', 'home-card-title', card.title));
        cards.append(link);
    });
    pageContent.replaceChildren(intro, cards);
}

function renderConcept(data) {
    const intro = renderPageIntro(data);
    const feature = makeElement('section', 'concept-feature');
    const copy = makeElement('div', 'concept-copy');
    copy.append(makeElement('h2', '', 'The thinking behind the work'));
    if (data.body) copy.append(makeElement('p', '', data.body));
    const imagePath = safeImagePath(data.image);
    if (imagePath) {
        const figure = makeElement('figure', 'concept-image');
        const image = document.createElement('img');
        image.src = imagePath;
        image.alt = typeof data.imageAlt === 'string' ? data.imageAlt : '';
        image.loading = 'lazy';
        figure.append(image);
        feature.append(copy, figure);
    } else {
        feature.append(copy);
    }

    const galleryItems = Array.isArray(data.gallery) ? data.gallery : [];
    if (galleryItems.length) {
        const gallery = makeElement('section', 'concept-gallery');
        gallery.setAttribute('aria-label', 'Concept image gallery');
        galleryItems.forEach(item => {
            const src = item && safeImagePath(item.image);
            if (!src) return;
            const figure = makeElement('figure', 'gallery-item');
            const image = document.createElement('img');
            image.src = src;
            image.alt = typeof item.alt === 'string' ? item.alt : '';
            image.loading = 'lazy';
            figure.append(image);
            if (item.caption) figure.append(makeElement('figcaption', '', item.caption));
            gallery.append(figure);
        });
        pageContent.replaceChildren(intro, feature, gallery);
        return;
    }
    pageContent.replaceChildren(intro, feature);
}

function renderArtwork(data) {
    const intro = renderPageIntro(data);
    const productList = makeElement('section', 'product-grid');
    productList.id = 'product-list';
    productList.setAttribute('aria-label', 'Available artwork');
    const activeProducts = window.siteProducts.filter(product => product.available !== false);

    if (activeProducts.length === 0) {
        const empty = makeElement('div', 'empty-state');
        empty.append(
            makeElement('h2', '', 'New work coming soon'),
            makeElement('p', '', 'Please get in touch if you would like to enquire about a piece.')
        );
        const contact = makeElement('a', 'button button-outline', 'Contact');
        contact.href = 'contact.html';
        pageContent.replaceChildren(intro, empty, contact);
        return;
    }

    activeProducts.forEach(product => {
        const card = makeElement('article', 'product-card');
        card.dataset.productId = product.id;
        const imagePath = safeImagePath(product.image);
        if (imagePath) {
            const image = document.createElement('img');
            image.src = imagePath;
            image.alt = product.imageAlt || product.name;
            image.loading = 'lazy';
            card.append(image);
        }
        const details = makeElement('div', 'product-details');
        details.append(makeElement('h2', '', product.name));
        if (product.description) details.append(makeElement('p', '', product.description));
        const footer = makeElement('div', 'product-footer');
        footer.append(makeElement('span', 'product-price', formatPrice(product.price, data.currency)));
        const addButton = makeElement('button', 'button add-to-basket-btn', 'Add to basket');
        addButton.type = 'button';
        addButton.dataset.productId = product.id;
        footer.append(addButton);
        details.append(footer);
        card.append(details);
        productList.append(card);
    });
    pageContent.replaceChildren(intro, productList);
}

function renderContact(data) {
    const intro = renderPageIntro(data);
    const panel = makeElement('section', 'contact-panel');
    if (data.details) panel.append(makeElement('p', '', data.details));
    if (typeof data.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        const email = makeElement('a', 'contact-email', data.email);
        email.href = `mailto:${data.email}`;
        panel.append(email);
    }
    const socials = makeElement('div', 'social-links');
    (Array.isArray(data.socialLinks) ? data.socialLinks : []).forEach(item => {
        if (!item || typeof item.label !== 'string' || typeof item.url !== 'string') return;
        try {
            const url = new URL(item.url);
            if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
            const link = makeElement('a', 'text-button', item.label);
            link.href = url.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            socials.append(link);
        } catch (error) {
            console.error('Invalid social link in contact content.', error);
        }
    });
    panel.append(socials);
    pageContent.replaceChildren(intro, panel);
}

function formatPrice(price, currency) {
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount < 0) return '';
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: typeof currency === 'string' ? currency : 'USD'
        }).format(amount);
    } catch (error) {
        console.error('Invalid shop currency in site content.', error);
        return `${amount.toFixed(2)} ${currency || 'USD'}`;
    }
}

async function loadJson(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
    return response.json();
}

renderNavigation();
renderModal();
renderFooter();

(async function initializeSite() {
    try {
        const config = await loadJson('content/shop.json');
        window.siteConfig = config;
        const productIds = new Set();
        window.siteProducts = Array.isArray(config.products)
            ? config.products.filter(product => {
                const valid =
                    product &&
                    typeof product.id === 'string' &&
                    /^[A-Za-z0-9._-]{1,80}$/.test(product.id) &&
                    !productIds.has(product.id) &&
                    typeof product.name === 'string' &&
                    product.name.trim() !== '' &&
                    /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(product.price)) &&
                    Number.isSafeInteger(Math.round(Number(product.price) * 100)) &&
                    Number(product.price) > 0;
                if (!valid) {
                    console.error('Ignoring an invalid or duplicate product in the shop settings.');
                    return false;
                }
                productIds.add(product.id);
                return true;
            })
            : [];
        window.siteReady = true;
        window.dispatchEvent(new CustomEvent('site:ready'));

        if (page === 'artwork') {
            renderArtwork(config);
            const title = document.querySelector('#page-content h1');
            if (title && config.title) document.title = `Mvrk Spence | ${config.title}`;
            return;
        }

        const data = await loadJson(`content/${page}.json`);
        if (page === 'home') renderHome(data);
        else if (page === 'concept') renderConcept(data);
        else if (page === 'contact') renderContact(data);
        if (data.title) document.title = `Mvrk Spence | ${data.title}`;
    } catch (error) {
        console.error('Unable to load website content.', error);
        pageContent.replaceChildren(
            makeElement('section', 'empty-state', 'This page could not be loaded. Please try again later.')
        );
    }
})();
