const navigationItems = [
    { label: 'Home', href: 'index.html', page: 'home' },
    { label: 'Concept', href: 'concept.html', page: 'concept' },
    { label: 'Artwork', href: 'artwork.html', page: 'artwork' },
    { label: 'Contact', href: 'contact.html', page: 'contact' }
];

const page = document.body.dataset.page;
const pagePrefix = document.body.dataset.sitePrefix || '/';
const pageContent = document.getElementById('page-content');
const siteHeader = document.getElementById('site-header');
const siteFooter = document.getElementById('site-footer');
const siteModalRoot = document.getElementById('site-modal-root');

window.siteConfig = null;
window.siteSettings = null;
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
        const url = new URL(path, document.baseURI);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
        if (url.origin !== window.location.origin) return '';
        return url.href;
    } catch (error) {
        console.error('Invalid image URL in site content.', error);
        return '';
    }
}

function safeLinkPath(path) {
    const homePage = `${pagePrefix}index.html`;
    if (typeof path !== 'string' || !path.trim()) return homePage;
    try {
        const url = new URL(path, document.baseURI);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return homePage;
        if (url.origin !== window.location.origin) return homePage;
        const pagePath = url.pathname.replace(/^\/+/, '').replace(/^preview\//, '');
        return `${pagePrefix}${pagePath}${url.search}${url.hash}`;
    } catch (error) {
        console.error('Invalid link in site content.', error);
        return homePage;
    }
}

function renderNavigation() {
    const configuredNavigation = Array.isArray(window.siteSettings && window.siteSettings.navigation)
        ? window.siteSettings.navigation
            .filter(item => item && typeof item.label === 'string' && item.label.trim() && [
                'index.html', 'concept.html', 'artwork.html', 'contact.html'
            ].includes(item.page))
            .map(item => ({
                label: item.label.trim(),
                href: item.page,
                page: item.page === 'index.html' ? 'home' : item.page.replace('.html', '')
            }))
        : navigationItems;
    const logoPath = safeImagePath(window.siteSettings && window.siteSettings.logo) || 'stuff/img/logo.png';
    const logoAlt = window.siteSettings && typeof window.siteSettings.logoAlt === 'string'
        ? window.siteSettings.logoAlt
        : 'Mvrk Spence';
    const faviconPath = safeImagePath(window.siteSettings && window.siteSettings.favicon);
    if (faviconPath) {
        const favicon = document.getElementById('site-favicon');
        if (favicon) favicon.href = faviconPath;
    }
    const nav = makeElement('nav', 'site-nav');
    nav.setAttribute('aria-label', 'Main navigation');

    const brand = document.createElement('a');
    brand.className = 'brand';
    brand.href = `${pagePrefix}index.html`;
    brand.setAttribute('aria-label', `${logoAlt} home`);
    const logo = document.createElement('img');
    logo.src = logoPath;
    logo.alt = logoAlt;
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
    configuredNavigation.forEach(item => {
        const listItem = document.createElement('li');
        const link = makeElement('a', item.page === page ? 'nav-link active' : 'nav-link', item.label);
        link.href = `${pagePrefix}${item.href}`;
        if (item.page === page) link.setAttribute('aria-current', 'page');
        listItem.append(link);
        list.append(listItem);
    });

    const basketButton = makeElement('button', 'basket-link');
    basketButton.type = 'button';
    basketButton.id = 'desktop-basket-link';
    basketButton.setAttribute('aria-label', 'Open shopping basket');
    basketButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 28"><path fill-rule="evenodd" d="M7 7V5a5 5 0 0 1 10 0v2h4a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3h4Zm2 0h6V5a3 3 0 0 0-6 0v2Zm0 5a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm8 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z"/></svg><span class="cart-count" id="nav-cart-count-root" hidden>0</span>';
    links.append(list, basketButton);
    nav.append(brand, toggle, links);
    siteHeader.replaceChildren(nav);
    if (!document.querySelector('.skip-link')) {
        const skip = makeElement('a', 'skip-link', 'Skip to content');
        skip.href = `${window.location.pathname}${window.location.search}#page-content`;
        document.body.prepend(skip);
    }
    const closeMenu = () => {
        nav.classList.remove('menu-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open navigation');
    };
    basketButton.addEventListener('click', () => {
        if (nav.classList.contains('menu-open')) {
            closeMenu();
            toggle.focus();
        }
    });
    nav.addEventListener('keydown', event => {
        if (event.key === 'Escape' && nav.classList.contains('menu-open')) { closeMenu(); toggle.focus(); }
    });
    document.addEventListener('click', event => {
        if (!nav.contains(event.target)) closeMenu();
    });

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
    overlay.inert = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <section class="modal-content" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <button class="modal-close-btn" id="close-cart-modal" type="button" aria-label="Close basket">&times;</button>
        <p class="eyebrow">Your selection</p>
        <h2 id="cart-title">Shopping basket</h2>
        <div id="cart-items-container"></div>
        <p class="cart-shipping" id="cart-shipping-row" hidden>Shipping <strong id="cart-shipping-amount"></strong></p>
        <p class="cart-total">Total <strong id="cart-total-amount">0.00</strong></p>
        <p class="checkout-policies">Please read our <a href="/policies/#terms-and-conditions" target="_blank" rel="noopener noreferrer">Terms and Conditions</a>, <a href="/policies/#refunds" target="_blank" rel="noopener noreferrer">Refund Policy</a> and <a href="/policies/#delivery" target="_blank" rel="noopener noreferrer">Delivery Policy</a> before ordering. See <a href="/policies/#privacy-and-security" target="_blank" rel="noopener noreferrer">Privacy and Security</a>, <a href="/policies/#secure-checkout" target="_blank" rel="noopener noreferrer">Secure Checkout Policy</a> and <a href="/policies/#accepted-payment-methods" target="_blank" rel="noopener noreferrer">Accepted Payment Methods</a>. Policy links open in a new tab.</p>
        <div id="checkout-payment-methods" hidden>
          <section class="payment-method" aria-labelledby="card-payment-heading">
            <h3 id="card-payment-heading">Debit or credit card</h3>
            <p id="card-payment-status" class="payment-method-note" role="status"></p>
            <div id="card-buttons" class="paypal-buttons"></div>
          </section>
          <section id="paypal-payment-method" class="payment-method" aria-labelledby="paypal-payment-heading">
            <h3 id="paypal-payment-heading">PayPal</h3>
            <div id="paypal-buttons" class="paypal-buttons"></div>
          </section>
        </div>
        <p class="cart-status" id="cart-status" role="status" aria-live="polite"></p>
        <button class="text-button" id="clear-basket-btn" type="button">Clear basket</button>
      </section>`;
    siteModalRoot.replaceChildren(overlay);

    siteHeader.addEventListener('click', event => {
        if (event.target.closest('#desktop-basket-link')) openShoppingBasket();
    });
    document.getElementById('close-cart-modal').addEventListener('click', closeShoppingBasket);
    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeShoppingBasket();
    });
    document.addEventListener('keydown', event => {
        if (!overlay.classList.contains('show')) return;
        if (event.key === 'Escape') closeShoppingBasket();
        if (event.key === 'Tab') {
            const focusable = [...overlay.querySelectorAll('button:not(:disabled), a[href], iframe, [tabindex="0"]')]
                .filter(element => element.getClientRects().length);
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
}

let basketReturnFocus = null;

function openShoppingBasket() {
    const overlay = document.getElementById('shopping-cart-modal');
    if (!overlay) return;
    if (overlay.classList.contains('show')) return;
    basketReturnFocus = document.activeElement;
    overlay.inert = false;
    document.body.classList.add('basket-open');
    [siteHeader, pageContent, siteFooter].forEach(element => { element.inert = true; });
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('close-cart-modal').focus();
    window.dispatchEvent(new CustomEvent('basket:open'));
}

function closeShoppingBasket() {
    const overlay = document.getElementById('shopping-cart-modal');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.inert = true;
    document.body.classList.remove('basket-open');
    [siteHeader, pageContent, siteFooter].forEach(element => { element.inert = false; });
    if (basketReturnFocus && basketReturnFocus.isConnected) basketReturnFocus.focus();
    overlay.setAttribute('aria-hidden', 'true');
}

function renderFooter() {
    const footer = makeElement('div', 'footer-inner');
    const footerText = window.siteSettings && typeof window.siteSettings.footerText === 'string'
        ? window.siteSettings.footerText
        : 'Mvrk Spence';
    const copyright = makeElement('p', '', `© ${new Date().getFullYear()} `);
    const name = makeElement('a', 'footer-brand', footerText);
    name.href = `${pagePrefix}index.html`;
    copyright.append(name);
    const footerLinks = document.createElement('nav');
    footerLinks.className = 'social-links-list';
    footerLinks.setAttribute('aria-label', 'Social links');
    window.MvrkSocialLinks.render(footerLinks, window.siteSettings && window.siteSettings.footerLinks, { reference: true });
    if (footerLinks.children.length) footer.append(footerLinks);
    const policies = makeElement('nav', 'footer-policy-links');
    policies.setAttribute('aria-label', 'Shop policies');
    for (const [anchor, label] of [
        ['terms-and-conditions', 'Terms and Conditions'], ['refunds', 'Refund Policy'],
        ['delivery', 'Delivery Policy'], ['privacy-and-security', 'Privacy and Security'],
        ['secure-checkout', 'Secure Checkout Policy'], ['accepted-payment-methods', 'Accepted Payment Methods']
    ]) {
        const link = makeElement('a', '', label);
        link.href = `/policies/#${anchor}`;
        policies.append(link);
    }
    footer.append(copyright, policies);
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
    const imageLinks = makeElement('section', 'home-image-links');
    imageLinks.setAttribute('aria-label', 'Explore the portfolio');
    const heading = makeElement('h1', 'visually-hidden', window.siteSettings?.siteName || 'Mvrk Spence');
    (Array.isArray(data.cards) ? data.cards : []).forEach(card => {
        if (!card || typeof card.title !== 'string' || typeof card.image !== 'string') return;
        const imagePath = safeImagePath(card.image);
        if (!imagePath) return;
        const link = makeElement('a', 'home-image-link');
        link.href = safeLinkPath(card.link);
        link.setAttribute('aria-label', card.title);
        const image = document.createElement('img');
        image.src = imagePath;
        image.alt = typeof card.alt === 'string' ? card.alt : card.title;
        const firstImage = imageLinks.children.length === 0;
        image.loading = firstImage ? 'eager' : 'lazy';
        image.decoding = 'async';
        if (firstImage) image.fetchPriority = 'high';
        setImageDimensions(image, card.image);
        link.append(image);
        imageLinks.append(link);
    });
    pageContent.replaceChildren(heading, imageLinks);
}

