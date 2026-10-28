(function initializePaymentSettings() {
    'use strict';

    const hash = window.location.hash || '';
    const parameters = new URLSearchParams(hash.replace(/^#/, ''));
    if (['invite_token', 'recovery_token', 'confirmation_token', 'email_change_token'].some(key => parameters.get(key))) {
        window.location.replace(`/admin/${hash}`);
        return;
    }

    const element = id => document.getElementById(id);
    const accountStatus = element('payment-account-status');
    const signInPanel = element('payment-sign-in-panel');
    const settingsPanel = element('payment-settings-panel');
    const form = element('payment-settings-form');
    const signIn = element('payment-sign-in');
    const signOut = element('payment-sign-out');
    const retry = element('payment-retry');
    const save = element('payment-save');
    const saveStatus = element('payment-save-status');
    const environment = element('payment-environment');
    const sandboxClientId = element('sandbox-client-id');
    const liveClientId = element('live-client-id');
    const sandboxSecret = element('sandbox-secret');
    const liveSecret = element('live-secret');
    const fields = [environment, sandboxClientId, liveClientId, sandboxSecret, liveSecret];
    let identity;
    let signedIn = false;
    let loaded = false;
    let saving = false;
    let session = 0;

    function showStatus(target, message, isError = false) {
        target.textContent = message;
        target.classList.toggle('is-error', isError);
    }

    function clearSecrets() {
        sandboxSecret.value = '';
        liveSecret.value = '';
    }

    function setBusy(busy) {
        saving = busy;
        fields.forEach(field => { field.disabled = busy; });
        save.disabled = busy || !loaded || !signedIn;
        save.textContent = busy ? 'Checking and saving…' : 'Save and connect PayPal';
        form.setAttribute('aria-busy', String(busy));
    }

    function showSignedOut() {
        session += 1;
        signedIn = false;
        loaded = false;
        clearSecrets();
        sandboxClientId.value = '';
        liveClientId.value = '';
        environment.value = 'sandbox';
        settingsPanel.hidden = true;
        settingsPanel.inert = true;
        signInPanel.hidden = false;
        signIn.disabled = false;
        signOut.disabled = false;
        retry.hidden = true;
        setBusy(false);
        showStatus(saveStatus, '');
        showStatus(accountStatus, 'Sign in with your website administrator account to connect PayPal.');
    }

    function connectionFailed() {
        showSignedOut();
        signIn.disabled = true;
        retry.hidden = false;
        showStatus(accountStatus, 'Sign-in could not connect. Check your connection and try again.', true);
    }

    async function requestSettings(method, body, activeSession) {
        if (!signedIn || activeSession !== session) throw new Error('The account changed. This payment settings request was cancelled.');
        const token = await identity.refresh();
        if (!signedIn || activeSession !== session) throw new Error('The account changed. This payment settings request was cancelled.');
        if (typeof token !== 'string' || !token) throw new Error('Your sign-in expired. Sign in again to continue.');
        const response = await fetch('/.netlify/functions/admin-paypal-settings', {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
            },
            body: method === 'POST' ? JSON.stringify(body) : undefined,
            credentials: 'same-origin',
            cache: 'no-store',
            redirect: 'error'
        });
        let data;
        try { data = await response.json(); }
        catch (_) { throw new Error('The payment settings service could not be reached. Please try again.'); }
        if (!response.ok) {
            const message = typeof data?.error === 'string' ? data.error : 'Payment settings could not be saved. Please try again.';
            const error = new Error(message);
            error.status = response.status;
            throw error;
        }
        if (!data || !['sandbox', 'live'].includes(data.environment) ||
            typeof data.sandboxClientId !== 'string' || typeof data.liveClientId !== 'string' ||
            typeof data.sandboxSecretConfigured !== 'boolean' || typeof data.liveSecretConfigured !== 'boolean') {
            throw new Error('The payment settings service returned an incomplete response. Please reload this page.');
        }
        return data;
    }

    function applySettings(data) {
        environment.value = data.environment;
        sandboxClientId.value = data.sandboxClientId;
        liveClientId.value = data.liveClientId;
        element('sandbox-secret-status').textContent = data.sandboxSecretConfigured
            ? 'Test Secret saved. Leave blank to keep it.' : 'No saved test Secret.';
        element('live-secret-status').textContent = data.liveSecretConfigured
            ? 'Live Secret saved. Leave blank to keep it.' : 'No saved live Secret.';
        element('live-payment-details').open = data.environment === 'live';
        clearSecrets();
    }

    async function showAccount(user) {
        if (!user || typeof user.email !== 'string') { showSignedOut(); return; }
        const activeSession = ++session;
        signedIn = true;
        loaded = false;
        clearSecrets();
        settingsPanel.hidden = true;
        settingsPanel.inert = true;
        signInPanel.hidden = true;
        signIn.disabled = false;
        retry.hidden = true;
        signOut.disabled = false;
        setBusy(false);
        showStatus(accountStatus, `Signed in as ${user.email}. Loading payment settings…`);
        try {
            const data = await requestSettings('GET', undefined, activeSession);
            if (activeSession !== session) return;
            applySettings(data);
            loaded = true;
            settingsPanel.hidden = false;
            settingsPanel.inert = false;
            setBusy(false);
            showStatus(accountStatus, `Signed in as ${user.email}`);
        } catch (error) {
            if (activeSession !== session) return;
            clearSecrets();
            signInPanel.hidden = false;
            retry.hidden = false;
            showStatus(accountStatus, error.message, true);
        }
    }

    signIn.addEventListener('click', () => { if (identity) identity.open('login'); });
    retry.addEventListener('click', () => window.location.reload());
    signOut.addEventListener('click', () => {
        if (!identity) return;
        clearSecrets();
        signOut.disabled = true;
        Promise.resolve(identity.logout()).catch(() => {
            signOut.disabled = false;
            showStatus(accountStatus, 'Sign-out did not finish. Please try again.', true);
        });
    });
    environment.addEventListener('change', () => {
        if (environment.value === 'live') element('live-payment-details').open = true;
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!signedIn || !loaded || saving) return;
        const activeSession = session;
        const body = {
            environment: environment.value,
            sandboxClientId: sandboxClientId.value.trim(),
            liveClientId: liveClientId.value.trim(),
            sandboxSecret: sandboxSecret.value.trim(),
            liveSecret: liveSecret.value.trim()
        };
        setBusy(true);
        showStatus(saveStatus, 'Checking your PayPal details and saving…');
        try {
            const data = await requestSettings('POST', body, activeSession);
            if (activeSession !== session) return;
            applySettings(data);
            showStatus(saveStatus, `PayPal ${data.environment === 'sandbox' ? 'test' : 'live'} payments connected. Reopen the shop to try checkout.`);
        } catch (error) {
            if (activeSession !== session) return;
            if (error.status === 401 || error.status === 403) {
                showSignedOut();
                showStatus(accountStatus, error.message, true);
                return;
            }
            showStatus(saveStatus, error.message, true);
        } finally {
            body.sandboxSecret = '';
            body.liveSecret = '';
            if (activeSession === session) {
                clearSecrets();
                setBusy(false);
            }
        }
    });

    function connectIdentity() {
        identity = window.netlifyIdentity;
        if (!identity) { connectionFailed(); return; }
        identity.on('init', showAccount);
        identity.on('login', user => { identity.close(); showAccount(user); });
        identity.on('logout', showSignedOut);
        identity.on('error', () => { if (!signedIn) connectionFailed(); });
        try {
            if (document.getElementById('netlify-identity-widget')) showAccount(identity.currentUser());
            else identity.init({ logo: false });
        } catch (_) { connectionFailed(); }
    }

    const script = document.createElement('script');
    script.src = 'https://identity.netlify.com/v1/netlify-identity-widget.js';
    script.onload = connectIdentity;
    script.onerror = connectionFailed;
    document.head.append(script);
})();
