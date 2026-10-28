import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdminPayPalSettingsHandler, verifyPayPalCredentials } from '../netlify/functions/admin-paypal-settings.mjs';
import { createPublicPayPalSettingsHandler } from '../netlify/functions/paypal-public-settings.mjs';
import {
    readPaymentSettings,
    writePaymentSettings
} from '../netlify/lib/payment-settings.mjs';

const owner = { id: '74e5724b-5c9e-4540-811b-a75a9976f6f3', email: 'owner@example.test' };
const origin = 'https://store.example.test';
const blank = () => ({ environment: 'sandbox', sandboxClientId: '', liveClientId: '', sandboxSecret: '', liveSecret: '' });
const configured = () => ({ environment: 'sandbox', sandboxClientId: 'test-client', liveClientId: 'live-client', sandboxSecret: 'test-private-secret', liveSecret: 'live-private-secret' });

function fixture({ user = owner, saved = null, fallback = blank(), sampleCatalogue = true, readError = null, verifyError = null, writeError = null } = {}) {
    const calls = { reads: 0, writes: [], verification: [] };
    const handler = createAdminPayPalSettingsHandler({
        authenticate: async () => user,
        readSettings: async () => { calls.reads++; if (readError) throw readError; return saved; },
        writeSettings: async settings => { if (writeError) throw writeError; calls.writes.push(structuredClone(settings)); },
        fallbackSettings: () => fallback,
        verifyCredentials: async (...args) => { calls.verification.push(args); if (verifyError) throw verifyError; },
        sampleCatalogue
    });
    return { handler, calls };
}

function request(body, { method = body === undefined ? 'GET' : 'POST', requestOrigin = origin, contentType = 'application/json' } = {}) {
    const headers = {};
    if (requestOrigin !== null) headers.Origin = requestOrigin;
    if (contentType !== null) headers['Content-Type'] = contentType;
    return new Request(`${origin}/.netlify/functions/admin-paypal-settings`, {
        method,
        headers,
        ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {})
    });
}

test('payment settings require a verified owner or server-controlled admin role', async () => {
    for (const user of [null, { id: 'another-user', email: owner.email }, { id: 'another-user', userMetadata: { roles: ['admin'] } }]) {
        const f = fixture({ user });
        const response = await f.handler(request());
        assert.equal(response.status, user ? 403 : 401);
        assert.equal(f.calls.reads, 0);
    }
    const f = fixture({ user: { id: 'another-user', roles: ['admin'] } });
    assert.equal((await f.handler(request())).status, 200);
});

test('admin GET reports public IDs and presence flags without returning secrets', async () => {
    const f = fixture({ saved: configured() });
    const response = await f.handler(request());
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes('private-secret'));
    assert.deepEqual(JSON.parse(text), {
        environment: 'sandbox', sandboxClientId: 'test-client', liveClientId: 'live-client',
        sandboxSecretConfigured: true, liveSecretConfigured: true
    });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('saving requires same-origin JSON and rejects malformed or oversized input', async () => {
    const f = fixture();
    assert.equal((await f.handler(request({}, { requestOrigin: 'https://elsewhere.test' }))).status, 403);
    assert.equal((await f.handler(request({}, { requestOrigin: null }))).status, 403);
    assert.equal((await f.handler(request({}, { contentType: 'text/plain' }))).status, 415);
    assert.equal((await f.handler(request('{invalid'))).status, 400);
    assert.equal((await f.handler(request('[]'))).status, 400);
    assert.equal((await f.handler(request(' '.repeat(12001)))).status, 413);
    assert.equal(f.calls.writes.length, 0);
});

test('first save validates the sandbox pair before persistence and never returns its secret', async () => {
    const f = fixture();
    const response = await f.handler(request({ environment: 'sandbox', sandboxClientId: 'test-client', sandboxSecret: 'new-private-secret', liveClientId: '', liveSecret: '' }));
    assert.equal(response.status, 200);
    assert.deepEqual(f.calls.verification, [['sandbox', 'test-client', 'new-private-secret']]);
    assert.equal(f.calls.writes.length, 1);
    assert.equal(f.calls.writes[0].sandboxSecret, 'new-private-secret');
    const text = await response.text();
    assert.ok(!text.includes('new-private-secret'));
    assert.equal(JSON.parse(text).sandboxSecretConfigured, true);
});

test('blank secrets preserve saved secrets; changing a Client ID requires its matching secret', async () => {
    const f = fixture({ saved: configured() });
    const response = await f.handler(request({ environment: 'sandbox', sandboxClientId: 'test-client', liveClientId: 'live-client', sandboxSecret: '', liveSecret: '' }));
    assert.equal(response.status, 200);
    assert.equal(f.calls.writes[0].sandboxSecret, 'test-private-secret');
    assert.equal(f.calls.writes[0].liveSecret, 'live-private-secret');
    const changed = fixture({ saved: configured() });
    const rejected = await changed.handler(request({ environment: 'sandbox', sandboxClientId: 'different-client', sandboxSecret: '' }));
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).error, /matching test Secret/);
    assert.equal(changed.calls.writes.length, 0);
});

