import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../stuff/coming-soon.js', import.meta.url), 'utf8');
const portfolioRedirectSource = readFileSync(new URL('../stuff/identity-redirect.js', import.meta.url), 'utf8');
const emailActions = ['invite_token', 'recovery_token', 'confirmation_token', 'email_change_token'];
const normalAnchors = ['', '#portfolio', '#invite_token=', '#some_invite_token=value', '#notice=invite_token%3Dvalue'];

function loadPortfolioRedirect(hash) {
    let destination;
    const window = { location: { hash, replace(value) { destination = value; } } };
    runInContext(portfolioRedirectSource, createContext({ window, URLSearchParams }), {
        filename: 'stuff/identity-redirect.js'
    });
    return { destination, redirecting: window.MvrkIdentityRedirecting };
}

function loadLandingPage(hash) {
    let destination;
    let fetches = 0;
    const context = createContext({
        window: { location: { hash, replace(value) { destination = value; } } },
        URLSearchParams,
        document: { getElementById() { return {}; } },
        fetch() { fetches += 1; return new Promise(() => {}); }
    });
    runInContext(source, context, { filename: 'stuff/coming-soon.js' });
    return { destination, fetches };
}

test('Identity email actions reach the admin widget with their fragment preserved', () => {
    for (const key of emailActions) {
        const hash = `#${key}=example%2Bvalue&other=value`;
        const result = loadLandingPage(hash);
        assert.equal(result.destination, `/admin/${hash}`);
        assert.equal(result.fetches, 0, 'skip landing-page content while redirecting');
    }
});

test('normal anchors, empty action tokens and unrelated parameters keep the landing page', () => {
    for (const hash of normalAnchors) {
        const result = loadLandingPage(hash);
        assert.equal(result.destination, undefined);
        assert.equal(result.fetches, 2, 'normal visitors still load the editable landing-page content');
    }
});

test('portfolio entry redirects Identity email actions without decoding or moving the fragment into a query', () => {
    for (const key of emailActions) {
        const hash = `#${key}=example%2Bvalue%3D&other=value%20with%20spaces`;
        const result = loadPortfolioRedirect(hash);
        assert.equal(result.destination, `/admin/${hash}`);
        assert.equal(result.redirecting, true, 'site bootstrap can skip content loading while redirecting');
    }
});

test('portfolio entry leaves normal anchors and empty Identity tokens in place', () => {
    for (const hash of normalAnchors) {
        const result = loadPortfolioRedirect(hash);
        assert.equal(result.destination, undefined);
        assert.equal(result.redirecting, false);
    }
});

test('landing and preview process Identity fragments before their deferred content bootstrap', () => {
    for (const [path, bootstrap] of [['index.html', '/stuff/coming-soon.js'], ['preview/index.html', 'stuff/site.js']]) {
        const html = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
        const scripts = [...html.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)>/g)];
        const redirectIndex = scripts.findIndex(match => match[2].endsWith('stuff/identity-redirect.js'));
        const bootstrapIndex = scripts.findIndex(match => match[2] === bootstrap);
        assert.ok(redirectIndex >= 0 && bootstrapIndex > redirectIndex, `${path} handles email links before the site`);
        assert.doesNotMatch(scripts[redirectIndex][0], /\b(?:async|defer)\b/, 'Identity redirect runs during head parsing');
        if (path.startsWith('preview/')) assert.ok(html.includes('data-site-prefix="/preview/"'));
        else assert.ok(html.includes('id="coming-soon-message"'));
    }
});

test('public landing does not advertise editing or preview routes, while the complete preview remains available', () => {
    for (const path of ['index.html', 'coming-soon.html']) {
        const html = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
        assert.doesNotMatch(html, /<a\b[^>]*href="\/(?:manage|admin|preview)/);
        assert.doesNotMatch(html, /src="(?:\/)?stuff\/(?:site|shop)\.js"/);
        assert.ok(html.includes('id="coming-soon-socials"'));
    }
    for (const page of ['index', 'artwork', 'concept', 'contact']) {
        const html = readFileSync(new URL(`../preview/${page}.html`, import.meta.url), 'utf8');
        assert.ok(html.includes('data-site-prefix="/preview/"'));
        assert.ok(html.includes('name="robots" content="noindex, nofollow, noarchive"'));
    }
});
