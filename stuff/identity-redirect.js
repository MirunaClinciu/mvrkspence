(() => {
    const hash = window.location.hash;
    const parameters = new URLSearchParams(hash.replace(/^#/, ''));
    const actions = ['invite_token', 'recovery_token', 'confirmation_token', 'email_change_token'];
    window.MvrkIdentityRedirecting = actions.some(action => parameters.get(action));

    // Keep email-action tokens in the fragment for the admin Identity widget.
    if (window.MvrkIdentityRedirecting) window.location.replace(`/admin/${hash}`);
})();
