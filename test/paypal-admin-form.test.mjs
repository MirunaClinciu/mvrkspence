import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../manage/paypal.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../manage/paypal.html', import.meta.url), 'utf8');
const blankSettings = {
    environment: 'sandbox', sandboxClientId: '', liveClientId: '',
    sandboxSecretConfigured: false, liveSecretConfigured: false
};
const response = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' }
});

function fixture({ initialized = false, user = null, hash = '' } = {}) {
    const ids = ['payment-account-status', 'payment-sign-in-panel', 'payment-settings-panel',
        'payment-settings-form', 'payment-sign-in', 'payment-sign-out', 'payment-retry',
        'payment-save', 'payment-save-status', 'payment-environment', 'sandbox-client-id',
        'live-client-id', 'sandbox-secret', 'live-secret', 'sandbox-secret-status',
        'live-secret-status', 'live-payment-details'];
    const elements = Object.fromEntries(ids.map(id => [id, {
        value: id === 'payment-environment' ? 'sandbox' : '',
        textContent: '', hidden: id === 'payment-settings-panel',
        inert: id === 'payment-settings-panel', disabled: id === 'payment-save',
        handlers: {}, attributes: {}, classList: { toggle() {} },
        addEventListener(name, handler) { this.handlers[name] = handler; },
        setAttribute(name, value) { this.attributes[name] = value; }
    }]));
    if (initialized) elements['netlify-identity-widget'] = {};
    const events = {};
    const calls = [];
    const opened = [];
    let script;
    let redirect;
    let fetchHandler = () => response(blankSettings);
    let refreshed = 0;
    const identity = {
        on(name, handler) { events[name] = handler; }, init() {},
        currentUser() { return user; }, open(name) { opened.push(name); }, close() {},
        async refresh() { refreshed += 1; return 'test-identity-jwt'; },
        async logout() { events.logout(); }
    };
    const context = createContext({
        URLSearchParams,
        window: { location: { hash, replace(value) { redirect = value; }, reload() {} }, netlifyIdentity: identity },
        document: {
            getElementById(id) { return elements[id]; },
            createElement() { return {}; },
            head: { append(value) { script = value; } }
        },
        localStorage: new Proxy({}, { get() { throw new Error('Payment credentials must not use browser storage'); } }),
        fetch: async (url, options) => { calls.push({ url, options }); return fetchHandler(url, options); }
    });
    runInContext(source, context);
    return {
        elements, events, calls, identity, opened,
        get script() { return script; }, get redirect() { return redirect; },
        get refreshed() { return refreshed; },
        useFetch(handler) { fetchHandler = handler; },
        async signIn() { script.onload(); await events.init({ email: 'owner@example.com' }); },
        submit() { return elements['payment-settings-form'].handlers.submit({ preventDefault() {} }); }
    };
}

test('payment form stays hidden until a signed-in administrator gets an authorized settings response', async () => {
    const f = fixture();
    assert.equal(f.elements['payment-settings-panel'].hidden, true);
    await f.submit();
    assert.equal(f.calls.length, 0);
    f.script.onload();
    await f.events.init(null);
    assert.equal(f.elements['payment-settings-panel'].hidden, true);
    f.elements['payment-sign-in'].handlers.click();
    assert.deepEqual(f.opened, ['login']);
    await f.events.init({ email: '<b>owner@example.com</b>' });
    assert.equal(f.calls[0].url, '/.netlify/functions/admin-paypal-settings');
    assert.equal(f.calls[0].options.headers.Authorization, 'Bearer test-identity-jwt');
    assert.equal(f.calls[0].options.cache, 'no-store');
    assert.equal(f.calls[0].options.credentials, 'same-origin');
    assert.equal(f.calls[0].options.redirect, 'error');
    assert.equal(f.elements['payment-settings-panel'].hidden, false);
    assert.equal(f.elements['payment-settings-panel'].inert, false);
    assert.equal(f.elements['payment-account-status'].textContent, 'Signed in as <b>owner@example.com</b>');
});

test('forbidden accounts never see the settings form', async () => {
    const f = fixture();
    f.useFetch(() => response({ error: 'Only the website owner can manage payment settings.' }, 403));
    await f.signIn();
    assert.equal(f.elements['payment-settings-panel'].hidden, true);
    assert.equal(f.elements['payment-settings-panel'].inert, true);
    assert.equal(f.elements['payment-save'].disabled, true);
    assert.match(f.elements['payment-account-status'].textContent, /Only the website owner/);
});

test('saving sends credentials only to the authenticated server and clears both secret fields', async () => {
    const f = fixture();
    await f.signIn();
    f.elements['sandbox-client-id'].value = '  sample-sandbox-client  ';
    f.elements['sandbox-secret'].value = '  sample-test-secret  ';
    f.elements['live-secret'].value = 'unused-live-secret';
    f.useFetch(() => response({ ...blankSettings, sandboxClientId: 'sample-sandbox-client', sandboxSecretConfigured: true }));
    await f.submit();
    const request = f.calls.at(-1);
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, 'Bearer test-identity-jwt');
    assert.equal(request.options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(request.options.body), {
        environment: 'sandbox', sandboxClientId: 'sample-sandbox-client', liveClientId: '',
        sandboxSecret: 'sample-test-secret', liveSecret: 'unused-live-secret'
    });
    assert.equal(f.elements['sandbox-secret'].value, '');
    assert.equal(f.elements['live-secret'].value, '');
    assert.equal(f.elements['payment-save'].disabled, false);
    assert.match(f.elements['sandbox-secret-status'].textContent, /Secret saved/);
    assert.match(f.elements['payment-save-status'].textContent, /test payments connected/);
    assert.equal(f.refreshed, 2, 'refresh the session before each authenticated request');
});

