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
}

const source = readFileSync(new URL('../stuff/site.js', import.meta.url), 'utf8');
const renderers = source.slice(0, source.lastIndexOf('\nrenderNavigation();'));

function fixture(page = 'home') {
    const roots = Object.fromEntries(['page-content', 'site-header', 'site-footer', 'site-modal-root']
        .map(id => [id, new Element('div')]));
    const body = new Element('body');
    body.dataset = { page, sitePrefix: '/preview/' };
    const window = { location: { origin: 'https://portfolio.example', search: '' } };
    const context = createContext({
        window,
        document: {
            body,
            baseURI: 'https://portfolio.example/',
            createElement: tag => new Element(tag),
            getElementById: id => roots[id]
        },
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