test('missing active credentials, invalid modes, and sample live activation cannot be saved', async () => {
    const f = fixture();
    for (const body of [{ environment: 'sandbox' }, { environment: 'constructor' }, { environment: 'live', liveClientId: 'client', liveSecret: 'secret' }]) {
        assert.equal((await f.handler(request(body))).status, 400);
    }
    assert.equal(f.calls.writes.length, 0);
    assert.equal(f.calls.verification.length, 0);
});

test('live credentials may be stored while sandbox remains selected, with both pairs verified', async () => {
    const f = fixture({ saved: configured() });
    const response = await f.handler(request({ environment: 'sandbox', liveClientId: 'new-live-client', liveSecret: 'new-live-secret' }));
    assert.equal(response.status, 200);
    assert.deepEqual(f.calls.verification, [
        ['sandbox', 'test-client', 'test-private-secret'], ['live', 'new-live-client', 'new-live-secret']
    ]);
    assert.equal(f.calls.writes[0].environment, 'sandbox');
});

test('unexpected storage and provider errors do not leak secret values or trigger a write', async () => {
    const secret = 'never-return-this-secret';
    for (const options of [
        { readError: Object.assign(new Error(secret), { status: 403 }) },
        { verifyError: Object.assign(new Error(secret), { status: 400 }) },
        { writeError: Object.assign(new Error(secret), { status: 500 }) }
    ]) {
        const f = fixture({ saved: configured(), ...options });
        const response = await f.handler(request({ environment: 'sandbox' }));
        assert.equal(response.status, 503);
        assert.ok(!(await response.text()).includes(secret));
        assert.equal(f.calls.writes.length, 0);
    }
});

test('public settings expose only the selected mode and public Client IDs', async () => {
    const handler = createPublicPayPalSettingsHandler({ readSettings: async () => configured() });
    const response = await handler(new Request(`${origin}/.netlify/functions/paypal-public-settings`));
    assert.deepEqual(await response.json(), { environment: 'sandbox', sandboxClientId: 'test-client', liveClientId: 'live-client' });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const failed = createPublicPayPalSettingsHandler({ readSettings: async () => { throw new Error('private-secret'); } });
    const error = await failed(new Request(origin));
    assert.equal(error.status, 503);
    assert.ok(!(await error.text()).includes('private-secret'));
});

test('storage uses a fixed private key and strongly consistent reads', async () => {
    const calls = [];
    const store = {
        async get(...args) { calls.push(args); return configured(); },
        async setJSON(...args) { calls.push(args); }
    };
    assert.deepEqual(await readPaymentSettings({ store }), configured());
    await writePaymentSettings({ ...configured(), attackerKey: 'ignored' }, { store });
    assert.deepEqual(calls[0], ['credentials', { type: 'json', consistency: 'strong' }]);
    assert.equal(calls[1][0], 'credentials');
    assert.equal(calls[1][1].attackerKey, undefined);
    await assert.rejects(readPaymentSettings({ store: { async get() { return { environment: 'sandbox' }; } } }), /unavailable/);
});

test('credential verification uses OAuth only and sanitizes PayPal failures', async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    try {
        globalThis.fetch = async (url, options) => {
            calls.push({ url, options });
            return new Response(JSON.stringify({ access_token: 'temporary-token' }), { status: 200 });
        };
        await verifyPayPalCredentials('sandbox', 'test-client', 'test-secret');
        assert.equal(calls[0].url, 'https://api-m.sandbox.paypal.com/v1/oauth2/token');
        assert.equal(calls[0].options.body, 'grant_type=client_credentials');
        assert.equal(Buffer.from(calls[0].options.headers.Authorization.slice(6), 'base64').toString(), 'test-client:test-secret');
        assert.ok(calls.every(call => !call.url.includes('/orders')));
        globalThis.fetch = async () => new Response('provider-private-secret', { status: 401 });
        await assert.rejects(verifyPayPalCredentials('sandbox', 'client', 'secret'), error =>
            /could not verify/.test(error.message) && !error.message.includes('provider-private-secret'));
    } finally {
        globalThis.fetch = originalFetch;
    }
});
