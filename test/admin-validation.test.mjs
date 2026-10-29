import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../admin/validation.js', import.meta.url), 'utf8');

function validators(windowValues = {}) {
    const events = {};
    const CMS = { registerEventListener({ name, handler }) { events[name] = handler; } };
    runInContext(source, createContext({ window: { CMS, ...windowValues } }));
    return events;
}

function immutableData(data, writes) {
    const snapshot = structuredClone(data);
    return {
        toJS: () => structuredClone(snapshot),
        setIn(path, value) {
            writes.count += 1;
            const next = structuredClone(snapshot);
            let parent = next;
            for (const key of path.slice(0, -1)) parent = parent[key];
            parent[path.at(-1)] = value;
            return immutableData(next, writes);
        }
    };
}

function entryFor(data, fields = {}) {
    const writes = { count: 0 };
    const storedData = immutableData(data, writes);
    const values = { collection: 'shop', slug: 'shop', path: 'content/shop.json', data: storedData, ...fields };
    return { get: name => values[name], storedData, writes };
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

test('shirt colour validation permits white, black and legacy omissions but blocks unsupported colours', () => {
    for (const handler of Object.values(validators())) {
        for (const color of [undefined, 'white', 'black', ' BLACK ']) {
            const entry = entryFor({ photographs: [photograph({ variants: [variant({ format: 'tshirt', color })] })] });
            assert.equal(handler({ entry }), entry.storedData);
        }
        for (const color of [null, '', 'red', 3, false, [], {}]) {
            const shirt = variant({ format: 'tshirt', color });
            const entry = entryFor({ photographs: [photograph({ variants: [shirt] })] });
            assert.throws(() => handler({ entry }), /choose White or Black for every T-shirt colour/);
            assert.equal(entry.writes.count, 0);
            assert.throws(() => handler({ entry: entryFor(shop([product({ format: 'tshirt', color })])) }), /choose White or Black/);
        }
        const print = entryFor({ photographs: [photograph({ variants: [variant({ color: 'red' })] })] });
        assert.equal(handler({ entry: print }), print.storedData, 'colour is ignored for other formats');
    }
});

test('new shirt references include colour and all saved references remain stable after colour edits', () => {
    for (const handler of Object.values(validators({ crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' } }))) {
        const entry = entryFor({ photographs: [photograph({
            name: 'A photograph title that is long enough to exceed the reference name limit',
            variants: [
                variant({ id: 'permanent-shirt', format: 'tshirt', color: 'white', option: 'M' }),
                variant({ id: '', format: 'tshirt', color: 'white', option: 'M' }),
                variant({ id: '', format: 'tshirt', color: 'black', option: 'M' }),
                variant({ id: '', format: 'tshirt', option: 'L' })
            ]
        })] });
        const saved = handler({ entry }).toJS();
        const shirts = saved.photographs[0].variants;
        assert.equal(shirts[0].id, 'permanent-shirt');
        assert.match(shirts[1].id, /^art-tshirt-white-m-/);
        assert.match(shirts[2].id, /^art-tshirt-black-m-/);
        assert.match(shirts[3].id, /^art-tshirt-white-l-/);
        assert.equal(new Set(shirts.map(shirt => shirt.id)).size, 4);
        shirts.forEach(shirt => { assert.match(shirt.id, /^[A-Za-z0-9._-]{1,80}$/); });
        const ids = shirts.map(shirt => shirt.id);
        shirts[0].color = 'black';
        const updated = entryFor(saved);
        assert.equal(handler({ entry: updated }), updated.storedData);
        assert.deepEqual(updated.storedData.toJS().photographs[0].variants.map(shirt => shirt.id), ids);
    }
});

test('CMS exposes separate white and black shirt defaults and optional full-resolution uploads', () => {
    const config = readFileSync(new URL('../admin/config.yml', import.meta.url), 'utf8');
    assert.match(config, /format: tshirt\s+color: white\s+option: M/);
    assert.match(config, /format: tshirt\s+color: black\s+option: M/);
    assert.match(config, /name: color\s+label: T-shirt colour\s+widget: select\s+required: false\s+default: white/);
    assert.match(config, /label: White, value: white/);
    assert.match(config, /label: Black, value: black/);
    assert.equal((config.match(/name: detailImage, label: Higher-resolution detail image \(optional\), widget: image, choose_url: false, required: false/g) || []).length, 3);
    assert.match(config, /name: books\s+label: Books\s+file: content\/books\.json/);
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
        [photograph({ id: 'not a valid reference' }), /valid permanent ID/],
        [photograph({ name: ' ' }), /enter a name/],
        [photograph({ image: '' }), /upload a photograph or cover image/],
        [photograph({ variants: [] }), /add at least one/],
        [photograph({ variants: {} }), /add at least one/],
        [photograph({ variants: [variant({ id: 'not a valid reference' })] }), /valid permanent ID/],
        [photograph({ variants: [variant({ format: 'unsupported' })] }), /choose Art print, T-shirt, Framed print or Canvas/]
    ];
    for (const handler of Object.values(validators())) {
        for (const [photo, message] of cases) {
            assert.throws(() => handler({ entry: entryFor({ photographs: [photo] }) }), message);
        }
    }
});

test('missing references are generated when saving or publishing photographs, formats and legacy products', () => {
    for (const handler of Object.values(validators())) {
        for (const missing of [undefined, null, '']) {
            const data = {
                ...shop([product({ id: missing })]),
                photographs: [photograph({ id: missing, variants: [variant({ id: missing })] })]
            };
            if (missing === undefined) {
                delete data.products[0].id;
                delete data.photographs[0].id;
                delete data.photographs[0].variants[0].id;
            }
            const original = structuredClone(data);
            const entry = entryFor(data);
            const saved = handler({ entry });
            const result = saved.toJS();
            const ids = [result.products[0].id, result.photographs[0].id, result.photographs[0].variants[0].id];
            assert.equal(new Set(ids).size, ids.length);
            for (const id of ids) assert.match(id, /^[A-Za-z0-9._-]{1,80}$/);
            assert.equal(entry.writes.count, 3);
            assert.deepEqual(entry.storedData.toJS(), original, 'generated references produce a new Immutable value');
            assert.deepEqual(data, original, 'the source content is not mutated');
            delete result.products[0].id;
            delete result.photographs[0].id;
            delete result.photographs[0].variants[0].id;
            delete original.products[0].id;
            delete original.photographs[0].id;
            delete original.photographs[0].variants[0].id;
            assert.deepEqual(result, original, 'saving only adds the missing references');
        }
    }
});

test('same-named artwork receives distinct references even when the random source repeats', () => {
    const events = validators({ crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' } });
    for (const handler of Object.values(events)) {
        const photo = () => photograph({
            id: '', name: 'Same photograph',
            variants: [variant({ id: '', option: 'A3' }), variant({ id: '', option: 'A3' })]
        });
        const entry = entryFor({ ...shop([product({ id: '', name: 'Same artwork' }), product({ id: '', name: 'Same artwork' })]), photographs: [photo(), photo()] });
        const result = handler({ entry }).toJS();
        const ids = [
            ...result.products.map(item => item.id),
            ...result.photographs.map(item => item.id),
            ...result.photographs.flatMap(item => item.variants.map(offer => offer.id))
        ];
        assert.equal(new Set(ids).size, ids.length, 'every generated reference identifies one item');
        for (const id of ids) assert.match(id, /^[A-Za-z0-9._-]{1,80}$/);
        const again = entryFor(result);
        assert.equal(handler({ entry: again }), again.storedData, 'a repeat save keeps those references');
        assert.equal(again.writes.count, 0);
    }
});

test('new generated references cannot overwrite an existing reference', () => {
    const handler = validators({ crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' } }).preSave;
    const photo = () => photograph({ id: '', name: 'Same photograph', variants: [variant({ id: '' })] });
    const previous = handler({ entry: entryFor({ photographs: [photo()] }) }).toJS().photographs[0];
    const entry = entryFor({
        products: [product({ id: previous.variants[0].id })],
        photographs: [photo()]
    });
    const result = handler({ entry }).toJS();
    assert.equal(result.products[0].id, previous.variants[0].id, 'an existing basket SKU is preserved');
    assert.notEqual(result.photographs[0].variants[0].id, previous.variants[0].id);
});

test('generated photograph and format references stay permanent after renaming and changing sizes', () => {
    const events = validators();
    const entry = entryFor({ photographs: [photograph({ id: null, variants: [variant({ id: '' })] })] });
    const saved = events.preSave({ entry }).toJS();
    const photoId = saved.photographs[0].id;
    const offerId = saved.photographs[0].variants[0].id;
    saved.photographs[0].name = 'Renamed photograph';
    saved.photographs[0].variants[0].option = 'A4';
    saved.photographs[0].variants[0].price = 15;
    for (const handler of Object.values(events)) {
        const renamed = entryFor(saved);
        const result = handler({ entry: renamed });
        assert.equal(result, renamed.storedData);
        assert.equal(result.toJS().photographs[0].id, photoId);
        assert.equal(result.toJS().photographs[0].variants[0].id, offerId);
        assert.equal(renamed.writes.count, 0, 'renaming never replaces a saved basket reference');
    }
});

test('adding references for new products and formats preserves every existing artwork reference', () => {
    const data = {
        ...shop([product({ id: 'legacy-stable' }), product({ id: '' })]),
        photographs: [photograph({
            id: 'photo-stable',
            variants: [variant({ id: 'offer-stable' }), variant({ id: '', format: 'canvas' })]
        })]
    };
    for (const handler of Object.values(validators())) {
        const entry = entryFor(data);
        const result = handler({ entry }).toJS();
        assert.equal(result.products[0].id, 'legacy-stable');
        assert.equal(result.photographs[0].id, 'photo-stable');
        assert.equal(result.photographs[0].variants[0].id, 'offer-stable');
        assert.equal(entry.writes.count, 2, 'only the two new items need references');
    }
});

test('missing book and journal references are valid, unique and stable after a rename', () => {
    const events = validators({ crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' } });
    const cases = [
        {
            fields: { collection: 'shop', slug: 'books', path: 'content/books.json' },
            key: 'books',
            item: () => ({ name: 'Same edition', image: '/uploads/book.jpg', price: 35, purchasable: true }),
            name: 'name', existingId: 'book-stable', pattern: /^[A-Za-z0-9._-]{1,80}$/
        },
        {
            fields: { collection: 'pages', slug: 'concept', path: 'content/concept.json' },
            key: 'posts', item: () => ({ title: 'Café journal', body: 'A new story.' }),
            name: 'title', existingId: 'post-stable', pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
        }
    ];
    for (const example of cases) {
        for (const handler of Object.values(events)) {
            const data = { [example.key]: [
                { ...example.item(), id: example.existingId },
                example.item(),
                { ...example.item(), id: null },
                { ...example.item(), id: '' }
            ] };
            const entry = entryFor(data, example.fields);
            const result = handler({ entry }).toJS();
            const ids = result[example.key].map(item => item.id);
            assert.equal(new Set(ids).size, 4);
            assert.equal(ids[0], example.existingId, 'an existing published reference is never replaced');
            for (const id of ids) assert.match(id, example.pattern);
            result[example.key].forEach(item => { item[example.name] = 'Renamed'; });
            const renamed = entryFor(result, example.fields);
            assert.equal(handler({ entry: renamed }), renamed.storedData);
            assert.deepEqual(renamed.storedData.toJS()[example.key].map(item => item.id), ids);
            assert.deepEqual(entry.storedData.toJS(), data);
        }
    }
});

test('generating references does not bypass required names, images or valid shipping and never partially persists errors', () => {
    const cases = [
        { photo: { name: ' ' }, message: /enter a name/ },
        { photo: { image: '' }, message: /upload a photograph or cover image/ },
        { photo: {}, shipping: { enabled: true, amount: -1 }, message: /Shipping: enter a fee/ }
    ];
    for (const handler of Object.values(validators())) {
        for (const example of cases) {
            const data = {
                ...shop([product({ id: '' })]),
                photographs: [photograph({ id: '', ...example.photo, variants: [variant({ id: null })] })]
            };
            if (example.shipping) data.shipping = example.shipping;
            const original = structuredClone(data);
            const entry = entryFor(data);
            assert.throws(() => handler({ entry }), example.message);
            assert.equal(entry.writes.count, 0, 'all validation completes before any Immutable setIn');
            assert.deepEqual(entry.storedData.toJS(), original);
            assert.deepEqual(data, original);
        }
    }
});

test('nonempty malformed references remain errors instead of silently changing existing links', () => {
    for (const handler of Object.values(validators())) {
        for (const id of ['not valid', ' ', '../photo', 123, false]) {
            assert.throws(() => handler({ entry: entryFor({ photographs: [photograph({ id })] }) }), /valid permanent ID/);
            assert.throws(() => handler({ entry: entryFor({ photographs: [photograph({ variants: [variant({ id })] })] }) }), /valid permanent ID/);
            assert.throws(() => handler({ entry: entryFor(shop([product({ id })])) }), /valid permanent ID/);
            assert.throws(() => handler({ entry: entryFor({ books: [{ id, name: 'Book', image: '/uploads/book.jpg', price: 35 }] }, { collection: 'shop', slug: 'books', path: 'content/books.json' }) }), /valid permanent ID/);
            assert.throws(() => handler({ entry: entryFor({ posts: [{ id, title: 'Journal' }] }, { collection: 'pages', slug: 'concept', path: 'content/concept.json' }) }), /valid permanent ID/);
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
