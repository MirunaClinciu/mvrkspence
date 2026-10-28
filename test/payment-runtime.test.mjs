import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import createOrder from '../netlify/functions/paypal-create-order.mjs';
import captureOrder from '../netlify/functions/paypal-capture-order.mjs';
import shop from '../content/shop.json' with { type: 'json' };
import books from '../content/books.json' with { type: 'json' };
import catalog from '../stuff/catalog.js';

const products = catalog.expandCatalog(shop, books);

const originalFetch = globalThis.fetch;
const originalContext = globalThis.netlifyBlobsContext;
const originalUrl = process.env.URL;
const settings = {
    environment: 'sandbox',
    sandboxClientId: 'stored-sandbox-client',
    sandboxSecret: 'stored-sandbox-secret',
    liveClientId: '',
    liveSecret: ''
};
let calls;

beforeEach(() => {
    calls = [];
    process.env.URL = 'https://shop.example';
    // Shape supplied by the modern Netlify runtime; the legacy connectLambda
    // helper drops uncachedEdgeURL and makes strong reads throw instead.
    globalThis.netlifyBlobsContext = Buffer.from(JSON.stringify({
        siteID: 'test-site', token: 'test-blobs-token',
        edgeURL: 'https://cached-blobs.example',
        uncachedEdgeURL: 'https://strong-blobs.example'
    })).toString('base64');
    globalThis.fetch = async (input, options = {}) => {
        const url = String(input);
        calls.push({ url, options });
        if (url.startsWith('https://strong-blobs.example/')) return Response.json(settings);
        if (url === 'https://api-m.sandbox.paypal.com/v1/oauth2/token') {
            assert.equal(options.headers.Authorization,
                `Basic ${Buffer.from('stored-sandbox-client:stored-sandbox-secret').toString('base64')}`);
            return Response.json({ access_token: 'test-access-token' });
        }
        if (url === 'https://api-m.sandbox.paypal.com/v2/checkout/orders') {
            return Response.json({ id: 'ORDER-123', status: 'CREATED' });
        }
        if (url === 'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-123/capture') {
            return Response.json({ id: 'ORDER-123', status: 'COMPLETED', purchase_units: [
                { payments: { captures: [{ id: 'CAPTURE-123', status: 'COMPLETED' }] } }
            ] });
        }
        throw new Error('Unexpected request in payment runtime test.');
    };
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalContext === undefined) delete globalThis.netlifyBlobsContext;
    else globalThis.netlifyBlobsContext = originalContext;
    if (originalUrl === undefined) delete process.env.URL;
    else process.env.URL = originalUrl;
});

function request(path, data) {
    return new Request(`https://shop.example/.netlify/functions/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

test('deployed modern payment entrypoints read real Blobs with strong runtime context', async () => {
    const product = products.find(item => item.available !== false && item.purchasable !== false && item.price > 0);
    const created = await createOrder(request('paypal-create-order', { items: [{ id: product.id, quantity: 1 }] }));
    assert.ok(created instanceof Response);
    assert.equal(created.status, 200);
    assert.deepEqual(await created.json(), { id: 'ORDER-123' });
    assert.equal(created.headers.get('Cache-Control'), 'no-store');

    const captured = await captureOrder(request('paypal-capture-order', { orderId: 'ORDER-123' }));
    assert.equal(captured.status, 200);
    assert.deepEqual(await captured.json(), { status: 'COMPLETED' });
    const blobReads = calls.filter(call => call.url.startsWith('https://strong-blobs.example/'));
    assert.equal(blobReads.length, 2, 'both endpoints use current stored settings');
    assert.ok(blobReads.every(call => call.url.endsWith('/credentials')));
    assert.ok(blobReads.every(call => call.options.headers.authorization === 'Bearer test-blobs-token'));
    assert.ok(!calls.some(call => call.url.startsWith('https://cached-blobs.example/')));
});

test('modern endpoints keep method and malformed-body validation before any settings request', async () => {
    for (const handler of [createOrder, captureOrder]) {
        const get = await handler(new Request('https://shop.example/payment'));
        assert.equal(get.status, 405);
        assert.match((await get.json()).error, /Use POST/);
        const malformed = await handler(new Request('https://shop.example/payment', { method: 'POST', body: '{' }));
        assert.equal(malformed.status, 400);
        const oversized = await handler(new Request('https://shop.example/payment', { method: 'POST', body: ' '.repeat(20001) }));
        assert.equal(oversized.status, 400);
    }
    assert.equal(calls.length, 0);
});

test('modern checkout still fails closed when secure Blobs context is unavailable', async () => {
    delete globalThis.netlifyBlobsContext;
    const product = products.find(item => item.available !== false && item.purchasable !== false && item.price > 0);
    const result = await createOrder(request('paypal-create-order', { items: [{ id: product.id, quantity: 1 }] }));
    assert.equal(result.status, 502);
    assert.match((await result.json()).error, /settings are temporarily unavailable/);
    assert.equal(calls.length, 0, 'never uses stale credentials or contacts PayPal');
});
