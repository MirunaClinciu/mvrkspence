import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

// A deliberately small DOM fixture: exercise renderer output and URL handling
// without fetching third-party scripts or requiring a browser installation.
class Element {
    constructor(tag) {
        this.tagName = tag.toLowerCase();
        this.children = [];
        this.attributes = {};
        this.dataset = {};
        this.className = '';
        this.hidden = false;
        this.ownText = '';
        this.listeners = {};
        this.isConnected = true;
        this.classList = {
            contains: name => this.className.split(' ').includes(name),
            add: name => { if (!this.classList.contains(name)) this.className = (this.className + ' ' + name).trim(); },
            remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); },
            toggle: (name, enabled) => { if (enabled) this.classList.add(name); else this.classList.remove(name); }
        };
    }
    set textContent(value) { this.ownText = String(value); this.children = []; }
    get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
    get lastChild() { return this.children.at(-1); }
    get firstChild() { return this.children[0]; }
    append(...children) { this.children.push(...children); }
    prepend(...children) { this.children.unshift(...children); }
    replaceChildren(...children) { this.ownText = ''; this.children = children; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
}

const source = readFileSync(new URL('../stuff/site.js', import.meta.url), 'utf8');
const renderers = source.slice(0, source.lastIndexOf('\nrenderNavigation();'));

function fixture(page = 'home') {
    const roots = Object.fromEntries(['page-content', 'site-header', 'site-footer', 'site-modal-root']
        .map(id => [id, new Element('div')]));
    const body = new Element('body');
    body.dataset = { page, sitePrefix: '/preview/' };
    const window = { location: { origin: 'https://portfolio.example', pathname: '/preview/index.html', search: '', hash: '' }, dispatchEvent() {} };
    const document = {
        body,
        baseURI: 'https://portfolio.example/',
        createElement: tag => { const element = new Element(tag); element.ownerDocument = document; return element; },
        getElementById: id => roots[id],
        querySelector: selector => descendants(body, child => selector === '.skip-link' && child.className === 'skip-link')[0] || null,
        addEventListener() {}
    };
    body.ownerDocument = document;
    const context = createContext({
        window,
        document,
        CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
        URL,
        URLSearchParams,
        console
    });
    runInContext(renderers, context, { filename: 'stuff/site.js' });
    return { context, roots, window };
}

function descendants(element, predicate) {
    return element.children.flatMap(child => [
        ...(predicate(child) ? [child] : []),
        ...descendants(child, predicate)
    ]);
}

function byTag(element, tag) { return descendants(element, child => child.tagName === tag); }
function byClass(element, name) { return descendants(element, child => child.className.split(' ').includes(name)); }

test('home preserves the reference image-only layout and prioritizes its first image', () => {
    const { context, roots } = fixture();
    const home = JSON.parse(readFileSync(new URL('../content/home.json', import.meta.url), 'utf8'));
    context.renderHome(home);
    const main = roots['page-content'];
    assert.equal(byTag(main, 'h1').length, 1);
    assert.equal(byTag(main, 'h1')[0].className, 'visually-hidden');
    assert.equal(byClass(main, 'home-intro').length, 0);
    assert.equal(byClass(main, 'home-card-label').length, 0);
    const links = byClass(main, 'home-image-link');
    assert.equal(links.length, home.cards.length);
    links.forEach((link, index) => {
        assert.equal(link.children.length, 1, 'each project is an image without an overlay');
        const image = link.firstChild;
        assert.equal(image.tagName, 'img');
        assert.equal(image.loading, index === 0 ? 'eager' : 'lazy');
        assert.equal(image.alt, home.cards[index].alt || home.cards[index].title);
        const bytes = readFileSync(new URL(`../${home.cards[index].image}`, import.meta.url));
        assert.equal(image.width, bytes.readUInt32BE(16), 'reserve the real image width');
        assert.equal(image.height, bytes.readUInt32BE(20), 'reserve the real image height');
    });
    assert.equal(links[0].firstChild.fetchPriority, 'high');
});

