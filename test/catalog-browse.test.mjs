import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { browseItems, pageNumbers } = require('../stuff/catalog-browse.js');
const catalog = count => Array.from({ length: count }, (_, index) => ({ name: `Item ${index + 1}`, id: index + 1 }));

test('name search ignores case and accents, collapses whitespace, and preserves display query', () => {
    const photo = { name: 'Rávéns in the Mist', description: 'Canvas at night' };
    const book = { name: 'Holy Window', description: 'Ravens in the mist' };
    const result = browseItems([photo, book], { query: '  RAVENS  in\n the  ' });
    assert.equal(result.query, 'RAVENS in the');
    assert.deepEqual(result.items, [photo]);
    assert.equal(browseItems([photo, book], { query: 'canvas' }).total, 0);
    assert.equal(browseItems([{ name: 'A\u030art' }], { query: 'årt' }).total, 1);
});

test('invalid items are omitted, source order and objects are preserved without mutations', () => {
    const first = Object.freeze({ name: 'First' });
    const second = Object.freeze({ name: 'Second' });
    const input = Object.freeze([null, undefined, 'Text', 42, {}, { name: 12 }, { name: '' }, { name: '   ' }, first, second]);
    const result = browseItems(input);
    assert.deepEqual(result.items, [first, second]);
    assert.notEqual(result.items, input);
    assert.equal(result.items[0], first);
    assert.equal(input.length, 10);
    assert.equal(browseItems(null).total, 0);
});

test('pagination gives accurate ranges and clamps a page after filtering', () => {
    const result = browseItems(catalog(20), { page: 3 });
    assert.deepEqual(result.items.map(item => item.id), [19, 20]);
    assert.deepEqual({ page: result.page, total: result.total, totalPages: result.totalPages, pageSize: result.pageSize, from: result.from, to: result.to },
        { page: 3, total: 20, totalPages: 3, pageSize: 9, from: 19, to: 20 });
    const filtered = browseItems(catalog(20), { page: 30, query: 'Item 20' });
    assert.equal(filtered.page, 1);
    assert.equal(filtered.from, 1);
    assert.equal(filtered.to, 1);
    assert.equal(browseItems(catalog(20), { page: Number.MAX_SAFE_INTEGER }).page, 3);
});

test('empty results use an empty range and one logical page', () => {
    const result = browseItems(catalog(10), { page: 4, query: 'unmatched' });
    assert.deepEqual(result, { items: [], query: 'unmatched', total: 0, totalPages: 1, page: 1, pageSize: 9, from: 0, to: 0 });
});

test('only safe positive integer page and page sizes are accepted', () => {
    for (const page of [undefined, null, 0, -1, 1.5, '2', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.equal(browseItems(catalog(20), { page }).page, 1, String(page));
    }
    for (const pageSize of [undefined, null, 0, -1, 1.5, '2', 49, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
        assert.equal(browseItems(catalog(20), { pageSize }).pageSize, 9, String(pageSize));
    }
    assert.equal(browseItems(catalog(20), { pageSize: 1 }).totalPages, 20);
    assert.equal(browseItems(catalog(50), { pageSize: 48 }).items.length, 48);
    assert.equal(browseItems(catalog(20), null).pageSize, 9);
});

test('queries are limited to 160 code units and unsupported query values are empty', () => {
    assert.equal(browseItems([], { query: 'a'.repeat(200) }).query.length, 160);
    assert.equal(browseItems([], { query: `${'a'.repeat(159)} b` }).query, 'a'.repeat(159));
    for (const query of [undefined, null, 7, {}, ['Item']]) {
        assert.equal(browseItems(catalog(1), { query }).total, 1);
        assert.equal(browseItems([], { query }).query, '');
    }
});

test('numbered pagination includes endpoints, nearby pages, and fills isolated gaps', () => {
    assert.deepEqual(pageNumbers(1, 1), [1]);
    assert.deepEqual(pageNumbers(1, 3), [1, 2, 3]);
    assert.deepEqual(pageNumbers(1, 10), [1, 2, 'ellipsis', 10]);
    assert.deepEqual(pageNumbers(4, 8), [1, 2, 3, 4, 5, 'ellipsis', 8]);
    assert.deepEqual(pageNumbers(5, 9), [1, 'ellipsis', 4, 5, 6, 'ellipsis', 9]);
    assert.deepEqual(pageNumbers(9, 10), [1, 'ellipsis', 8, 9, 10]);
    assert.deepEqual(pageNumbers(30, 5), [1, 'ellipsis', 4, 5]);
});

test('numbered pagination remains bounded for huge totals and handles invalid inputs', () => {
    for (const total of [undefined, null, 0, -5, 1.5, '10', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.deepEqual(pageNumbers(5, total), [1]);
    }
    assert.deepEqual(pageNumbers('3', 10), [1, 2, 'ellipsis', 10]);
    for (const current of [1, 2, 4, 5, 50, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER]) {
        const result = pageNumbers(current, Number.MAX_SAFE_INTEGER);
        assert.ok(result.length <= 7);
        assert.equal(result[0], 1);
        assert.equal(result.at(-1), Number.MAX_SAFE_INTEGER);
        const values = result.filter(value => value !== 'ellipsis');
        assert.equal(new Set(values).size, values.length);
        assert.ok(values.every(Number.isSafeInteger));
    }
});

test('the browser build exposes the same API without CommonJS', () => {
    const context = vm.createContext({ window: {} });
    vm.runInContext(readFileSync(new URL('../stuff/catalog-browse.js', import.meta.url), 'utf8'), context);
    const api = context.window.MvrkCatalogBrowse;
    assert.equal(typeof api.browseItems, 'function');
    assert.equal(typeof api.pageNumbers, 'function');
    assert.equal(api.browseItems([{ name: 'Écho' }], { query: 'echo' }).total, 1);
    assert.deepEqual(Array.from(api.pageNumbers(5, 9)), pageNumbers(5, 9));
});
