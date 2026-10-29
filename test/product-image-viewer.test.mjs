import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../stuff/product-image-viewer.js', import.meta.url), 'utf8');

class Style {
    constructor() { this.priorities = {}; }
    getPropertyValue(name) { return this[name] || ''; }
    getPropertyPriority(name) { return this.priorities[name] || ''; }
    setProperty(name, value, priority = '') { this[name] = value; this.priorities[name] = priority; }
    removeProperty(name) { delete this[name]; delete this.priorities[name]; }
}

class Element {
    constructor(tagName, document) {
        this.tagName = tagName;
        this.ownerDocument = document;
        this.children = [];
        this.parentNode = null;
        this.attributes = {};
        this.dataset = {};
        this.style = new Style();
        this.listeners = new Map();
        this.className = '';
        this.hidden = false;
        this.disabled = false;
        this.open = false;
        this.ownText = '';
        this.naturalWidth = 0;
        this.naturalHeight = 0;
        this.complete = false;
        this.focusCount = 0;
        this.classList = {
            contains: name => this.className.split(' ').includes(name),
            toggle: (name, enabled) => {
                const classes = new Set(this.className.split(' ').filter(Boolean));
                if (enabled) classes.add(name); else classes.delete(name);
                this.className = [...classes].join(' ');
            }
        };
    }
    get isConnected() { return this === this.ownerDocument.documentElement || Boolean(this.parentNode?.isConnected); }
    set innerHTML(value) { throw new Error(`Unsafe HTML assignment: ${value}`); }
    set textContent(value) { this.replaceChildren(); this.ownText = String(value); }
    get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
    append(...children) { children.forEach(child => { child.remove(); child.parentNode = this; this.children.push(child); }); }
    replaceChildren(...children) {
        this.children.forEach(child => { child.parentNode = null; });
        this.children = [];
        this.ownText = '';
        this.append(...children);
    }
    remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        this.parentNode = null;
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    addEventListener(type, handler) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(handler);
    }
    dispatch(type, values = {}) {
        const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...values };
        (this.listeners.get(type) || []).forEach(handler => handler(event));
        return event;
    }
    focus() { this.focusCount += 1; this.ownerDocument.activeElement = this; }
    getBoundingClientRect() { return { left: 20, top: 20, right: 900, bottom: 700 }; }
    getClientRects() {
        for (let node = this; node; node = node.parentNode) if (node.hidden) return [];
        return this.isConnected ? [this.getBoundingClientRect()] : [];
    }
    querySelectorAll(selector) {
        assert.equal(selector, 'button:not(:disabled), a[href], [tabindex="0"]');
        return descendants(this).filter(node => (node.tagName === 'button' && !node.disabled) ||
            (node.tagName === 'a' && node.href) || node.tabIndex === 0);
    }
    load(width, height) { this.naturalWidth = width; this.naturalHeight = height; this.complete = true; this.dispatch('load'); }
}

function fixture({ supported = true, throwsOnShow = false, deferredClose = false, href = 'https://portfolio.example/preview/artwork.html' } = {}) {
    const document = { baseURI: href, activeElement: null, createElement(tag) {
        const element = new Element(tag, document);
        if (tag === 'dialog' && supported) {
            element.showModal = () => {
                if (throwsOnShow) throw new Error('Dialog unavailable');
                element.open = true;
                descendants(element).find(child => child.autofocus)?.focus();
            };
            element.close = () => { element.open = false; if (!deferredClose) element.dispatch('close'); };
        }
        return element;
    } };
    document.documentElement = document.createElement('html');
    document.body = document.createElement('body');
    document.documentElement.append(document.body);
    const trigger = document.createElement('button');
    document.body.append(trigger);
    document.activeElement = trigger;
    const popups = [];
    const window = { location: { href }, open(...args) { popups.push(args); } };
    const context = createContext({ window, document, URL, console });
    runInContext(source, context, { filename: 'stuff/product-image-viewer.js' });
    const dialog = () => descendants(document.body).find(node => node.tagName === 'dialog');
    return { document, window, trigger, popups, api: window.MvrkProductImages, dialog };
}