test('Concept excludes drafts and renders authored HTML as plain text', () => {
    const { context } = fixture('concept');
    const journal = context.renderConceptPosts([
        { id: 'draft', title: 'Private draft', body: 'Do not display', published: false },
        { id: 'published', title: '<script>title</script>', published: true,
            summary: '<b>Summary</b>', body: '<img src=x onerror=alert(1)>\n\nSecond paragraph',
            image: 'javascript:alert(1)', date: '2026-10-28' }
    ]);
    const posts = byTag(journal, 'article');
    assert.equal(posts.length, 1);
    assert.ok(!journal.textContent.includes('Private draft'));
    assert.equal(byTag(posts[0], 'h3')[0].textContent, '<script>title</script>');
    assert.equal(byTag(posts[0], 'img').length, 0);
    const details = byTag(posts[0], 'details')[0];
    assert.equal(byTag(details, 'p').length, 2);
    assert.equal(byTag(details, 'p')[0].textContent, '<img src=x onerror=alert(1)>');
    assert.equal(byTag(details, 'summary')[0].attributes['aria-label'], 'Read more: <script>title</script>');
    assert.equal(byTag(posts[0], 'time')[0].dateTime, '2026-10-28');
});

test('Concept post permalinks remain unique when CMS IDs collide', () => {
    const { context } = fixture('concept');
    const journal = context.renderConceptPosts([
        { id: 'idea', title: 'First', published: true },
        { id: 'idea', title: 'Second', published: true },
        { id: 'idea-2', title: 'Third', published: true }
    ]);
    const posts = byTag(journal, 'article');
    assert.equal(new Set(posts.map(post => post.id)).size, 3);
    for (const post of posts) {
        assert.equal(byTag(post, 'a')[0].href, `/preview/concept.html#${post.id}`);
    }
    assert.equal(context.renderConceptPosts([]).hidden, true);
});

test('local links stay inside the preview once and unsafe destinations fall back home', () => {
    const { context } = fixture();
    assert.equal(context.safeLinkPath('artwork.html'), '/preview/artwork.html');
    assert.equal(context.safeLinkPath('/preview/artwork.html?edition=1#work'), '/preview/artwork.html?edition=1#work');
    for (const path of ['https://elsewhere.example/page', '//elsewhere.example/page', 'javascript:alert(1)', 'data:text/html,test']) {
        assert.equal(context.safeLinkPath(path), '/preview/index.html');
        assert.equal(context.safeImagePath(path), '');
    }
});

test('Artwork offers enquiries separately from purchasable works and hides unavailable items', () => {
    const { context, roots, window } = fixture('artwork');
    window.siteProducts = [
        { id: 'enquiry', name: 'Book & prints', price: 0, purchasable: false, available: true },
        { id: 'print', name: 'Print', price: 25, available: true },
        { id: 'hidden', name: 'Unavailable work', price: 50, available: false }
    ];
    context.renderArtwork({ title: 'Artwork', currency: 'GBP' });
    const main = roots['page-content'];
    const cards = byClass(main, 'product-card');
    assert.equal(cards.length, 2);
    assert.equal(byClass(cards[0], 'add-to-basket-btn').length, 0);
    const enquiry = byTag(cards[0], 'a')[0];
    assert.equal(enquiry.textContent, 'Enquire');
    assert.equal(enquiry.href, '/preview/contact.html?artwork=Book%20%26%20prints');
    assert.equal(byClass(cards[1], 'add-to-basket-btn')[0].dataset.productId, 'print');
    assert.ok(byClass(cards[1], 'product-price')[0].textContent.includes('25.00'));
    assert.equal(byClass(main, 'shop-checkout')[0].hidden, false);
    window.siteProducts = [window.siteProducts[0]];
    context.renderArtwork({ title: 'Artwork', currency: 'GBP' });
    assert.equal(byClass(roots['page-content'], 'shop-checkout')[0].hidden, true);
});

