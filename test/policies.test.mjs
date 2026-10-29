import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../stuff/policies.js', import.meta.url), 'utf8');
const content = JSON.parse(readFileSync(new URL('../content/policies.json', import.meta.url), 'utf8'));

class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.ownText = ''; }
    set textContent(value) { this.ownText = String(value); this.children = []; }
    get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.ownText = ''; this.children = children; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
}

function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }

function fixture(responses = {}) {
    const roots = Object.fromEntries(['policies-content', 'policy-copyright', 'policy-socials'].map(id => [id, new Element('div')]));
    let onReady;
    const document = {
        readyState: 'loading',
        createElement: tag => new Element(tag),
        getElementById: id => roots[id] || Object.values(roots).flatMap(descendants).find(node => node.id === id),
        addEventListener: (name, handler) => { if (name === 'DOMContentLoaded') onReady = handler; }
    };
    const window = { location: { hash: '', origin: 'https://portfolio.example' }, addEventListener() {} };
    const context = createContext({
        window, document, URL,
        fetch: async path => {
            if (!Object.hasOwn(responses, path)) throw new Error('Network unavailable');
            return { ok: responses[path] !== null, status: responses[path] === null ? 503 : 200, json: async () => responses[path] };
        }
    });
    runInContext(source, context, { filename: 'stuff/policies.js' });
    return { roots, window, document, initialize: () => onReady(), render: window.MvrkPolicies.render };
}

function completeContent() {
    const data = structuredClone(content);
    data.draft = false;
    data.seller.legalName = 'Example Seller';
    data.seller.businessAddress = 'Example business address';
    data.seller.returnsAddress = 'Example returns address';
    Object.keys(data.deliveryDetails).forEach(key => { data.deliveryDetails[key] = 'Confirmed arrangement'; });
    return data;
}

test('all requested policies have stable accessible section links', () => {
    const { render, roots } = fixture();
    render(content, { testMode: true });
    const nodes = descendants(roots['policies-content']);
    const expected = ['terms-and-conditions', 'refunds', 'delivery', 'privacy-and-security', 'secure-checkout', 'accepted-payment-methods'];
    const navigation = nodes.find(node => node.attributes['aria-label'] === 'Shop policies');
    assert.deepEqual(navigation.children.map(link => link.href), expected.map(id => `#${id}`));
    expected.forEach(id => {
        const section = nodes.find(node => node.id === id);
        assert.equal(section.attributes['aria-labelledby'], `${id}-heading`);
        assert.equal(section.children[0].id, `${id}-heading`);
    });
    assert.match(roots['policies-content'].textContent, /Optional cancellation form/);
});

test('drafts and missing seller details remain visible independently of the draft switch', () => {
    const { render, roots } = fixture();
    const data = structuredClone(content);
    data.draft = false;
    render(data, { testMode: false });
    assert.match(roots['policies-content'].textContent, /Draft policies — awaiting seller review/);
    assert.match(roots['policies-content'].textContent, /Legal seller name/);
    render(completeContent(), { testMode: false });
    assert.doesNotMatch(roots['policies-content'].textContent, /Draft policies — awaiting seller review/);
});

test('sandbox status is shown even when policy details are complete', () => {
    const { render, roots } = fixture();
    render(completeContent(), { testMode: true });
    assert.match(roots['policies-content'].textContent, /No real orders or payments are accepted/);
    assert.match(roots['policies-content'].textContent, /PayPal Sandbox/);
});