function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
function byClass(node, name) { return descendants(node).find(child => child.classList.contains(name)); }
function currentImage(node) { return descendants(node).find(child => child.tagName === 'img'); }
const product = {
    title: 'Evening light', image: '/uploads/preview.webp', imageAlt: 'A landscape',
    detailImage: '/uploads/original.jpg', detailImageAlt: 'Full landscape photograph',
    format: 'framed', color: 'black', option: 'A3', variantLabel: 'Framed · Black · A3', priceText: '£45.00'
};

test('only local HTTP(S) image URLs can open the viewer or its original-image fallback', () => {
    const invalid = [
        'javascript:alert(1)', 'data:image/svg+xml,<svg onload="alert(1)">',
        'https://evil.example/a.jpg', '//evil.example/a.jpg',
        'https://user:password@portfolio.example/a.jpg', 'http://portfolio.example/a.jpg',
        'file:///C:/secret.jpg', '\u0000/uploads/image.jpg', 'https://portfolio.example.evil/a.jpg', ''
    ];
    for (const image of invalid) {
        const { api, dialog, popups } = fixture({ supported: false });
        assert.equal(api.open({ image, detailImage: image }), false, image);
        assert.equal(dialog(), undefined, image);
        assert.deepEqual(popups, [], image);
    }
    const { api, popups } = fixture({ supported: false });
    assert.equal(api.open({ image: '../uploads/preview.webp', detailImage: '//evil.example/original.jpg' }), false);
    assert.deepEqual(popups, [['https://portfolio.example/uploads/preview.webp', '_blank', 'noopener,noreferrer']]);
});

test('configured title, selected variant, price and alternative text are plain text', () => {
    const { api, dialog, trigger, document } = fixture();
    const attack = '<img src=x onerror="alert(1)">';
    assert.equal(api.open({ ...product, title: attack, variantLabel: attack, priceText: attack, imageAlt: attack, trigger }), true);
    const viewer = dialog();
    assert.equal(viewer.open, true);
    assert.equal(byClass(viewer, 'mvrk-product-image-heading').children[0].textContent, attack);
    assert.equal(byClass(viewer, 'mvrk-product-image-variant').textContent, attack);
    assert.equal(byClass(viewer, 'mvrk-product-image-price').textContent, attack);
    assert.equal(currentImage(viewer).alt, attack);
    assert.equal(descendants(viewer).filter(node => node.tagName === 'img').length, 1);
    const title = descendants(viewer).find(node => node.id === viewer.getAttribute('aria-labelledby'));
    assert.equal(title.textContent, attack);
    assert.equal(viewer.getAttribute('aria-modal'), 'true');
    const mockup = byClass(viewer, 'product-mockup');
    assert.equal(mockup.dataset.format, 'framed');
    assert.equal(mockup.dataset.color, 'black');
    assert.equal(mockup.children[0].className, 'product-mockup-surface');
    assert.match(byClass(viewer, 'mvrk-product-image-description').textContent, /Illustrative product preview/);
    assert.equal(document.body.style.overflow, 'hidden');
    assert.equal(document.documentElement.style.overflow, 'hidden');
});

test('original view loads the detail source, reports actual pixels and zooms to natural size', () => {
    const { api, dialog } = fixture();
    api.open(product);
    const viewer = dialog();
    const preview = currentImage(viewer);
    preview.load(640, 480);
    byClass(viewer, 'mvrk-product-image-views').children[1].dispatch('click');
    const original = currentImage(viewer);
    const resolution = byClass(viewer, 'mvrk-product-image-resolution');
    const zoom = byClass(viewer, 'mvrk-product-image-zoom');
    assert.equal(original.src, 'https://portfolio.example/uploads/original.jpg');
    assert.equal(original.alt, 'Full landscape photograph');
    assert.equal(resolution.textContent, 'Loading image…');
    assert.equal(zoom.disabled, true);
    preview.load(1, 1);
    assert.equal(resolution.textContent, 'Loading image…', 'a stale preview load cannot replace original metadata');
    original.load(3600, 2400);
    assert.match(resolution.textContent, /^3600 × 2400 px · Original source resolution$/);
    assert.equal(zoom.disabled, false);
    zoom.dispatch('click');
    assert.equal(zoom.textContent, 'Zoom out');
    assert.equal(zoom.getAttribute('aria-pressed'), 'true');
    assert.equal(original.style.width, '3600px');
    assert.equal(original.style.height, '2400px');
    assert.equal(byClass(viewer, 'mvrk-product-image-stage').classList.contains('is-zoomed'), true);
    zoom.dispatch('click');
    assert.equal(original.style.getPropertyValue('width'), '');
    assert.equal(zoom.textContent, 'Zoom in');
    const link = byClass(viewer, 'mvrk-product-image-original-link');
    assert.equal(link.href, original.src);
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
});

