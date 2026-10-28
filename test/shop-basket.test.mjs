import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

function createShop(saved = '{}') {
    const elements = new Map();
    const scripts = [];
    const element = () => ({
        classList: { toggle() {}, contains() { return false; } }, dataset: {},
        append() {}, replaceChildren() {}, setAttribute() {}, addEventListener() {}
    });
    const context = vm.createContext({
        console: { error() {} }, Intl, Response,
        window: { siteProducts: [], siteReady: false, addEventListener() {} },
        document: {
            getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
            createElement: element, addEventListener() {}, head: { append(script) { scripts.push(script); } }
        },
        localStorage: {
            getItem() { return saved; }, setItem(key, value) { saved = value; }, removeItem() { saved = '{}'; }
        }
    });
    vm.runInContext(readFileSync(new URL('../stuff/shop.js', import.meta.url), 'utf8'), context);
    return { context, scripts, saved: () => JSON.parse(saved) };
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

test('configured checkout renders separate card and PayPal options and uses server create/capture callbacks', async () => {
    for (const environment of ['sandbox', 'live']) {
        const { context, scripts, saved } = createShop(JSON.stringify({ print: { name: 'Print', price: 25, quantity: 2, type: 'physical' } }));
        context.window.siteReady = true;
        context.window.siteProducts = [{ id: 'print', name: 'Print', price: 25, type: 'physical' }];
        context.window.siteConfig = { testMode: environment === 'sandbox', paypalEnvironment: environment, paypalClientId: `${environment}-public`, currency: 'GBP' };
        const callbacks = new Map();
        const rendered = new Map();
        const requests = [];
        context.fetch = async (path, options) => {
            requests.push({ path, data: JSON.parse(options.body) });
            return new Response(JSON.stringify(path.endsWith('paypal-create-order') ? { id: 'ORDER-123' } : { status: 'COMPLETED' }));
        };
        vm.runInContext('renderPayPalButtons()', context);
        assert.equal(scripts.length, 1);
        const url = new URL(scripts[0].src);
        assert.equal(url.searchParams.get('enable-funding'), 'card');
        assert.equal(url.searchParams.get('client-id'), `${environment}-public`);
        assert.equal(url.searchParams.get('currency'), 'GBP');
        assert.equal(url.searchParams.get('components'), 'buttons,funding-eligibility');
        context.window.paypal = { FUNDING: { CARD: 'card', PAYPAL: 'paypal' }, Buttons(options) {
            callbacks.set(options.fundingSource, options);
            return { isEligible: () => true, render(container) {
                assert.equal(context.document.getElementById('checkout-payment-methods').hidden, false, 'SDK receives a visible container');
                rendered.set(options.fundingSource, container);
                return Promise.resolve();
            } };
        } };
        await scripts[0].onload();
        assert.equal(rendered.get('card'), context.document.getElementById('card-buttons'));
        assert.equal(rendered.get('paypal'), context.document.getElementById('paypal-buttons'));
        assert.equal(context.document.getElementById('checkout-payment-methods').hidden, false);
        assert.equal(await callbacks.get('card').createOrder(), 'ORDER-123');
        assert.deepEqual(requests[0], { path: '/.netlify/functions/paypal-create-order', data: { items: [{ id: 'print', quantity: 2 }] } });
        await callbacks.get('card').onApprove({ orderID: 'ORDER-123' });
        assert.deepEqual(requests[1], { path: '/.netlify/functions/paypal-capture-order', data: { orderId: 'ORDER-123' } });
        assert.deepEqual(saved(), {});
        assert.match(context.document.getElementById('cart-status').textContent, /Payment complete/);
    }
});

test('SDK initialization failures leave checkout retryable without loading duplicate SDKs', async () => {
    const { context, scripts } = createShop(JSON.stringify({ print: { name: 'Print', price: 25, quantity: 1 } }));
    context.window.siteReady = true;
    context.window.siteProducts = [{ id: 'print', name: 'Print', price: 25 }];
    context.window.siteConfig = { paypalClientId: 'sandbox-public', paypalEnvironment: 'sandbox', currency: 'GBP' };
    let attempts = 0;
    context.window.paypal = { FUNDING: { CARD: 'card', PAYPAL: 'paypal' }, Buttons() { attempts += 1; throw new Error('SDK initialization failed'); } };
    await vm.runInContext('renderPayPalButtons()', context);
    assert.match(context.document.getElementById('cart-status').textContent, /Close and reopen your basket/);
    await vm.runInContext('renderPayPalButtons()', context);
    assert.equal(attempts, 4, 'a reopened basket retries both payment methods');
    assert.equal(scripts.length, 0, 'an available SDK is reused');
});

function configuredShop() {
    const shop = createShop(JSON.stringify({ print: { name: 'Print', price: 25, quantity: 1 } }));
    shop.context.window.siteReady = true;
    shop.context.window.siteProducts = [{ id: 'print', name: 'Print', price: 25 }];
    shop.context.window.siteConfig = { paypalClientId: 'sandbox-public', paypalEnvironment: 'sandbox', currency: 'GBP', testMode: true };
    return shop;
}

test('card ineligibility explains the fallback while keeping PayPal usable', async () => {
    const { context, saved } = configuredShop();
    context.window.paypal = { FUNDING: { CARD: 'card', PAYPAL: 'paypal' }, Buttons(options) {
        return { isEligible: () => options.fundingSource === 'paypal', render: async () => {} };
    } };
    await vm.runInContext('renderPayPalButtons()', context);
    assert.equal(context.document.getElementById('card-buttons').hidden, true);
    assert.equal(context.document.getElementById('paypal-payment-method').hidden, false);
    assert.match(context.document.getElementById('card-payment-status').textContent, /Direct card payments are not available/);
    assert.equal(saved().print.quantity, 1);
});

test('a failed card render can retry without duplicating a working PayPal button', async () => {
    const { context } = configuredShop();
    const renders = { card: 0, paypal: 0 };
    context.window.paypal = { FUNDING: { CARD: 'card', PAYPAL: 'paypal' }, Buttons(options) {
        return { isEligible: () => true, async render() {
            renders[options.fundingSource] += 1;
            if (options.fundingSource === 'card' && renders.card === 1) throw new Error('Card unavailable');
        } };
    } };
    await vm.runInContext('renderPayPalButtons()', context);
    assert.equal(context.document.getElementById('paypal-payment-method').hidden, false);
    await vm.runInContext('renderPayPalButtons()', context);
    assert.deepEqual(renders, { card: 2, paypal: 1 });
    assert.equal(context.document.getElementById('card-buttons').hidden, false);
});

test('missing merchant credentials never load or pretend to enable card payments', () => {
    const { context, scripts } = configuredShop();
    context.window.siteConfig.paypalClientId = '';
    vm.runInContext('renderPayPalButtons()', context);
    assert.equal(scripts.length, 0);
    assert.equal(context.document.getElementById('checkout-payment-methods').hidden, true);
    assert.match(context.document.getElementById('cart-status').textContent, /not connected yet/);
});

test('cancelled and unconfirmed card payments keep the basket', async () => {
    const { context, saved } = configuredShop();
    let card;
    context.window.paypal = { FUNDING: { CARD: 'card', PAYPAL: 'paypal' }, Buttons(options) {
        if (options.fundingSource === 'card') card = options;
        return { isEligible: () => true, render: async () => {} };
    } };
    await vm.runInContext('renderPayPalButtons()', context);
    card.onCancel();
    assert.equal(saved().print.quantity, 1);
    for (const status of ['PENDING', 'DECLINED']) {
        context.fetch = async () => new Response(JSON.stringify({ status }));
        await assert.rejects(card.onApprove({ orderID: 'ORDER-123' }), /has not confirmed/);
        assert.equal(saved().print.quantity, 1);
    }
    context.fetch = async () => new Response(JSON.stringify({ error: 'Payment declined', status: 'COMPLETED' }), { status: 409 });
    await assert.rejects(card.onApprove({ orderID: 'ORDER-123' }), /Payment declined/);
    assert.equal(saved().print.quantity, 1);
});