function setImageDimensions(image, path) {
    const dimensions = {
        'stuff/img/Book1.png': [1600, 612],
        'stuff/img/Artwork.png': [1600, 752],
        'stuff/img/Concept.png': [1600, 755]
    }[typeof path === 'string' ? path.replace(/^\/+/, '') : path];
    if (dimensions) [image.width, image.height] = dimensions;
    image.decoding = 'async';
}

function renderConcept(data) {
    const intro = renderPageIntro(data);
    const feature = makeElement('section', 'concept-feature');
    const copy = makeElement('div', 'concept-copy');
    copy.append(makeElement('h2', '', data.bodyHeading || 'The thinking behind the work'));
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
        pageContent.replaceChildren(intro, feature, gallery, renderConceptPosts(data.posts));
        return;
    }
    pageContent.replaceChildren(intro, feature, renderConceptPosts(data.posts));
}

function renderConceptPosts(posts) {
    const journal = makeElement('section', 'concept-journal');
    const published = (Array.isArray(posts) ? posts : [])
        .filter(post => post && post.published === true && typeof post.title === 'string' && post.title.trim())
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (!published.length) { journal.hidden = true; return journal; }
    journal.setAttribute('aria-labelledby', 'journal-heading');
    journal.append(makeElement('p', 'eyebrow', 'From the studio'), makeElement('h2', 'journal-heading', 'Notes & ideas'));
    journal.lastChild.id = 'journal-heading';
    const usedIds = new Set();
    published.forEach((post, index) => {
        const article = makeElement('article', 'journal-post');
        const slug = typeof post.id === 'string' && /^[a-z0-9-]+$/.test(post.id) ? post.id : String(index + 1);
        let articleId = `post-${slug}`;
        while (usedIds.has(articleId)) articleId += `-${index + 1}`;
        usedIds.add(articleId);
        article.id = articleId;
        if (typeof post.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(post.date)) {
            const date = new Date(`${post.date}T12:00:00Z`);
            if (Number.isFinite(date.getTime())) {
                const time = makeElement('time', 'post-date', date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }));
                time.dateTime = post.date;
                article.append(time);
            }
        }
        const title = makeElement('h3');
        const permalink = makeElement('a', '', post.title);
        permalink.href = `${pagePrefix}concept.html#${article.id}`;
        title.append(permalink);
        article.append(title);
        if (post.summary) article.append(makeElement('p', 'post-summary', post.summary));
        const imagePath = safeImagePath(post.image);
        if (imagePath) {
            const image = document.createElement('img');
            image.src = imagePath;
            image.alt = typeof post.imageAlt === 'string' ? post.imageAlt : '';
            image.loading = 'lazy';
            image.decoding = 'async';
            article.append(image);
        }
        if (typeof post.body === 'string' && post.body.trim()) {
            const details = makeElement('details', 'post-details');
            const summary = makeElement('summary', '', 'Read more');
            summary.setAttribute('aria-label', `Read more: ${post.title}`);
            details.append(summary);
            post.body.trim().split(/\n\s*\n/).forEach(paragraph => details.append(makeElement('p', '', paragraph)));
            article.append(details);
        }
        journal.append(article);
    });
    return journal;
}