test('an unavailable detail image falls back to the product image and never invents resolution', () => {
    const { api, dialog } = fixture();
    api.open(product);
    const viewer = dialog();
    byClass(viewer, 'mvrk-product-image-views').children[1].dispatch('click');
    const failed = currentImage(viewer);
    failed.dispatch('error');
    const fallback = currentImage(viewer);
    assert.notEqual(fallback, failed);
    assert.equal(fallback.src, 'https://portfolio.example/uploads/preview.webp');
    assert.equal(byClass(viewer, 'mvrk-product-image-original-link').href, fallback.src);
    failed.load(6000, 4000);
    assert.equal(byClass(viewer, 'mvrk-product-image-resolution').textContent, 'Loading image…');
    fallback.load(640, 480);
    assert.match(byClass(viewer, 'mvrk-product-image-resolution').textContent, /^640 × 480 px/);
    fallback.dispatch('error');
    assert.equal(byClass(viewer, 'mvrk-product-image-zoom').disabled, true);
    assert.match(byClass(viewer, 'mvrk-product-image-resolution').textContent, /could not be loaded/);
});

test('books and standalone images open in original view without a simulated product', () => {
    const { api, dialog } = fixture();
    api.open({ title: 'Photo book', image: '/uploads/book.jpg', priceText: '£20.00' });
    const viewer = dialog();
    const views = byClass(viewer, 'mvrk-product-image-views');
    assert.equal(views.children[0].hidden, true);
    assert.equal(views.children[1].textContent, 'Original image');
    assert.equal(views.children[1].getAttribute('aria-pressed'), 'true');
    assert.equal(byClass(viewer, 'product-mockup'), undefined);
    assert.equal(currentImage(viewer).src, 'https://portfolio.example/uploads/book.jpg');
});

test('close, Escape and backdrop dismissal restore focus and exact overflow styles', () => {
    for (const action of ['close', 'escape', 'backdrop']) {
        const { api, dialog, trigger, document } = fixture();
        document.body.style.setProperty('overflow', 'scroll', 'important');
        document.documentElement.style.setProperty('overflow', 'clip');
        api.open({ ...product, trigger });
        const viewer = dialog();
        if (action === 'close') byClass(viewer, 'mvrk-product-image-close').dispatch('click');
        if (action === 'escape') assert.equal(viewer.dispatch('cancel').defaultPrevented, true);
        if (action === 'backdrop') {
            viewer.dispatch('pointerdown', { clientX: 0, clientY: 0 });
            viewer.dispatch('click', { clientX: 0, clientY: 0 });
        }
        assert.equal(dialog(), undefined, action);
        assert.equal(document.body.style.overflow, 'scroll', action);
        assert.equal(document.body.style.getPropertyPriority('overflow'), 'important', action);
        assert.equal(document.documentElement.style.overflow, 'clip', action);
        assert.equal(document.activeElement, trigger, action);
        assert.equal(trigger.focusCount, 1, action);
        api.close();
        assert.equal(trigger.focusCount, 1, 'closing twice does not refocus');
    }
});

