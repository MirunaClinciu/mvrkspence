import assert from 'node:assert/strict';
import bundledShop from '../content/shop.json' with { type: 'json' };
const originalCatalog = structuredClone(bundledShop);
import { afterEach, beforeEach, test } from 'node:test';
import { handler as createOrder } from '../netlify/functions/paypal-create-order.mjs';
import { handler as captureOrder } from '../netlify/functions/paypal-capture-order.mjs';

const originalFetch = globalThis.fetch;
const originalEnvironment = {
    URL: process.env.URL,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT
};

const shop = {
    currency: 'USD',
    paypalClientId: 'sandbox-client-id',
    shipping: { enabled: false, amount: 0 },
    products: [
        { id: 'print-1', name: 'Limited Print', price: 12.5, available: true },
        { id: 'sold-out', name: 'Sold Out', price: 50, available: false }
    ]
};

beforeEach(() => {
    process.env.URL = 'https://mvrkspence.example';
    process.env.PAYPAL_CLIENT_SECRET = 'test-secret';
    process.env.PAYPAL_ENVIRONMENT = 'sandbox';
    shop.shipping = { enabled: false, amount: 0 };
    Object.assign(bundledShop, shop);
    shop.products = [
        { id: 'print-1', name: 'Limited Print', price: 12.5, available: true },
        { id: 'sold-out', name: 'Sold Out', price: 50, available: false }
    ];
});

afterEach(() => {
    for (const key of Object.keys(bundledShop)) delete bundledShop[key];
    Object.assign(bundledShop, originalCatalog);
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

function mockPaypal(createResult = { id: 'ORDER-123', status: 'CREATED' }) {
    Object.assign(bundledShop, shop);
    const calls = [];
    globalThis.fetch = async (input, options = {}) => {
        const url = String(input);
        calls.push({ url, options });

        if (url.endsWith('/content/shop.json')) {
            return new Response(JSON.stringify(shop), { status: 200 });
        }
        if (url.endsWith('/v1/oauth2/token')) {
            return new Response(JSON.stringify({ access_token: 'test-access-token' }), { status: 200 });
        }
        if (url.endsWith('/v2/checkout/orders/ORDER-123/capture')) {
            return new Response(JSON.stringify({ id: 'ORDER-123', status: 'COMPLETED' }), { status: 200 });
        }
        if (url.endsWith('/v2/checkout/orders')) {
            return new Response(JSON.stringify(createResult), { status: 201 });
        }
        throw new Error(`Unexpected request: ${url}`);
    };
    return calls;
}

test('create order uses the server catalog price, not a browser-supplied price', async () => {
    Object.assign(bundledShop, shop);
    const calls = mockPaypal();
    const response = await createOrder({
        httpMethod: 'POST',
        body: JSON.stringify({
            items: [{ id: 'print-1', quantity: 2, price: 0.01, name: 'Fake name' }]
        })
    });

    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).id, 'ORDER-123');
    const orderRequest = calls.find(call => call.url.endsWith('/v2/checkout/orders'));
    const order = JSON.parse(orderRequest.options.body);
    assert.equal(order.purchase_units[0].amount.value, '25.00');
    assert.deepEqual(order.purchase_units[0].items[0], {
        name: 'Limited Print',
        quantity: '2',
        unit_amount: { currency_code: 'USD', value: '12.50' },
        category: 'PHYSICAL_GOODS'
    });
});

test('create order rejects unavailable products without contacting PayPal', async () => {
    const calls = mockPaypal();
    const response = await createOrder({
        httpMethod: 'POST',
        body: JSON.stringify({ items: [{ id: 'sold-out', quantity: 1 }] })
    });

    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, /unavailable/i);
    assert.equal(calls.some(call => call.url.endsWith('/v2/checkout/orders')), false);
});

test('create order rejects invalid quantities', async () => {
    Object.assign(bundledShop, shop);
    mockPaypal();
    const response = await createOrder({
        httpMethod: 'POST',
        body: JSON.stringify({ items: [{ id: 'print-1', quantity: 11 }] })
    });

    assert.equal(response.statusCode, 400);
});

test('create order adds configured flat shipping for physical products', async () => {
    shop.shipping = { enabled: true, amount: 4.5 };
    const calls = mockPaypal();
    const response = await createOrder({
        httpMethod: 'POST',
        body: JSON.stringify({ items: [{ id: 'print-1', quantity: 1 }] })
    });

    assert.equal(response.statusCode, 200);
    const orderRequest = calls.find(call => call.url.endsWith('/v2/checkout/orders'));
    const order = JSON.parse(orderRequest.options.body);
    assert.equal(order.purchase_units[0].amount.value, '17.00');
    assert.deepEqual(order.purchase_units[0].amount.breakdown.shipping, {
        currency_code: 'USD',
        value: '4.50'
    });
    assert.equal(
        order.payment_source.paypal.experience_context.shipping_preference,
        'GET_FROM_FILE'
    );
});

