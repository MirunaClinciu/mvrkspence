(function initializeDashboard() {
    'use strict';

    const hash = window.location.hash || '';
    const parameters = new URLSearchParams(hash.replace(/^#/, ''));
    if (['invite_token', 'recovery_token', 'confirmation_token', 'email_change_token'].some(key => parameters.get(key))) {
        window.location.replace(`/admin/${hash}`);
        return;
    }

    const status = document.getElementById('account-status');
    const signInPanel = document.getElementById('sign-in-panel');
    const dashboard = document.getElementById('editor-dashboard');
    const signIn = document.getElementById('sign-in');
    const reset = document.getElementById('reset-password');
    const signOut = document.getElementById('sign-out');
    const retry = document.getElementById('retry-connection');
    let identity;
    let ready = false;

    function showStatus(message, error = false) {
        status.textContent = message;
        status.classList.toggle('is-error', error);
    }

    function showAccount(user) {
        ready = true;
        const signedIn = Boolean(user && typeof user.email === 'string');
        dashboard.hidden = !signedIn;
        dashboard.inert = !signedIn;
        signInPanel.hidden = signedIn;
        signIn.disabled = false;
        reset.disabled = false;
        retry.hidden = true;
        signOut.disabled = false;
        showStatus(signedIn ? `Signed in as ${user.email}` : 'Ready when you are. Sign in to edit your website.');
    }

    function connectionFailed() {
        ready = false;
        dashboard.hidden = true;
        dashboard.inert = true;
        signInPanel.hidden = false;
        signIn.disabled = true;
        reset.disabled = true;
        retry.hidden = false;
        showStatus('Sign-in could not connect. Check your connection and try again. If it continues, contact the website owner.', true);
    }

    signIn.addEventListener('click', () => {
        if (ready && identity) identity.open('login');
    });
    reset.addEventListener('click', () => {
        if (!ready || !identity) return;
        showStatus('Choose “Forgot password?” in the sign-in window to receive a reset email.');
        identity.open('login');
    });
    signOut.addEventListener('click', () => {
        if (!ready || !identity) return;
        signOut.disabled = true;
        Promise.resolve(identity.logout()).catch(() => {
            signOut.disabled = false;
            showStatus('Sign-out did not finish. Please try again.', true);
        });
    });
    retry.addEventListener('click', () => window.location.reload());

    function connectIdentity() {
        identity = window.netlifyIdentity;
        if (!identity) { connectionFailed(); return; }
        identity.on('init', showAccount);
        identity.on('login', user => {
            showAccount(user);
            identity.close();
        });
        identity.on('logout', () => showAccount(null));
        identity.on('error', () => {
            // The widget explains form errors; do not leak provider responses here.
            if (!ready) connectionFailed();
        });
        try {
            // The CDN entry point can initialize before its script load event.
            // At that point the public currentUser API is ready and init has
            // already fired, so read the completed session instead of waiting.
            if (document.getElementById('netlify-identity-widget')) showAccount(identity.currentUser());
            else identity.init({ logo: false });
        }
        catch (_) { connectionFailed(); }
    }

    // Register handlers before initialization, including on slow connections.
    const script = document.createElement('script');
    script.src = 'https://identity.netlify.com/v1/netlify-identity-widget.js';
    script.onload = connectIdentity;
    script.onerror = connectionFailed;
    document.head.append(script);
})();
