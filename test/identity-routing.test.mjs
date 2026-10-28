import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../stuff/coming-soon.js', import.meta.url), 'utf8');

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
    for (const key of ['invite_token', 'recovery_token', 'confirmation_token', 'email_change_token']) {
        const hash = `#${key}=example%2Bvalue&other=value`;
        const result = loadLandingPage(hash);
        assert.equal(result.destination, `/admin/${hash}`);
        assert.equal(result.fetches, 0, 'skip landing-page content while redirecting');
    }
});

test('normal anchors, empty action tokens and unrelated parameters keep the landing page', () => {
    for (const hash of ['', '#portfolio', '#invite_token=', '#some_invite_token=value', '#notice=invite_token%3Dvalue']) {
        const result = loadLandingPage(hash);
        assert.equal(result.destination, undefined);
        assert.equal(result.fetches, 2, 'normal visitors still load the editable landing-page content');
    }
});