function renderProductFooter(footer, product, data) {
    footer.replaceChildren();
    if (product.purchasable !== false && Number(product.price) > 0) {
        footer.append(makeElement('span', 'product-price', formatPrice(product.price, data.currency)));
        const button = makeElement('button', 'button add-to-basket-btn', 'Add to basket');
        button.type = 'button';
        button.dataset.productId = product.id;
        footer.append(button);
    } else {
        footer.append(makeElement('span', 'product-enquiry', 'Enquiries welcome'));
        const enquiry = makeElement('a', 'button button-outline', 'Enquire');
        enquiry.href = `${pagePrefix}contact.html?artwork=${encodeURIComponent(product.name)}`;
        footer.append(enquiry);
    }
}

function renderStandaloneProduct(product, data) {
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
    details.append(makeElement('p', 'product-kind', product.group === 'books' ? 'Book' : 'Artwork'));
    details.append(makeElement('h3', '', product.name));
    if (product.description) details.append(makeElement('p', '', product.description));
    details.append(makeElement('p', 'product-type', product.type === 'digital' ? 'Digital item' : 'Physical item'));
    const footer = makeElement('div', 'product-footer');
    renderProductFooter(footer, product, data);
    details.append(footer);
    card.append(details);
    return card;
}

function renderPhotograph(photo, offers, data, selection = {}) {
    const card = makeElement('article', 'product-card photograph-card');
    card.dataset.photographId = photo.id;
    const preview = makeElement('figure', 'product-mockup');
    const surface = makeElement('div', 'product-mockup-surface');
    const imagePath = safeImagePath(photo.image);
    if (imagePath) {
        const image = document.createElement('img');
        image.className = 'product-mockup-image';
        image.src = imagePath;
        image.alt = photo.imageAlt || photo.name;
        image.loading = 'lazy';
        surface.append(image);
    }
    const caption = makeElement('figcaption', 'product-mockup-caption');
    preview.append(surface, caption);
    const details = makeElement('div', 'product-details');
    details.append(makeElement('p', 'product-kind', 'Artwork'));
    details.append(makeElement('h3', '', photo.name));
    if (photo.description) details.append(makeElement('p', '', photo.description));
    const choices = makeElement('div', 'product-choices');
    const select = makeElement('select', 'product-variant-select');
    select.id = `photo-${photo.id}-format`;
    const label = makeElement('label', 'product-variant-label', 'Choose format & size');
    label.htmlFor = select.id;
    offers.forEach(offer => {
        const format = window.MvrkCatalog.formatLabels[offer.format];
        const name = `${format}${offer.option ? ` \u00b7 ${offer.option}` : ''}`;
        const amount = offer.purchasable !== false && Number(offer.price) > 0
            ? formatPrice(offer.price, data.currency) : 'Enquire';
        const option = makeElement('option', '', `${name} \u2014 ${amount}`);
        option.value = offer.id;
        select.append(option);
    });
    select.value = offers.some(offer => offer.id === selection.selectedId) ? selection.selectedId : offers[0].id;
    const footer = makeElement('div', 'product-footer');
    const updateSelection = () => {
        const selected = offers.find(offer => offer.id === select.value) || offers[0];
        preview.dataset.format = selected.format;
        caption.textContent = `${window.MvrkCatalog.formatLabels[selected.format]} preview${selected.option ? ` \u00b7 ${selected.option}` : ''}`;
        renderProductFooter(footer, selected, data);
        if (typeof selection.onSelectionChange === 'function') selection.onSelectionChange(selected.id);
    };
    select.addEventListener('change', updateSelection);
    updateSelection();
    choices.append(label, select);
    details.append(choices, footer);
    card.append(preview, details);
    return card;
}