test('policy text and seller fields cannot create markup or unsafe contact URLs', () => {
    const { render, roots } = fixture();
    const data = completeContent();
    data.terms.paragraphs = ['<img src=x onerror=alert(1)>', null, { text: 'not a paragraph' }];
    data.seller.legalName = '<script>alert(1)</script>';
    data.seller.email = 'victim@example.com?bcc=someone@example.com';
    data.paymentMethods.image = 'javascript:alert(1)';
    render(data);
    const nodes = descendants(roots['policies-content']);
    assert.match(roots['policies-content'].textContent, /<img src=x onerror=alert\(1\)>/);
    assert.match(roots['policies-content'].textContent, /<script>alert\(1\)<\/script>/);
    assert.ok(nodes.every(node => node.tagName !== 'img' && node.tagName !== 'script'));
    assert.ok(nodes.every(node => node.innerHTML === undefined));
    assert.ok(nodes.filter(node => node.href?.startsWith('mailto:')).every(node => node.href === 'mailto:mvrkspence@gmail.com'));
    assert.doesNotMatch(roots['policies-content'].textContent, /\[object Object\]/);
});

test('delivery charge reflects shop settings and card methods stay conditional', () => {
    const { render, roots } = fixture();
    render(content, { testMode: true, currency: 'GBP', shipping: { enabled: true, amount: 4.95 } });
    assert.match(roots['policies-content'].textContent, /Current test-shop delivery charge: £4\.95/);
    assert.match(roots['policies-content'].textContent, /Debit & credit cards · where available/);
    assert.match(roots['policies-content'].textContent, /particular card brand or payment option is not guaranteed/);
});

test('payment image loads locally with its description and conditional availability caption', () => {
    const { render, roots } = fixture();
    render(content, { testMode: true });
    const image = descendants(roots['policies-content']).find(node => node.tagName === 'img');
    assert.equal(image.src, 'https://portfolio.example/stuff/img/payment-methods.png');
    assert.match(image.alt, /Visa, Mastercard, Discover and American Express/);
    assert.match(roots['policies-content'].textContent, /Available card options are shown by PayPal at checkout and can vary/);
});

test('payment images reject external, executable and credential-bearing URLs', () => {
    const { render, roots } = fixture();
    const data = structuredClone(content);
    for (const image of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'https://tracking.example/image.png', '//tracking.example/image.png', 'https://user:pass@portfolio.example/logo.png']) {
        data.paymentMethods.image = image;
        render(data);
        assert.ok(descendants(roots['policies-content']).every(node => node.tagName !== 'img'), image);
    }
    data.paymentMethods.image = '';
    render(data);
    assert.ok(descendants(roots['policies-content']).every(node => node.tagName !== 'img'), 'admin can remove the optional image');
});

test('policy page still loads when optional shop or site requests fail', async () => {
    const { initialize, roots } = fixture({ '/content/policies.json': content });
    await initialize();
    assert.match(roots['policies-content'].textContent, /Refund Policy/);
    assert.match(roots['policies-content'].textContent, /Checkout availability cannot currently be confirmed/);
    assert.doesNotMatch(roots['policies-content'].textContent, /checkout uses PayPal Sandbox/);
});

test('failed policy loading provides a clear error and working contact route', async () => {
    const { initialize, roots } = fixture({ '/content/policies.json': null });
    await initialize();
    const nodes = descendants(roots['policies-content']);
    assert.match(roots['policies-content'].textContent, /Policies could not be loaded/);
    assert.ok(nodes.some(node => node.attributes.role === 'alert'));
    assert.equal(nodes.find(node => node.tagName === 'a').href, 'mailto:mvrkspence@gmail.com');
});

test('standalone policy page keeps coming-soon, private admin and preview separate', () => {
    const html = readFileSync(new URL('../policies/index.html', import.meta.url), 'utf8');
    assert.doesNotMatch(html, /(?:href|src)="\/(?:preview|admin|manage)(?:\/|\b)/);
    assert.doesNotMatch(html, /stuff\/site\.js/);
    assert.match(html, /href="\/"/);
    assert.match(html, /noindex, nofollow, noarchive/);
    assert.match(readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8'), /'policies'/);
    assert.match(readFileSync(new URL('../admin/config.yml', import.meta.url), 'utf8'), /file: content\/policies\.json/);
});
