import assert from 'node:assert/strict';
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
    shop.products = [
        { id: 'print-1', name: 'Limited Print', price: 12.5, available: true },
        { id: 'sold-out', name: 'Sold Out', price: 50, available: false }
    ];
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

function mockPaypal(createResult = { id: 'ORDER-123', status: 'CREATED' }) {
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