function renderArtwork(data, booksData = {}) {
    if (typeof renderArtwork.cleanup === 'function') renderArtwork.cleanup();
    renderArtwork.cleanup = null;
    const intro = renderPageIntro(data);
    if (data.testMode === true) {
        const notice = makeElement('p', 'shop-test-notice', 'Test collection — sample products and prices. PayPal checkout requires a sandbox account.');
        notice.setAttribute('role', 'note');
        intro.append(notice);
    }
    const activeProducts = window.siteProducts.filter(product => product.available !== false);
    const photographOffers = new Map();
    activeProducts.forEach(product => {
        if (product.group !== 'photographs') return;
        if (!photographOffers.has(product.photographId)) photographOffers.set(product.photographId, []);
        photographOffers.get(product.photographId).push(product);
    });
    const photographs = (Array.isArray(data.photographs) ? data.photographs : []).flatMap(photo => {
        if (!photo || photo.available === false) return [];
        const offers = photographOffers.get(photo.id) || [];
        return offers.length ? [{ name: photo.name, photo, offers }] : [];
    });
    const catalogItems = [
        ...photographs,
        ...activeProducts.filter(product => product.group !== 'photographs')
            .map(product => ({ name: product.name, product }))
    ];

    if (catalogItems.length === 0) {
        const empty = makeElement('div', 'empty-state');
        empty.append(
            makeElement('h2', '', data.emptyTitle || 'New work coming soon'),
            makeElement('p', '', data.emptyMessage || 'Please get in touch if you would like to enquire about a piece.')
        );
        const contact = makeElement('a', 'button button-outline', 'Contact');
        contact.href = `${pagePrefix}contact.html`;
        empty.append(contact);
        pageContent.replaceChildren(intro, empty);
        return;
    }

    const productList = makeElement('section', 'artwork-collections shop-catalog');
    productList.id = 'product-list';
    productList.setAttribute('aria-labelledby', 'shop-results-heading');
    const form = makeElement('form', 'shop-search');
    form.setAttribute('role', 'search');
    const label = makeElement('label', 'shop-search-label', 'Search by name');
    label.htmlFor = 'shop-search-input';
    const controls = makeElement('div', 'shop-search-controls');
    const input = makeElement('input', 'shop-search-input');
    input.id = 'shop-search-input';
    input.name = 'q';
    input.type = 'search';
    input.placeholder = 'Artwork or book name';
    input.maxLength = 160;
    const submit = makeElement('button', 'button', 'Search');
    submit.type = 'submit';
    const clear = makeElement('button', 'button button-outline shop-search-clear', 'Clear');
    clear.type = 'button';
    clear.setAttribute('aria-label', 'Clear search and show all items');
    controls.append(input, submit, clear);
    form.append(label, controls);
    const header = makeElement('header', 'shop-results-header');
    const heading = makeElement('h2', '', 'All artwork & books');
    heading.id = 'shop-results-heading';
    heading.setAttribute('tabindex', '-1');
    const count = makeElement('p', 'shop-results-count');
    count.setAttribute('role', 'status');
    count.setAttribute('aria-live', 'polite');
    count.setAttribute('aria-atomic', 'true');
    header.append(heading, count);
    const grid = makeElement('div', 'product-grid shop-results-grid');
    const noResults = makeElement('div', 'empty-state shop-no-results');
    const showAll = makeElement('button', 'button button-outline', 'Show all items');
    showAll.type = 'button';
    noResults.append(
        makeElement('h3', '', 'No matching items'),
        makeElement('p', '', 'Try another name, or show the full collection.'),
        showAll
    );
    const pagination = makeElement('nav', 'shop-pagination');
    pagination.setAttribute('aria-label', 'Shop pages');
    productList.append(form, header, grid, noResults, pagination);

    const selectedFormats = new Map();
    let query = '';
    let currentPage = 1;
    const currentUrl = () => new URL(window.location.pathname + window.location.search + window.location.hash, window.location.origin);
    const readUrl = () => {
        const parameters = currentUrl().searchParams;
        query = parameters.get('q') || '';
        currentPage = Number(parameters.get('page'));
    };
    const writeUrl = () => {
        const url = currentUrl();
        if (query) url.searchParams.set('q', query);
        else url.searchParams.delete('q');
        if (currentPage > 1) url.searchParams.set('page', String(currentPage));
        else url.searchParams.delete('page');
        const next = `${url.pathname}${url.search}${url.hash}`;
        const previous = window.location.pathname + window.location.search + window.location.hash;
        if (next !== previous) window.history.pushState(null, '', next);
    };
    const drawResults = (focusResults = false, updateUrl = false) => {
        const result = window.MvrkCatalogBrowse.browseItems(catalogItems, { query, page: currentPage, pageSize: data.itemsPerPage });
        query = result.query;
        currentPage = result.page;
        input.value = query;
        clear.hidden = !query;
        heading.textContent = query ? 'Search results' : 'All artwork & books';
        const itemLabel = result.total === 1 ? 'item' : 'items';
        count.textContent = result.total
            ? `Showing ${result.from}\u2013${result.to} of ${result.total} ${itemLabel}${query ? ` for \u201c${query}\u201d` : ''}`
            : `No items found${query ? ` for \u201c${query}\u201d` : ''}`;
        grid.replaceChildren(...result.items.map(item => item.photo
            ? renderPhotograph(item.photo, item.offers, data, {
                selectedId: selectedFormats.get(item.photo.id),
                onSelectionChange: id => selectedFormats.set(item.photo.id, id)
            })
            : renderStandaloneProduct(item.product, data)));
        grid.hidden = result.total === 0;
        noResults.hidden = result.total !== 0;
        pagination.replaceChildren();
        pagination.hidden = result.totalPages <= 1;
        if (result.totalPages > 1) {
            const pageButton = (text, target, disabled = false, active = false) => {
                const button = makeElement('button', `shop-page-button${active ? ' is-current' : ''}`, text);
                button.type = 'button';
                button.disabled = disabled;
                button.dataset.page = String(target);
                if (active) button.setAttribute('aria-current', 'page');
                button.setAttribute('aria-label', /^\d+$/.test(String(text)) ? `Page ${text}` : `${text} page`);
                button.addEventListener('click', () => {
                    if (disabled || target === currentPage) return;
                    currentPage = target;
                    drawResults(true, true);
                });
                return button;
            };
            pagination.append(pageButton('Previous', result.page - 1, result.page === 1));
            window.MvrkCatalogBrowse.pageNumbers(result.page, result.totalPages).forEach(number => {
                if (number === 'ellipsis') {
                    const ellipsis = makeElement('span', 'shop-page-ellipsis', '\u2026');
                    ellipsis.setAttribute('aria-hidden', 'true');
                    pagination.append(ellipsis);
                } else pagination.append(pageButton(String(number), number, false, number === result.page));
            });
            pagination.append(pageButton('Next', result.page + 1, result.page === result.totalPages));
        }
        if (updateUrl) writeUrl();
        if (focusResults) {
            heading.focus({ preventScroll: true });
            if (typeof heading.scrollIntoView === 'function') heading.scrollIntoView({ block: 'start', behavior: 'auto' });
        }
    };
    const resetSearch = () => {
        query = '';
        currentPage = 1;
        drawResults(false, true);
        input.focus();
    };
    form.addEventListener('submit', event => {
        event.preventDefault();
        query = input.value;
        currentPage = 1;
        drawResults(true, true);
    });
    input.addEventListener('input', () => {
        clear.hidden = !input.value;
        if (!input.value && query) resetSearch();
    });
    clear.addEventListener('click', resetSearch);
    showAll.addEventListener('click', resetSearch);
    const onPopState = () => {
        readUrl();
        drawResults();
    };
    window.addEventListener('popstate', onPopState);
    renderArtwork.cleanup = () => window.removeEventListener('popstate', onPopState);
    readUrl();
    drawResults();
    const checkout = makeElement('section', 'shop-checkout');
    const checkoutButton = makeElement('button', 'button button-outline', 'View basket & checkout');
    checkoutButton.type = 'button';
    checkoutButton.addEventListener('click', openShoppingBasket);
    checkout.append(makeElement('p', '', 'Selected something? Review your basket and pay securely with PayPal.'), checkoutButton);
    checkout.hidden = !activeProducts.some(product => product.purchasable !== false && Number(product.price) > 0);
    pageContent.replaceChildren(intro, productList, checkout);
}