test('Artwork enquiry carries the selected work into a safely encoded email subject', () => {
    const { context, roots, window } = fixture('contact');
    window.location.search = '?artwork=Book%20%26%20prints';
    context.renderContact({ title: 'Contact', email: 'artist@example.com' });
    assert.equal(byClass(roots['page-content'], 'contact-email')[0].href,
        'mailto:artist@example.com?subject=Artwork%20enquiry%3A%20Book%20%26%20prints');
});

test('Artwork clearly labels sandbox test collections and omits that label for normal catalogs', () => {
    const { context, roots, window } = fixture('artwork');
    window.siteProducts = [{ id: 'sample', name: 'Sample print', price: 25, purchasable: true }];
    context.renderArtwork({ title: 'Artwork', currency: 'GBP', testMode: true });
    const notice = byClass(roots['page-content'], 'shop-test-notice')[0];
    assert.equal(notice.getAttribute('role'), 'note');
    assert.match(notice.textContent, /sample products and prices/);
    assert.match(notice.textContent, /sandbox account/);
    context.renderArtwork({ title: 'Artwork', currency: 'GBP', testMode: false });
    assert.equal(byClass(roots['page-content'], 'shop-test-notice').length, 0);
});


test('skip link stays on the current preview page when the HTML base points to the root', () => {
    const { context, window } = fixture('contact');
    window.location.pathname = '/preview/contact.html';
    window.location.search = '?artwork=Book%20%26%20prints';
    context.renderNavigation();
    const skip = byClass(context.document.body, 'skip-link')[0];
    assert.equal(skip.href, '/preview/contact.html?artwork=Book%20%26%20prints#page-content');
});

test('basket opening disables the background and closing restores the invoking control', () => {
    const { context, roots } = fixture();
    const trigger = context.document.createElement('button');
    const close = context.document.createElement('button');
    const overlay = context.document.createElement('div');
    roots['shopping-cart-modal'] = overlay;
    roots['close-cart-modal'] = close;
    trigger.focus();
    context.openShoppingBasket();
    assert.equal(overlay.inert, false);
    assert.equal(overlay.getAttribute('aria-hidden'), 'false');
    assert.equal(context.document.activeElement, close);
    assert.ok(['site-header', 'page-content', 'site-footer'].every(id => roots[id].inert));
    context.closeShoppingBasket();
    assert.equal(overlay.inert, true);
    assert.equal(overlay.getAttribute('aria-hidden'), 'true');
    assert.equal(context.document.activeElement, trigger);
    assert.ok(['site-header', 'page-content', 'site-footer'].every(id => !roots[id].inert));
});

function setContentResponses(context, responses) {
    context.renderNavigation = () => {};
    context.renderFooter = () => {};
    context.console = { error() {} };
    context.fetch = async path => ({
        ok: responses[path] !== undefined,
        status: responses[path] === undefined ? 503 : 200,
        json: async () => responses[path]
    });
}

test('a missing shop catalog does not hide the homepage or enable checkout', async () => {
    const { context, roots, window } = fixture();
    const home = JSON.parse(readFileSync(new URL('../content/home.json', import.meta.url), 'utf8'));
    setContentResponses(context, { 'content/site.json': { siteName: 'Mvrk Spence' }, 'content/home.json': home });
    await context.initializeSite();
    assert.equal(byClass(roots['page-content'], 'home-image-link').length, home.cards.length);
    assert.equal(window.siteReady, false);
    assert.equal(window.siteConfig, null);
});

test('Artwork presents a retry when its catalog cannot be loaded', async () => {
    const { context, roots, window } = fixture('artwork');
    setContentResponses(context, { 'content/site.json': { siteName: 'Mvrk Spence' } });
    await context.initializeSite();
    assert.match(roots['page-content'].textContent, /could not be loaded/);
    assert.equal(byTag(roots['page-content'], 'button')[0].textContent, 'Try again');
    assert.equal(window.siteReady, false);
});

