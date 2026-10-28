import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

function createShop(saved = '{}') {
    const elements = new Map();
    const element = () => ({
        classList: { toggle() {}, contains() { return false; } }, dataset: {},
        append() {}, replaceChildren() {}, setAttribute() {}, addEventListener() {}
    });
    const context = vm.createContext({
        console: { error() {} }, Intl, Response,
        window: { siteProducts: [], siteReady: false, addEventListener() {} },
        document: {
            getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
            createElement: element, addEventListener() {}, head: { append() {} }
        },
        localStorage: {
            getItem() { return saved; }, setItem(key, value) { saved = value; }, removeItem() { saved = '{}'; }
        }
    });
    vm.runInContext(readFileSync(new URL('../stuff/shop.js', import.meta.url), 'utf8'), context);
    return { context, saved: () => JSON.parse(saved) };
}

test('damaged saved line items do not crash the basket on page load', () => {
    const { context } = createShop(JSON.stringify({
        broken: null, string: 'bad', negative: { name: 'No', price: 12, quantity: -1 },
        tooMany: { name: 'No', price: 12, quantity: 99 },
        valid: { name: 'Valid', price: 12, quantity: 2 }
    }));
    assert.equal(vm.runInContext('Object.keys(getBasket()).join()', context), 'valid');
});

test('product IDs matching object prototype names can be added and changed safely', () => {
    const { context, saved } = createShop();
    context.window.siteReady = true;
    context.window.siteProducts = [{ id: '__proto__', name: 'Print', price: 12, available: true }];
    vm.runInContext("addToBasket('__proto__'); changeQuantity('__proto__', 1)", context);
    assert.equal(saved()['__proto__'].quantity, 2);
});

test('current catalog removes enquiry-only products from a previously saved basket', () => {
    const { context, saved } = createShop(JSON.stringify({ print: { name: 'Print', price: 12, quantity: 1 } }));
    context.window.siteReady = true;
    context.window.siteProducts = [{ id: 'print', name: 'Print', price: 12, purchasable: false }];
    vm.runInContext('renderBasket()', context);
    assert.deepEqual(saved(), {});
});

test('HTML error responses show a useful checkout failure instead of a JSON parsing error', async () => {
    const { context } = createShop();
    context.fetch = async () => new Response('<html>Unavailable</html>', { status: 503 });
    await assert.rejects(vm.runInContext("postJson('/payment', {})", context), /payment service/);
});

test('sample catalogs cannot load live PayPal buttons even when given a live client ID', () => {
    const { context } = createShop(JSON.stringify({ print: { name: 'Print', price: 25, quantity: 1, type: 'physical' } }));
    context.window.siteReady = true;
    context.window.siteProducts = [{ id: 'print', name: 'Print', price: 25, type: 'physical' }];
    context.window.siteConfig = { testMode: true, paypalEnvironment: 'live', paypalClientId: 'live-public', currency: 'GBP' };
    vm.runInContext('renderPayPalButtons()', context);
    assert.match(context.document.getElementById('cart-status').textContent, /sample catalogue.*Test payments/);
});