function renderContact(data) {
    const intro = renderPageIntro(data);
    intro.classList.add('contact-intro');
    const layout = makeElement('div', 'contact-layout');
    const panel = makeElement('section', 'contact-panel');
    panel.setAttribute('aria-labelledby', 'contact-email-heading');
    const emailHeading = makeElement('h2', 'contact-label', data.emailLabel || 'Direct enquiries');
    emailHeading.id = 'contact-email-heading';
    panel.append(emailHeading);
    if (typeof data.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        const email = makeElement('a', 'contact-email', data.email);
        email.href = `mailto:${data.email}`;
        const artwork = new URLSearchParams(window.location.search).get('artwork');
        if (artwork) {
            email.href += `?subject=${encodeURIComponent(`Artwork enquiry: ${artwork.slice(0, 160)}`)}`;
            panel.prepend(makeElement('p', 'enquiry-context', `Enquiring about ${artwork.slice(0, 160)}`));
        }
        panel.append(email);
        if (data.details) panel.append(makeElement('p', 'contact-details', data.details));
        const action = makeElement('a', 'button contact-action', data.emailButtonLabel || 'Send an email');
        action.href = email.href;
        const arrow = makeElement('span', 'contact-link-arrow', '\u2197');
        arrow.setAttribute('aria-hidden', 'true');
        action.append(arrow);
        panel.append(action);
    } else if (data.details) {
        panel.append(makeElement('p', 'contact-details', data.details));
    }
    layout.append(intro, panel);

    const elsewhere = makeElement('section', 'contact-elsewhere');
    elsewhere.setAttribute('aria-labelledby', 'contact-social-heading');
    const socialHeading = makeElement('h2', 'contact-label', data.socialTitle || 'Find me elsewhere');
    socialHeading.id = 'contact-social-heading';
    const socials = makeElement('nav', 'social-links social-links-list contact-socials');
    socials.setAttribute('aria-label', 'Contact social links');
    const customLinks = Array.isArray(data.socialLinks) ? data.socialLinks : [];
    const useSiteLinks = typeof data.useSiteSocialLinks === 'boolean'
        ? data.useSiteSocialLinks : customLinks.length === 0;
    const links = useSiteLinks ? window.siteSettings && window.siteSettings.footerLinks : customLinks;
    window.MvrkSocialLinks.render(socials, links, { reference: true, showLabel: true });
    Array.from(socials.children).forEach(link => {
        if (link.target === '_blank') {
            const arrow = makeElement('span', 'contact-link-arrow', '\u2197');
            arrow.setAttribute('aria-hidden', 'true');
            link.append(arrow);
        }
    });
    elsewhere.hidden = socials.hidden;
    elsewhere.append(socialHeading, socials);
    pageContent.replaceChildren(layout, elsewhere);
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
    if (!response.ok) {
        const error = new Error(`Could not load ${path} (${response.status}).`);
        error.status = response.status;
        throw error;
    }
    return response.json();
}

