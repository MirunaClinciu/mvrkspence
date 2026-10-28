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
const variant = overrides => ({ id: 'photo-print-a3', format: 'print', option: 'A3', price: 25, purchasable: true, ...overrides });
const photograph = overrides => ({ id: 'photo-1', name: 'Blue hour', image: '/uploads/blue-hour.jpg', variants: [variant()], ...overrides });

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
        assert.throws(() => handler({ entry: entryFor(shop([product({ price })])) }), /enter a price above zero.*Enable PayPal checkout/);
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

test('one photograph can supply several separately priced sizes and product formats', () => {
    const data = {
        ...shop([]),
        photographs: [photograph({ variants: [
            variant(),
            variant({ id: 'photo-print-a4', option: 'A4', price: 15 }),
            variant({ id: 'photo-tshirt-m', format: 'tshirt', option: 'M', price: 28 }),
            variant({ id: 'photo-framed', format: 'framed', option: '30 x 40 cm', price: 60 }),
            variant({ id: 'photo-canvas', format: 'canvas', option: '40 x 60 cm', price: 70 })
        ] })]
    };
    const before = JSON.stringify(data);
    const entry = entryFor(data);
    for (const handler of Object.values(validators())) assert.equal(handler({ entry }), entry.storedData);
    assert.equal(JSON.stringify(data), before, 'validation does not duplicate or transform the uploaded photograph');
});

test('duplicate photograph references and format SKUs cannot overwrite another listing', () => {
    const duplicatePhoto = entryFor({ photographs: [photograph(), photograph({ variants: [variant({ id: 'different-print' })] })] });
    const duplicateVariant = entryFor({ photographs: [photograph({ variants: [variant(), variant({ format: 'canvas' })] })] });
    const acrossPhotos = entryFor({ photographs: [photograph(), photograph({ id: 'photo-2' })] });
    const legacyCollision = entryFor({ products: [product({ id: 'photo-print-a3' })], photographs: [photograph()] });
    for (const handler of Object.values(validators())) {
        assert.throws(() => handler({ entry: duplicatePhoto }), /Photograph ID "photo-1" is used more than once/);
        assert.throws(() => handler({ entry: duplicateVariant }), /format ID "photo-print-a3" is used more than once/);
        for (const entry of [acrossPhotos, legacyCollision]) {
            assert.throws(() => handler({ entry }), /Product or format ID "photo-print-a3" is used more than once/);
        }
    }
});

test('unfinished photograph listings receive an explanation before saving or publishing', () => {
    const cases = [
        [photograph({ id: '' }), /valid permanent ID/],
        [photograph({ name: ' ' }), /enter a name/],
        [photograph({ image: '' }), /upload a photograph or cover image/],
        [photograph({ variants: [] }), /add at least one/],
        [photograph({ variants: {} }), /add at least one/],
        [photograph({ variants: [variant({ id: '' })] }), /valid permanent ID/],
        [photograph({ variants: [variant({ format: 'unsupported' })] }), /choose Art print, T-shirt, Framed print or Canvas/]
    ];
    for (const handler of Object.values(validators())) {
        for (const [photo, message] of cases) {
            assert.throws(() => handler({ entry: entryFor({ photographs: [photo] }) }), message);
        }
    }
});

test('photograph offers cannot enable checkout with missing or invalid selling prices', () => {
    for (const handler of Object.values(validators())) {
        for (const price of [0, undefined, -1, 1.234, '1e3']) {
            const entry = entryFor({ photographs: [photograph({ variants: [variant({ price })] })] });
            assert.throws(() => handler({ entry }), /enter a price above zero.*Enable checkout for this format/);
        }
        for (const offer of [variant({ purchasable: false, price: 0 }), variant({ purchasable: undefined, price: undefined })]) {
            const entry = entryFor({ photographs: [photograph({ variants: [offer] })] });
            assert.equal(handler({ entry }), entry.storedData, 'new formats remain valid as enquiry-only listings');
        }
        const invalidEnquiry = entryFor({ photographs: [photograph({ variants: [variant({ purchasable: false, price: -1 })] })] });
        assert.throws(() => handler({ entry: invalidEnquiry }), /price must be zero or above/);
    }
});

test('the separate Books editor validates covers, stable IDs and checkout prices', () => {
    const routes = [
        { collection: 'shop', slug: 'books', path: 'content/books.json' },
        { collection: 'shop', slug: 'books', path: undefined }
    ];
    const book = overrides => ({ id: 'book-1', name: 'Holy Window', image: '/uploads/cover.jpg', price: 35, purchasable: true, ...overrides });
    for (const fields of routes) {
        for (const handler of Object.values(validators())) {
            const data = { title: 'Books', books: [book(), book({ id: 'book-enquiry', purchasable: false, price: 0 })] };
            const entry = entryFor(data, fields);
            assert.equal(handler({ entry }), entry.storedData);
            assert.throws(() => handler({ entry: entryFor({ books: [book(), book()] }, fields) }), /Book ID "book-1" is used more than once/);
            assert.throws(() => handler({ entry: entryFor({ books: [book({ image: '' })] }, fields) }), /upload a photograph or cover image/);
            assert.throws(() => handler({ entry: entryFor({ books: [book({ name: '' })] }, fields) }), /enter a name/);
            assert.throws(() => handler({ entry: entryFor({ books: [book({ price: 0 })] }, fields) }), /enter a price above zero.*Enable PayPal checkout/);
        }
    }
});

test('old shops and empty optional photograph or book lists remain editable', () => {
    for (const handler of Object.values(validators())) {
        for (const data of [shop([product()]), { photographs: [], products: [] }]) {
            const entry = entryFor(data);
            assert.equal(handler({ entry }), entry.storedData);
        }
        const entry = entryFor({ title: 'Books' }, { collection: 'shop', slug: 'books', path: 'content/books.json' });
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
    const entry = entryFor({ title: 'Home', products: [{ id: '' }] }, { collection: 'pages', slug: 'home', path: 'content/home.json' });
    assert.equal(validators().preSave({ entry }), entry.storedData);
});

test('contact save and publish require an email that the website can display', () => {
    const routes = [
        { collection: 'pages', slug: 'contact', path: 'content/contact.json' },
        { collection: 'pages', slug: 'contact', path: undefined }
    ];
    for (const fields of routes) {
        for (const handler of Object.values(validators())) {
            for (const email of ['', 'secret@now', 'hello', 'hello@example', 'hello @example.com', ' hello@example.com', 'hello@example.com ', undefined, null, 123]) {
                assert.throws(() => handler({ entry: entryFor({ email }, fields) }), /Contact: enter a complete email address/);
            }
            for (const email of ['hello@example.com', 'studio+art@example.co.uk']) {
                const entry = entryFor({ email, details: 'Keep these details unchanged.' }, fields);
                assert.equal(handler({ entry }), entry.storedData);
            }
        }
    }
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