test('missing site settings fall back to the default brand while the Contact page remains usable', async () => {
    const { context, roots } = fixture('contact');
    setContentResponses(context, {
        'content/shop.json': { products: [] },
        'content/contact.json': { title: 'Contact', email: 'artist@example.com' }
    });
    await context.initializeSite();
    assert.equal(context.document.title, 'Mvrk Spence | Contact');
    assert.equal(byClass(roots['page-content'], 'contact-email')[0].href, 'mailto:artist@example.com');
});

test('payment settings load with the catalog and select the matching public client ID', async () => {
    const { context, window } = fixture('artwork');
    setContentResponses(context, {
        'content/site.json': { siteName: 'Mvrk Spence' },
        'content/shop.json': { products: [], paypalClientId: 'legacy-sandbox', testMode: false },
        '/.netlify/functions/paypal-public-settings': { environment: 'live', sandboxClientId: 'sandbox-public', liveClientId: 'live-public' }
    });
    await context.initializeSite();
    assert.equal(window.siteConfig.paypalEnvironment, 'live');
    assert.equal(window.siteConfig.paypalClientId, 'live-public');
});

test('sample catalogs disable live checkout in the browser even with a live public ID', () => {
    const { context } = fixture();
    const config = { testMode: true, paypalClientId: 'legacy-sandbox' };
    context.applyPaymentSettings(config, { environment: 'live', liveClientId: 'live-public' });
    assert.equal(config.paypalEnvironment, 'live');
    assert.equal(config.paypalClientId, '');
});

test('payment mode switches cannot reuse the other public client ID', () => {
    const { context } = fixture();
    const config = { testMode: false, paypalClientId: 'legacy-sandbox' };
    context.applyPaymentSettings(config, { environment: 'live', liveClientId: '', sandboxClientId: 'sandbox-public' });
    assert.equal(config.paypalClientId, '');
    context.applyPaymentSettings(config, { environment: 'production', liveClientId: 'live-public' });
    assert.equal(config.paypalClientId, '');
});

test('a missing new payment file keeps the legacy sandbox setup usable', () => {
    const { context } = fixture();
    const config = { paypalClientId: 'legacy-sandbox' };
    context.applyPaymentSettings(config, null);
    assert.equal(config.paypalEnvironment, 'sandbox');
    assert.equal(config.paypalClientId, 'legacy-sandbox');
});

test('older deployments can use the bundled payment file when the new endpoint is absent', async () => {
    const { context } = fixture();
    const requests = [];
    context.fetch = async path => {
        requests.push(path);
        return path === '/.netlify/functions/paypal-public-settings'
            ? { ok: false, status: 404 }
            : { ok: true, json: async () => ({ environment: 'sandbox', sandboxClientId: 'static-client' }) };
    };
    assert.equal((await context.loadPaymentSettings()).sandboxClientId, 'static-client');
    assert.deepEqual(requests, ['/.netlify/functions/paypal-public-settings', 'content/payments.json']);
});

test('payment service failures never reuse stale bundled IDs while server settings may differ', async () => {
    const { context, window } = fixture('artwork');
    const requests = [];
    const responses = {
        'content/site.json': { siteName: 'Mvrk Spence' },
        'content/shop.json': { products: [], paypalClientId: 'old-client' },
        'content/payments.json': { environment: 'sandbox', sandboxClientId: 'stale-client' }
    };
    context.renderNavigation = () => {};
    context.renderFooter = () => {};
    context.console = { error() {} };
    context.fetch = async path => {
        requests.push(path);
        return { ok: responses[path] !== undefined, status: 503, json: async () => responses[path] };
    };
    await context.initializeSite();
    assert.equal(window.siteConfig.paypalClientId, '');
    assert.ok(!requests.includes('content/payments.json'));
});