async function loadPaymentSettings() {
    try {
        return await loadJson('/.netlify/functions/paypal-public-settings');
    } catch (error) {
        // An older static deploy has no settings endpoint yet. Other failures
        // must not reuse an old public ID while the server uses saved settings.
        if (error.status === 404) return loadJson('content/payments.json');
        throw error;
    }
}

async function initializeSite() {
    const contentPath = page === 'artwork' ? null : `content/${page}.json`;
    const [settingsResult, shopResult, contentResult, paymentsResult, booksResult] = await Promise.allSettled([
        loadJson('content/site.json'),
        loadJson('content/shop.json'),
        contentPath ? loadJson(contentPath) : Promise.resolve(null),
        loadPaymentSettings(),
        loadJson('content/books.json').catch(error => {
            if (error.status === 404) return { books: [] };
            throw error;
        })
    ]);
    const settings = settingsResult.status === 'fulfilled' && settingsResult.value &&
        typeof settingsResult.value === 'object' && !Array.isArray(settingsResult.value)
        ? settingsResult.value : {};
    if (settingsResult.status === 'rejected') console.error('Unable to load site settings.', settingsResult.reason);
    window.siteSettings = settings;
    const siteName = typeof settings.siteName === 'string' && settings.siteName.trim()
        ? settings.siteName.trim() : 'Mvrk Spence';
    document.title = `${siteName} | ${{ home: 'Home', concept: 'Concept', artwork: 'Artwork & Shop', contact: 'Contact' }[page] || 'Portfolio'}`;
    if (typeof settings.metaDescription === 'string') {
        const description = document.getElementById('page-description');
        if (description) description.content = settings.metaDescription;
    }
    renderNavigation();
    renderFooter();
    const booksData = booksResult.status === 'fulfilled' && booksResult.value &&
        typeof booksResult.value === 'object' && !Array.isArray(booksResult.value) ? booksResult.value : null;
    let config;
    if (booksData && window.MvrkCatalog && shopResult.status === 'fulfilled' && shopResult.value &&
        typeof shopResult.value === 'object' && !Array.isArray(shopResult.value)) {
        config = shopResult.value;
        if (paymentsResult.status === 'fulfilled') applyPaymentSettings(config, paymentsResult.value);
        else {
            config.paypalClientId = '';
            config.paypalEnvironment = 'sandbox';
        }
        window.siteConfig = config;
        window.siteProducts = window.MvrkCatalog.expandCatalog(config, booksData);
        window.siteReady = true;
        window.dispatchEvent(new CustomEvent('site:ready'));
    } else {
        console.error('Unable to load shop settings.', shopResult.reason || 'Invalid catalog');
    }
    try {
        if (page === 'artwork') {
            if (!config) throw new Error('The artwork catalog could not be loaded.');
            renderArtwork(config, booksData);
            if (config.title) document.title = `${siteName} | ${config.title}`;
        } else {
            if (contentResult.status === 'rejected') throw contentResult.reason;
            const data = contentResult.value;
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid page content.');
            if (page === 'home') renderHome(data);
            else if (page === 'concept') renderConcept(data);
            else if (page === 'contact') renderContact(data);
            if (data.title) document.title = `${siteName} | ${data.title}`;
        }
        scrollToPageAnchor();
    } catch (error) {
        console.error('Unable to load website content.', error);
        pageContent.replaceChildren(
            makeElement('section', 'empty-state', 'This page could not be loaded. Please try again.')
        );
        const retry = makeElement('button', 'button', 'Try again');
        retry.type = 'button';
        retry.addEventListener('click', () => window.location.reload());
        pageContent.firstChild.append(retry);
    }
}