test('Tab boundaries wrap between the first and last visible enabled viewer controls', () => {
    const { api, dialog, document, trigger } = fixture();
    api.open(product);
    const viewer = dialog();
    const first = byClass(viewer, 'mvrk-product-image-close');
    const last = byClass(viewer, 'mvrk-product-image-original-link');
    last.focus();
    assert.equal(viewer.dispatch('keydown', { key: 'Tab' }).defaultPrevented, true);
    assert.equal(document.activeElement, first);
    assert.equal(viewer.dispatch('keydown', { key: 'Tab', shiftKey: true }).defaultPrevented, true);
    assert.equal(document.activeElement, last);

    const previewButton = byClass(viewer, 'mvrk-product-image-views').children[0];
    previewButton.focus();
    assert.equal(viewer.dispatch('keydown', { key: 'Tab' }).defaultPrevented, false, 'ordinary movement within the dialog remains native');
    assert.equal(document.activeElement, previewButton);
    document.activeElement = trigger;
    assert.equal(viewer.dispatch('keydown', { key: 'Tab' }).defaultPrevented, true);
    assert.equal(document.activeElement, first, 'an escaped focus returns to the first control');
    document.activeElement = document.body;
    viewer.dispatch('keydown', { key: 'Tab', shiftKey: true });
    assert.equal(document.activeElement, last, 'reverse navigation recovers to the last control');

    last.hidden = true;
    const stage = byClass(viewer, 'mvrk-product-image-stage');
    stage.focus();
    viewer.dispatch('keydown', { key: 'Tab' });
    assert.equal(document.activeElement, first, 'hidden links cannot become a focus boundary');
    first.hidden = true;
    previewButton.disabled = true;
    byClass(viewer, 'mvrk-product-image-views').children[1].focus();
    viewer.dispatch('keydown', { key: 'Tab', shiftKey: true });
    assert.equal(document.activeElement, stage, 'hidden and disabled controls are skipped');
});

test('viewer keyboard wrapping leaves Escape, other keys and browser shortcuts alone', () => {
    const { api, dialog, document } = fixture();
    api.open(product);
    const viewer = dialog();
    const last = byClass(viewer, 'mvrk-product-image-original-link');
    last.focus();
    for (const event of [{ key: 'Escape' }, { key: 'ArrowRight' }, { key: 'Tab', ctrlKey: true }, { key: 'Tab', altKey: true }, { key: 'Tab', metaKey: true }]) {
        assert.equal(viewer.dispatch('keydown', event).defaultPrevented, false);
        assert.equal(document.activeElement, last);
    }
    assert.equal(dialog(), viewer, 'Escape still closes through the native cancel event');
    viewer.dispatch('cancel');
    assert.equal(dialog(), undefined);
});

test('switching products keeps one viewer and ignores delayed events from the previous dialog', () => {
    const { api, dialog, trigger, document } = fixture({ deferredClose: true });
    api.open({ ...product, trigger });
    const previous = dialog();
    const staleImage = currentImage(previous);
    api.open({ ...product, title: 'Next artwork', format: 'canvas', color: 'white', variantLabel: 'Canvas · A2', priceText: '£60.00', trigger });
    const next = dialog();
    assert.notEqual(next, previous);
    assert.equal(descendants(document.body).filter(node => node.tagName === 'dialog').length, 1);
    previous.dispatch('close');
    staleImage.load(4000, 3000);
    assert.equal(dialog(), next);
    assert.equal(document.body.style.overflow, 'hidden');
    assert.equal(byClass(next, 'mvrk-product-image-variant').textContent, 'Canvas · A2');
    assert.equal(byClass(next, 'mvrk-product-image-price').textContent, '£60.00');
    assert.equal(byClass(next, 'mvrk-product-image-resolution').textContent, 'Loading image…');
    assert.equal(trigger.focusCount, 0, 'replacing an open viewer does not focus its former trigger');
    trigger.remove();
    api.close();
    assert.equal(trigger.focusCount, 0, 'removed triggers are not focused');
    assert.equal(document.body.style.getPropertyValue('overflow'), '');
    assert.equal(document.documentElement.style.getPropertyValue('overflow'), '');
});

test('missing or failing modal methods open a safe original tab without leaving modal state behind', () => {
    for (const options of [{ supported: false }, { throwsOnShow: true }]) {
        const { api, dialog, popups, document } = fixture(options);
        document.body.style.setProperty('overflow', 'auto');
        assert.equal(api.open(product), false);
        assert.equal(dialog(), undefined);
        assert.equal(document.body.style.overflow, 'auto');
        assert.equal(document.documentElement.style.getPropertyValue('overflow'), '');
        assert.deepEqual(popups, [['https://portfolio.example/uploads/original.jpg', '_blank', 'noopener,noreferrer']]);
        assert.doesNotThrow(() => api.close());
    }
});
