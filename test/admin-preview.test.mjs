import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../admin/preview.js', import.meta.url), 'utf8');

function preview(data, getAsset = path => ({ toString: () => path }), template = 'home') {
    const templates = {};
    const CMS = {
        registerPreviewStyle() {},
        registerPreviewTemplate(name, component) { templates[name] = component; }
    };
    const context = createContext({
        URL,
        CMS,
        window: {
            CMS,
            location: { origin: 'https://portfolio.example' },
            h: (tag, props, ...children) => ({ tag, props, children: children.flat(Infinity).filter(Boolean) })
        }
    });
    runInContext(source, context);
    return templates[template]({ entry: { getIn: () => ({ toJS: () => data }) }, getAsset });
}

function images(element) {
    return typeof element !== 'object' ? [] : [
        ...(element.tag === 'img' ? [element] : []),
        ...element.children.flatMap(images)
    ];
}

function text(element) {
    return typeof element === 'object' ? element.children.map(text).join(' ') : String(element);
}

test('bundled images resolve from the site root inside the admin preview iframe', () => {
    const data = { cards: [
        { image: 'stuff/img/Book1.png', title: 'Book' },
        { image: './stuff/img/Artwork.png', title: 'Artwork' },
        { image: '/uploads/photo with spaces.png', title: 'New photo' }
    ] };
    assert.deepEqual(images(preview(data)).map(image => image.props.src), [
        '/stuff/img/Book1.png', '/stuff/img/Artwork.png', '/uploads/photo%20with%20spaces.png'
    ]);
});

test('new upload preview URLs remain intact and unresolved assets fall back to the public file', () => {
    const data = { cards: [{ image: '/uploads/new-photo.png', title: 'New photo' }] };
    for (const url of ['blob:https://portfolio.example/new-photo', 'data:image/png;base64,sample', 'https://images.example/photo.png']) {
        const result = preview(data, () => ({ toString: () => url }));
        assert.equal(images(result)[0].props.src, url);
    }
    assert.equal(images(preview(data, () => null))[0].props.src, '/uploads/new-photo.png');
});

test('non-image executable URL schemes are rejected by the preview asset helper', () => {
    const data = { cards: [{ image: 'javascript:alert(1)', title: 'Invalid image' }] };
    assert.equal(images(preview(data))[0].props.src, '');
});

test('photograph preview reuses one uploaded image while showing each format, size and GBP price', () => {
    const result = preview({
        currency: 'GBP',
        photographs: [{ name: 'River study', image: '/uploads/river.png', variants: [
            { format: 'print', option: 'A3', price: 25, purchasable: true },
            { format: 'tshirt', option: 'M', price: 28, purchasable: true },
            { format: 'framed', option: '30 x 40 cm', price: 60, purchasable: true },
            { format: 'canvas', option: '40 x 60 cm', price: 70, purchasable: true }
        ] }]
    }, () => ({ toString: () => 'blob:https://portfolio.example/upload' }), 'shop');
    assert.deepEqual(images(result).map(image => image.props.src), ['blob:https://portfolio.example/upload']);
    for (const expected of ['Art print · A3', 'T-shirt · M', 'Framed print · 30 x 40 cm', 'Canvas · 40 x 60 cm', '£25.00', '£28.00', '£60.00', '£70.00']) {
        assert.ok(text(result).includes(expected), expected);
    }
});

test('format previews distinguish an unavailable size and enquiry-only offers from purchases', () => {
    const result = preview({ photographs: [{ name: 'River', variants: [
        { format: 'print', price: 25, purchasable: false },
        { format: 'tshirt', option: 'L', price: 28, purchasable: true, available: false }
    ] }] }, undefined, 'shop');
    assert.match(text(result), /Enquiries welcome/);
    assert.match(text(result), /Not offered/);
});

test('books use a separate cover preview and identify that prices share the shop currency', () => {
    const result = preview({ title: 'Books', books: [{ name: 'Holy Window', image: '/uploads/book.png', price: 35, purchasable: true }] }, undefined, 'books');
    assert.deepEqual(images(result).map(image => image.props.src), ['/uploads/book.png']);
    assert.match(text(result), /Holy Window/);
    assert.match(text(result), /35\.00 · shop currency/);
    assert.match(text(result), /currency and shipping settings/);
});
