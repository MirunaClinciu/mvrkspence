import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../admin/validation.js', import.meta.url), 'utf8');

function validators() {
    const events = {};
    const CMS = { registerEventListener({ name, handler }) { events[name] = handler; } };
    runInContext(source, createContext({ window: { CMS } }));
    return events;
}

function entryFor(data, fields = {}) {
    const storedData = { toJS: () => data };
    const values = { collection: 'shop', slug: 'shop', path: 'content/shop.json', data: storedData, ...fields };
    return { get: name => values[name], storedData };
}

const product = overrides => ({ id: 'print-1', name: 'Print', price: 12.5, purchasable: true, ...overrides });
const shop = products => ({ products, shipping: { enabled: false, amount: 0 } });

test('CMS save and publish hooks preserve valid catalog data unchanged', () => {
    const entry = entryFor(shop([product(), product({ id: 'enquiry', purchasable: false, price: 0 })]));
    for (const handler of Object.values(validators())) assert.equal(handler({ entry }), entry.storedData);
    assert.equal(Object.keys(validators()).sort().join(','), 'prePublish,preSave');
});

test('duplicate product IDs are blocked before either saving or publishing', () => {
    const entry = entryFor(shop([product(), product({ name: 'Another print' })]));
    for (const handler of Object.values(validators())) assert.throws(() => handler({ entry }), /Artwork ID "print-1" is used more than once/);
});

test('selling prices must be positive amounts with at most two decimals', () => {
    const handler = validators().preSave;
    for (const price of [0, '', undefined, null, -1, 1.234, '1e3', Infinity, '9007199254740992']) {
        assert.throws(() => handler({ entry: entryFor(shop([product({ price })])) }), /enter a price above zero/);
    }
    for (const price of [0.01, 1, 12.5, '12.50']) {
        const entry = entryFor(shop([product({ price })]));
        assert.equal(handler({ entry }), entry.storedData);
    }
    const enquiry = entryFor(shop([product({ purchasable: false, price: undefined })]));
    assert.equal(handler({ entry: enquiry }), enquiry.storedData);
});

test('shipping fees are checked even when the shipping switch is off', () => {
    const handler = validators().preSave;
    for (const amount of [-1, 0.001, undefined, NaN, '4.95']) {
        const data = shop([product()]);
        data.shipping.amount = amount;
        assert.throws(() => handler({ entry: entryFor(data) }), /Shipping: enter a fee of zero or above/);
    }
    for (const amount of [0, 0.01, 4.5]) {
        const data = shop([product()]);
        data.shipping.amount = amount;
        const entry = entryFor(data);
        assert.equal(handler({ entry }), entry.storedData);
    }
});

test('post ID validation also runs when an entry is identified by collection and slug', () => {
    const fields = { collection: 'pages', slug: 'concept', path: undefined };
    const handler = validators().prePublish;
    assert.throws(() => handler({ entry: entryFor({ posts: [{ id: 'studio-note' }, { id: 'studio-note' }] }, fields) }), /Journal post ID "studio-note" is used more than once/);
    assert.throws(() => handler({ entry: entryFor({ posts: [{ id: 'Not Valid' }] }, fields) }), /needs a valid permanent ID/);
    const entry = entryFor({ posts: [{ id: 'studio-note' }, { id: 'new-note' }] }, fields);
    assert.equal(handler({ entry }), entry.storedData);
});

test('unrelated pages and their content are not altered or validated as shop data', () => {
    const entry = entryFor({ title: 'Contact', products: [{ id: '' }] }, { collection: 'pages', slug: 'contact', path: 'content/contact.json' });
    assert.equal(validators().preSave({ entry }), entry.storedData);
});

test('editor retains a direct editing route after login and loads validation before previews', () => {
    const html = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
    assert.ok(html.includes("editorHash.startsWith('#/collections/')"));
    assert.ok(html.indexOf('src="/admin/validation.js"') < html.indexOf('src="/admin/preview.js"'));
});

test('PayPal settings keep blank sandbox setup valid and require a public live client ID for live mode', () => {
    const fields = { collection: 'shop', slug: 'payments', path: 'content/payments.json' };
    for (const handler of Object.values(validators())) {
        for (const data of [
            { environment: 'sandbox', sandboxClientId: '', liveClientId: '' },
            { environment: 'sandbox', sandboxClientId: 'sandbox-public-id', liveClientId: '' },
            { environment: 'live', sandboxClientId: '', liveClientId: 'live-public-id' }
        ]) {
            const entry = entryFor(data, fields);
            assert.equal(handler({ entry }), entry.storedData);
        }
        assert.throws(() => handler({ entry: entryFor({ environment: 'live', liveClientId: ' ' }, fields) }), /enter your Live PayPal public client ID/);
        assert.throws(() => handler({ entry: entryFor({ environment: 'production' }, fields) }), /choose Test payments or Real payments/);
        assert.throws(() => handler({ entry: entryFor({ environment: 'sandbox', sandboxClientId: 123 }, fields) }), /Client ID as text/);
    }
});