test('create order omits shipping for digital products', async () => {
    shop.shipping = { enabled: true, amount: 4.5 };
    shop.products.push({
        id: 'digital-1',
        name: 'Digital artwork',
        price: 8,
        type: 'digital',
        available: true
    });
    const calls = mockPaypal();
    const response = await createOrder({
        httpMethod: 'POST',
        body: JSON.stringify({ items: [{ id: 'digital-1', quantity: 1 }] })
    });

    assert.equal(response.statusCode, 200);
    const orderRequest = calls.find(call => call.url.endsWith('/v2/checkout/orders'));
    const order = JSON.parse(orderRequest.options.body);
    assert.equal(order.purchase_units[0].amount.value, '8.00');
    assert.equal(order.purchase_units[0].amount.breakdown.shipping, undefined);
    assert.equal(order.purchase_units[0].items[0].category, 'DIGITAL_GOODS');
    assert.equal(
        order.payment_source.paypal.experience_context.shipping_preference,
        'NO_SHIPPING'
    );
});

test('create order rejects malformed shipping settings before contacting PayPal', async () => {
    shop.shipping = { enabled: true, amount: '4.555' };
    const calls = mockPaypal();
    const response = await createOrder({
        httpMethod: 'POST',
        body: JSON.stringify({ items: [{ id: 'print-1', quantity: 1 }] })
    });

    assert.equal(response.statusCode, 500);
    assert.equal(calls.some(call => call.url.endsWith('/v2/checkout/orders')), false);
});

test('capture order reports the PayPal capture status', async () => {
    const calls = mockPaypal();
    const response = await captureOrder({
        httpMethod: 'POST',
        body: JSON.stringify({ orderId: 'ORDER-123' })
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { status: 'COMPLETED' });
    assert.equal(
        calls.some(call => call.url.endsWith('/v2/checkout/orders/ORDER-123/capture')),
        true
    );
});

test('payment functions reject non-POST requests', async () => {
    assert.equal((await createOrder({ httpMethod: 'GET' })).statusCode, 405);
    assert.equal((await captureOrder({ httpMethod: 'GET' })).statusCode, 405);
});


test('private deployment checkout does not fetch the protected website catalog', async () => {
    Object.assign(bundledShop, shop);
    const calls = mockPaypal();
    const response = await createOrder({ httpMethod: 'POST', body: JSON.stringify({ items: [{ id: 'print-1', quantity: 1 }] }) });
    assert.equal(response.statusCode, 200);
    assert.equal(calls.some(call => call.url.endsWith('/content/shop.json')), false);
});

test('enquiry-only artwork cannot be purchased even when a browser submits its ID', async () => {
    shop.products[0].purchasable = false;
    Object.assign(bundledShop, shop);
    const calls = mockPaypal();
    const response = await createOrder({ httpMethod: 'POST', body: JSON.stringify({ items: [{ id: 'print-1', quantity: 1 }] }) });
    assert.equal(response.statusCode, 400);
    assert.equal(calls.some(call => call.url.includes('paypal.com')), false);
});

test('malformed JSON returns a client error before any payment request', async () => {
    const calls = mockPaypal();
    for (const handler of [createOrder, captureOrder]) {
        assert.equal((await handler({ httpMethod: 'POST', body: '{broken' })).statusCode, 400);
    }
    assert.equal(calls.length, 0);
});

test('capture retries reuse the PayPal idempotency key', async () => {
    Object.assign(bundledShop, shop);
    const calls = mockPaypal();
    for (let i = 0; i < 2; i++) {
        assert.equal((await captureOrder({ httpMethod: 'POST', body: JSON.stringify({ orderId: 'ORDER-123' }) })).statusCode, 200);
    }
    const captures = calls.filter(call => call.url.endsWith('/ORDER-123/capture'));
    assert.equal(captures[0].options.headers['PayPal-Request-Id'], captures[1].options.headers['PayPal-Request-Id']);
});


test('create order returns the SDK an order requiring payer approval', async () => {
    mockPaypal({ id: 'ORDER-123', status: 'PAYER_ACTION_REQUIRED' });
    const response = await createOrder({ httpMethod: 'POST', body: JSON.stringify({ items: [{ id: 'print-1', quantity: 1 }] }) });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { id: 'ORDER-123' });
});

test('create order rejects missing order IDs and unexpected order states', async () => {
    for (const result of [{ status: 'CREATED' }, { id: '', status: 'CREATED' }, { id: 'ORDER-123', status: 'COMPLETED' }]) {
        mockPaypal(result);
        const response = await createOrder({ httpMethod: 'POST', body: JSON.stringify({ items: [{ id: 'print-1', quantity: 1 }] }) });
        assert.equal(response.statusCode, 502);
    }
});

test('non-object JSON returns a client error before any payment request', async () => {
    const calls = mockPaypal();
    for (const handler of [createOrder, captureOrder]) {
        for (const body of ['[]', 'null', '12', '"text"']) {
            assert.equal((await handler({ httpMethod: 'POST', body })).statusCode, 400);
        }
    }
    assert.equal(calls.length, 0);
});
