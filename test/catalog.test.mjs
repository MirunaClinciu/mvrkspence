import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';
import catalog from '../stuff/catalog.js';

const { expandCatalog, formatLabels } = catalog;
const photograph = overrides => ({
    id: 'coast', name: 'Coastline', image: '/uploads/coast.jpg', imageAlt: 'A rocky coastline',
    description: 'Photographed at dusk.', available: true,
    variants: [
        { id: 'coast-print-a3', format: 'print', option: 'A3', price: 25, purchasable: true },
        { id: 'coast-tshirt-m', format: 'tshirt', option: 'M', price: 28, purchasable: true },
        { id: 'coast-framed', format: 'framed', option: '30 × 40 cm', price: 60, purchasable: true },
        { id: 'coast-canvas', format: 'canvas', option: '40 × 60 cm', price: 70, purchasable: true }
    ], ...overrides
});

test('one uploaded photograph expands to separately priced physical formats with fulfilment names', () => {
    const shop = { photographs: [photograph()] };
    const before = structuredClone(shop);
    const products = expandCatalog(shop);
    assert.equal(products.length, 4);
    assert.deepEqual(products.map(product => product.price), [25, 28, 60, 70]);
    products.forEach((product, index) => {
        const variant = shop.photographs[0].variants[index];
        assert.equal(product.id, variant.id);
        assert.equal(product.image, '/uploads/coast.jpg');
        assert.equal(product.imageAlt, 'A rocky coastline');
        assert.equal(product.photographId, 'coast');
        assert.equal(product.group, 'photographs');
        assert.equal(product.type, 'physical');
        assert.equal(product.purchasable, true);
        assert.ok(product.name.startsWith(`${formatLabels[variant.format]} · ${variant.option}`));
        assert.ok(product.name.endsWith('Coastline'));
    });
    assert.deepEqual(shop, before, 'catalogue expansion does not change the saved content');
});

test('hidden photographs and hidden individual formats stay unavailable to both basket and checkout', () => {
    const hiddenParent = expandCatalog({ photographs: [photograph({ available: false })] });
    assert.ok(hiddenParent.every(product => product.available === false));
    const data = photograph();
    data.variants[1].available = false;
    const offers = expandCatalog({ photographs: [data] });
    assert.deepEqual(offers.filter(product => product.available).map(product => product.format), ['print', 'framed', 'canvas']);
    data.available = 'false';
    assert.ok(expandCatalog({ photographs: [data] }).every(product => product.available === false));
});

test('new formats start as enquiries and malformed prices cannot enable checkout', () => {
    for (const price of [0, -1, null, '', undefined, 1.234, '1e3', Infinity, '9007199254740992']) {
        const data = photograph({ variants: [{ id: 'offer', format: 'print', price, purchasable: true }] });
        assert.equal(expandCatalog({ photographs: [data] })[0].purchasable, false);
    }
    const noCheckout = photograph({ variants: [{ id: 'offer', format: 'print', price: 25 }] });
    assert.equal(expandCatalog({ photographs: [noCheckout] })[0].purchasable, false);
});

test('a duplicated global SKU never resolves to an arbitrary book or photograph price', () => {
    const data = photograph({ variants: [{ id: 'collision', format: 'print', price: 25, purchasable: true }] });
    const products = expandCatalog({
        products: [{ id: 'legacy', name: 'Existing print', price: 9 }, { id: 'collision', name: 'Other', price: 1 }],
        photographs: [data]
    }, { books: [{ id: 'collision', name: 'Book', price: 40 }, { id: 'book', name: 'Photobook', price: 35 }] });
    assert.deepEqual(products.map(product => product.id), ['legacy', 'book']);
});

test('duplicate photograph references cannot mix offers belonging to different uploaded photographs', () => {
    const first = photograph();
    const second = photograph({ name: 'Other photograph', image: '/uploads/other.jpg', variants: [{ id: 'other-print', format: 'print', price: 55 }] });
    assert.deepEqual(expandCatalog({ photographs: [first, second] }), []);
});

test('legacy products and separate books preserve their IDs, prices and digital shipping type', () => {
    const products = expandCatalog({ products: [
        { id: 'old', name: 'Old artwork', price: 10, purchasable: false },
        { id: 'old-book', name: 'Old book', price: 35, category: 'book' }
    ] }, { books: [{ id: 'ebook', name: 'Digital book', price: 8, type: 'digital' }] });
    assert.deepEqual(products.map(product => product.group), ['legacy', 'books', 'books']);
    assert.equal(products[0].purchasable, false);
    assert.equal(products[2].type, 'digital');
    assert.equal(products[2].id, 'ebook');
    assert.equal(products[2].price, 8);
});

test('malformed catalogues, IDs and unsupported formats cannot create purchasable entries', () => {
    for (const value of [null, [], 'text', 42]) assert.deepEqual(expandCatalog(value, value), []);
    const data = photograph({ variants: [null,
        { id: 'bad id', format: 'print', price: 25, purchasable: true },
        { id: 'bad-format', format: 'constructor', price: 25, purchasable: true }
    ] });
    assert.deepEqual(expandCatalog({ photographs: [data, photograph({ id: '../bad' }), photograph({ image: '' })] }), []);
    const proto = expandCatalog({ products: [{ id: '__proto__', name: 'Safe reference', price: 10 }] });
    assert.equal(proto[0].id, '__proto__');
});

test('browser and server use identical catalogue expansion and price eligibility', () => {
    const window = {};
    runInContext(readFileSync(new URL('../stuff/catalog.js', import.meta.url), 'utf8'), createContext({ window }));
    const shop = { photographs: [photograph()] };
    assert.equal(JSON.stringify(window.MvrkCatalog.expandCatalog(shop)), JSON.stringify(expandCatalog(shop)));
});