function applyPaymentSettings(config, payments) {
    const legacyEnvironment = config.paypalEnvironment === 'live' ? 'live' : 'sandbox';
    if (!payments || typeof payments !== 'object' || Array.isArray(payments)) {
        config.paypalEnvironment = legacyEnvironment;
        if (config.testMode === true && legacyEnvironment === 'live') config.paypalClientId = '';
        return;
    }
    const environment = payments.environment;
    if (environment !== 'sandbox' && environment !== 'live') {
        config.paypalEnvironment = 'sandbox';
        config.paypalClientId = '';
        return;
    }
    const publicId = environment === 'live' ? payments.liveClientId : payments.sandboxClientId;
    config.paypalEnvironment = environment;
    config.paypalClientId = typeof publicId === 'string' && publicId.trim()
        ? publicId.trim()
        : environment === legacyEnvironment && typeof config.paypalClientId === 'string'
            ? config.paypalClientId.trim() : '';
    if (config.testMode === true && environment === 'live') config.paypalClientId = '';
}

function scrollToPageAnchor() {
    let id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); }
    catch (_) { return; }
    if (!id) return;
    const target = document.getElementById(id);
    if (target && pageContent.contains(target)) {
        const details = target.querySelector('.post-details');
        if (details) details.open = true;
        requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'instant' }));
    }
}

renderNavigation();
renderModal();
renderFooter();
if (!window.MvrkIdentityRedirecting) initializeSite();
