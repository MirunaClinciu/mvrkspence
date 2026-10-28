import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../manage/dashboard.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../manage/index.html', import.meta.url), 'utf8');

function fixture({ hash = '', identityAvailable = true, alreadyInitialized = false, currentUser = null } = {}) {
    const elements = Object.fromEntries(['account-status', 'sign-in-panel', 'editor-dashboard', 'sign-in', 'reset-password', 'sign-out', 'retry-connection'].map(id => [id, {
        hidden: id === 'editor-dashboard' || id === 'retry-connection',
        inert: id === 'editor-dashboard',
        disabled: id === 'sign-in' || id === 'reset-password',
        textContent: '',
        handlers: {},
        classList: { toggle() {} },
        addEventListener(name, handler) { this.handlers[name] = handler; }
    }]));
    if (alreadyInitialized) elements['netlify-identity-widget'] = {};
    const events = {};
    const opened = [];
    let script;
    let redirect;
    let reloads = 0;
    let closes = 0;
    const identity = {
        on(name, handler) { events[name] = handler; },
        init() {},
        currentUser() { return currentUser; },
        open(name) { opened.push(name); },
        close() { closes += 1; },
        logout() { events.logout(); return Promise.resolve(); }
    };
    const context = createContext({
        URLSearchParams,
        window: {
            location: { hash, replace(value) { redirect = value; }, reload() { reloads += 1; } },
            netlifyIdentity: identityAvailable ? identity : undefined
        },
        document: {
            getElementById: id => elements[id],
            createElement: () => ({}),
            head: { append(value) { script = value; } }
        }
    });
    runInContext(source, context);
    return {
        elements, events, identity, opened,
        get script() { return script; },
        get redirect() { return redirect; },
        get reloads() { return reloads; },
        get closes() { return closes; }
    };
}

test('dashboard remains hidden until Identity initializes, then responds to login and logout', () => {
    const f = fixture();
    assert.equal(f.elements['editor-dashboard'].hidden, true);
    assert.equal(f.elements['editor-dashboard'].inert, true);
    assert.equal(f.elements['sign-in'].disabled, true);
    assert.equal(f.script.src, 'https://identity.netlify.com/v1/netlify-identity-widget.js');
    f.script.onload();
    assert.equal(f.elements['editor-dashboard'].hidden, true, 'loading the library does not grant access');
    f.events.init(null);
    assert.equal(f.elements['sign-in'].disabled, false);
    f.elements['sign-in'].handlers.click();
    assert.deepEqual(f.opened, ['login']);
    f.events.login({ email: '<b>editor@example.com</b>' });
    assert.equal(f.elements['editor-dashboard'].hidden, false);
    assert.equal(f.elements['editor-dashboard'].inert, false);
    assert.equal(f.elements['sign-in-panel'].hidden, true);
    assert.equal(f.elements['account-status'].textContent, 'Signed in as <b>editor@example.com</b>');
    assert.equal(f.closes, 1);
    f.elements['sign-out'].handlers.click();
    assert.equal(f.elements['editor-dashboard'].hidden, true);
    assert.equal(f.elements['editor-dashboard'].inert, true);
    assert.equal(f.elements['sign-in-panel'].hidden, false);
});

test('restored Identity sessions open the dashboard and reset uses the real login widget', () => {
    const f = fixture();
    f.script.onload();
    f.events.init({ email: 'editor@example.com' });
    assert.equal(f.elements['editor-dashboard'].hidden, false);
    f.events.logout();
    f.elements['reset-password'].handlers.click();
    assert.deepEqual(f.opened, ['login']);
    assert.match(f.elements['account-status'].textContent, /reset email/);
});

test('the CDN auto-initialization event may finish before the script load handler', () => {
    const signedIn = fixture({ alreadyInitialized: true, currentUser: { email: 'editor@example.com' } });
    signedIn.script.onload();
    assert.equal(signedIn.elements['editor-dashboard'].hidden, false);
    const signedOut = fixture({ alreadyInitialized: true });
    signedOut.script.onload();
    assert.equal(signedOut.elements['editor-dashboard'].hidden, true);
    assert.equal(signedOut.elements['sign-in'].disabled, false);
});

test('a blocked Identity script provides recovery without exposing edit links', () => {
    const f = fixture({ identityAvailable: false });
    f.script.onerror();
    assert.equal(f.elements['editor-dashboard'].hidden, true);
    assert.equal(f.elements['sign-in'].disabled, true);
    assert.equal(f.elements['retry-connection'].hidden, false);
    assert.match(f.elements['account-status'].textContent, /could not connect/);
    f.elements['retry-connection'].handlers.click();
    assert.equal(f.reloads, 1);
});

test('invitation and recovery callbacks stay in the fragment and reach the existing admin handler', () => {
    for (const action of ['invite_token', 'recovery_token', 'confirmation_token', 'email_change_token']) {
        const hash = `#${action}=sample%2Btoken`;
        const f = fixture({ hash });
        assert.equal(f.redirect, `/admin/${hash}`);
        assert.equal(f.script, undefined);
    }
    assert.equal(fixture({ hash: '#other=value' }).redirect, undefined);
});

test('editing tasks link directly to the existing CMS file entries', () => {
    for (const path of [
        '/admin/#/collections/pages/entries/home',
        '/admin/#/collections/pages/entries/concept',
        '/admin/#/collections/pages/entries/contact',
        '/admin/#/collections/shop/entries/shop',
        '/admin/#/collections/site/entries/site-settings',
        '/admin/#/collections/site/entries/coming-soon'
    ]) assert.ok(html.includes(`href="${path}"`), path);
    assert.match(html, /id="editor-dashboard"[^>]*hidden inert/);
    assert.ok(!html.includes('type="password"'), 'credential handling belongs to Netlify Identity');
});
