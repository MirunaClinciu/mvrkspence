import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';
import catalog from '../stuff/catalog.js';

const { expandCatalog, variantLabel } = catalog;
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
        assert.ok(product.name.startsWith(variantLabel(variant)));
        assert.ok(product.name.endsWith('Coastline'));
    });
    assert.deepEqual(shop, before, 'catalogue expansion does not change the saved content');
});

test('shirt colours identify separate checkout SKUs and precede long photograph titles', () => {
    const data = photograph({ name: 'A long photograph title '.repeat(10), variants: [
        { id: 'white-m', format: 'tshirt', color: 'white', option: 'M', price: 28, purchasable: true },
        { id: 'black-m', format: 'tshirt', color: ' BLACK ', option: 'M', price: 29, purchasable: true }
    ] });
    const [white, black] = expandCatalog({ photographs: [data] });
    assert.equal(white.id, 'white-m');
    assert.equal(black.id, 'black-m');
    assert.equal(white.price, 28);
    assert.equal(black.price, 29);
    assert.equal(white.color, 'white');
    assert.equal(black.color, 'black');
    assert.ok(white.name.slice(0, 127).startsWith('T-shirt · White · M — '));
    assert.ok(black.name.slice(0, 127).startsWith('T-shirt · Black · M — '));
    assert.equal(variantLabel(black), 'T-shirt · Black · M');
    assert.equal(variantLabel({ format: 'print', color: 'red', option: 'A3' }), 'Art print · A3');
});

test('legacy shirts default to white and unsupported explicit colours never create an offer', () => {
    const old = expandCatalog({ photographs: [photograph()] }).find(product => product.format === 'tshirt');
    assert.equal(old.id, 'coast-tshirt-m');
    assert.equal(old.color, 'white');
    assert.equal(old.name, 'T-shirt · White · M — Coastline');
    for (const color of [null, '', 'red', 0, false, [], {}]) {
        const variant = { id: 'bad-shirt', format: 'tshirt', color, option: 'M', price: 28, purchasable: true };
        assert.deepEqual(expandCatalog({ photographs: [photograph({ variants: [variant] })] }), []);
        assert.equal(variantLabel(variant), '');
        assert.deepEqual(expandCatalog({ products: [{ ...variant, name: 'Standalone shirt' }] }), []);
    }
    const [print] = expandCatalog({ photographs: [photograph({ variants: [
        { id: 'print', format: 'print', color: 'red', option: 'A3', price: 25, purchasable: true }
    ] })] });
    assert.equal(Object.hasOwn(print, 'color'), false);
});

test('optional detail images carry through photographs, standalone products and books', () => {
    const products = expandCatalog({ photographs: [photograph({
        detailImage: '/uploads/coast-full.jpg', detailImageAlt: 'Fine texture in the coastline'
    })], products: [{ id: 'legacy-detail', name: 'Standalone', detailImage: '/uploads/legacy-full.jpg', price: 10 }] },
    { books: [{ id: 'book-detail', name: 'Book', detailImage: '/uploads/book-full.jpg', detailImageAlt: 'Cover detail', price: 35 }] });
    for (const product of products.filter(product => product.group === 'photographs')) {
        assert.equal(product.detailImage, '/uploads/coast-full.jpg');
        assert.equal(product.detailImageAlt, 'Fine texture in the coastline');
    }
    assert.equal(products.find(product => product.id === 'legacy-detail').detailImage, '/uploads/legacy-full.jpg');
    assert.equal(products.find(product => product.id === 'book-detail').detailImageAlt, 'Cover detail');
    const [fallback] = expandCatalog({ photographs: [photograph({ detailImage: '/uploads/coast-full.jpg' })] });
    assert.equal(fallback.detailImageAlt, 'A rocky coastline');
});

test('saved photographs offer white and black medium shirts while preserving established SKUs and prices', () => {
    const shop = JSON.parse(readFileSync(new URL('../content/shop.json', import.meta.url), 'utf8'));
    const products = expandCatalog(shop);
    const oldIds = ['ravens-tshirt-m', 'sample-art-tshirt'];
    const blackIds = ['ravens-tshirt-black-m', 'sample-art-tshirt-black'];
    for (const [index, photo] of shop.photographs.entries()) {
        const shirts = products.filter(product => product.photographId === photo.id && product.format === 'tshirt');
        assert.deepEqual(shirts.map(product => product.color), ['white', 'black']);
        assert.deepEqual(shirts.map(product => product.id), [oldIds[index], blackIds[index]]);
        for (const shirt of shirts) {
            assert.equal(shirt.option, 'M');
            assert.equal(shirt.price, 28);
            assert.equal(shirt.purchasable, true);
            assert.equal(shirt.available, true);
            assert.match(shirt.id, /^[A-Za-z0-9._-]{1,80}$/);
        }
    }
    assert.equal(new Set(products.map(product => product.id)).size, products.length);
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
    const shop = { photographs: [photograph({ detailImage: '/uploads/coast-full.jpg', variants: [
        ...photograph().variants,
        { id: 'black-shirt', format: 'tshirt', color: 'black', option: 'M', price: 28, purchasable: true },
        { id: 'invalid-shirt', format: 'tshirt', color: 'red', option: 'M', price: 28, purchasable: true }
    ] })] };
    assert.equal(JSON.stringify(window.MvrkCatalog.expandCatalog(shop)), JSON.stringify(expandCatalog(shop)));
    assert.equal(window.MvrkCatalog.variantLabel(shop.photographs[0].variants[4]), variantLabel(shop.photographs[0].variants[4]));
});