test('blank secrets preserve saved values and duplicate submits are blocked during a request', async () => {
    const f = fixture();
    f.useFetch(() => response({ ...blankSettings, sandboxClientId: 'saved-client', sandboxSecretConfigured: true }));
    await f.signIn();
    let resolveSave;
    f.useFetch(() => new Promise(resolve => { resolveSave = resolve; }));
    const first = f.submit();
    await Promise.resolve();
    await f.submit();
    assert.equal(f.calls.length, 2, 'one load and only one save');
    assert.equal(JSON.parse(f.calls.at(-1).options.body).sandboxSecret, '');
    assert.equal(f.elements['payment-save'].disabled, true);
    resolveSave(response({ ...blankSettings, sandboxClientId: 'saved-client', sandboxSecretConfigured: true }));
    await first;
    assert.equal(f.elements['payment-save'].disabled, false);
});

test('provider failures clear entered secrets without claiming a connection', async () => {
    const f = fixture();
    await f.signIn();
    f.elements['sandbox-secret'].value = 'wrong-test-secret';
    f.useFetch(() => response({ error: 'PayPal could not verify these app details.' }, 400));
    await f.submit();
    assert.equal(f.elements['sandbox-secret'].value, '');
    assert.match(f.elements['payment-save-status'].textContent, /could not verify/);
    assert.equal(f.elements['payment-save'].disabled, false);
});

test('an expired session during save returns to sign-in and clears credentials', async () => {
    const f = fixture();
    await f.signIn();
    f.elements['sandbox-secret'].value = 'entered-secret';
    f.useFetch(() => response({ error: 'Sign in again to manage PayPal settings.' }, 401));
    await f.submit();
    assert.equal(f.elements['payment-settings-panel'].hidden, true);
    assert.equal(f.elements['payment-sign-in-panel'].hidden, false);
    assert.equal(f.elements['sandbox-secret'].value, '');
    assert.match(f.elements['payment-account-status'].textContent, /Sign in again/);
});

test('logout clears credentials and a pending load cannot reopen the form', async () => {
    const f = fixture();
    let resolveLoad;
    f.useFetch(() => new Promise(resolve => { resolveLoad = resolve; }));
    f.script.onload();
    const pending = f.events.init({ email: 'owner@example.com' });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    f.elements['sandbox-secret'].value = 'typed-secret';
    f.events.logout();
    resolveLoad(response({ ...blankSettings, sandboxSecretConfigured: true }));
    await pending;
    assert.equal(f.elements['payment-settings-panel'].hidden, true);
    assert.equal(f.elements['sandbox-secret'].value, '');
    assert.equal(f.elements['sandbox-client-id'].value, '');
});

test('logout during token refresh prevents a stale credential submission', async () => {
    const f = fixture();
    await f.signIn();
    let resolveRefresh;
    f.identity.refresh = () => new Promise(resolve => { resolveRefresh = resolve; });
    f.elements['sandbox-secret'].value = 'old-session-secret';
    const pending = f.submit();
    f.events.logout();
    resolveRefresh('old-session-jwt');
    await pending;
    assert.equal(f.calls.length, 1, 'only the initial GET reached the server');
    assert.equal(f.elements['sandbox-secret'].value, '');
    assert.equal(f.elements['payment-settings-panel'].hidden, true);
});

test('a late save response cannot clear credentials typed in a new session', async () => {
    const f = fixture();
    await f.signIn();
    let resolveSave;
    f.useFetch((url, options) => options.method === 'POST'
        ? new Promise(resolve => { resolveSave = resolve; }) : response(blankSettings));
    f.elements['sandbox-secret'].value = 'old-session-secret';
    const pending = f.submit();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    f.events.logout();
    await f.events.init({ email: 'new-owner@example.com' });
    f.elements['sandbox-secret'].value = 'new-session-secret';
    resolveSave(response({ ...blankSettings, sandboxClientId: 'old-client', sandboxSecretConfigured: true }));
    await pending;
    assert.equal(f.elements['sandbox-secret'].value, 'new-session-secret');
    assert.equal(f.elements['sandbox-client-id'].value, '');
    assert.equal(f.elements['payment-account-status'].textContent, 'Signed in as new-owner@example.com');
    assert.equal(f.elements['payment-save-status'].textContent, '');
});

test('restored sessions load settings after the Identity CDN initialized', async () => {
    const f = fixture({ initialized: true, user: { email: 'owner@example.com' } });
    f.script.onload();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    assert.equal(f.calls.length, 1);
    // The source never logs or stores credentials, and passwords are masked.
    assert.ok(!source.includes('localStorage'));
    assert.ok(!source.includes('console.'));
    assert.match(html, /id="sandbox-secret"[^>]+type="password"[^>]+autocomplete="new-password"/);
    assert.match(html, /id="live-secret"[^>]+type="password"/);
    assert.match(html, /id="payment-settings-panel"[^>]+hidden inert/);
});

test('Identity email callbacks preserve their fragment for the existing admin handler', () => {
    const f = fixture({ hash: '#recovery_token=sample%2Btoken' });
    assert.equal(f.redirect, '/admin/#recovery_token=sample%2Btoken');
    assert.equal(f.script, undefined);
});
