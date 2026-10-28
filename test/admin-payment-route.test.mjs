import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const html = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
const source = html.match(/<script id="legacy-payment-route">([\s\S]*?)<\/script>/)[1];

function editorRoute(hash) {
    const destinations = [];
    const listeners = {};
    const location = { hash, replace(value) { destinations.push(value); } };
    runInContext(source, createContext({ window: {
        location,
        addEventListener(name, callback) { listeners[name] = callback; }
    } }));
    return { destinations, location, changeHash(value) { location.hash = value; listeners.hashchange(); } };
}

test('legacy payment editor bookmarks reach the secure payment form before the CMS loads', () => {
    for (const hash of ['#/collections/shop/entries/payments', '#/collections/shop/entries/payments/']) {
        assert.deepEqual(editorRoute(hash).destinations, ['/manage/paypal.html']);
    }
    const redirectIndex = html.indexOf('id="legacy-payment-route"');
    assert.ok(redirectIndex < html.indexOf('src="https://identity.netlify.com/'));
    assert.ok(redirectIndex < html.indexOf('src="https://unpkg.com/decap-cms'));
});

test('normal editing routes and Identity action tokens remain untouched', () => {
    const hashes = ['', '#/workflow', '#/collections/shop/entries/shop', '#/collections/pages/entries/contact'];
    for (const key of ['invite_token', 'recovery_token', 'confirmation_token', 'email_change_token']) {
        hashes.push(`#${key}=example%2Bvalue&other=value`);
    }
    for (const hash of hashes) {
        const route = editorRoute(hash);
        assert.deepEqual(route.destinations, []);
        assert.equal(route.location.hash, hash);
    }
});

test('opening an old payment draft from an already loaded editor also uses the secure form', () => {
    const route = editorRoute('#/workflow');
    route.changeHash('#/collections/pages/entries/home');
    assert.deepEqual(route.destinations, []);
    route.changeHash('#/collections/shop/entries/payments');
    assert.deepEqual(route.destinations, ['/manage/paypal.html']);
});
