(function () {
    'use strict';

    const icons = {
        instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
        facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.8 21v-8.2h2.8l.4-3h-3.2V7.9c0-.9.3-1.5 1.6-1.5h1.7V3.7c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v1.9H7.6v3h2.8V21z"/></svg>',
        email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg>'
    };

    function createLink(item) {
        if (!item || typeof item.label !== 'string' || !item.label.trim() || typeof item.url !== 'string') return null;
        const address = item.url.trim();
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        let url;
        try { url = new URL(!address.includes(':') && emailPattern.test(address) ? `mailto:${address}` : address); } catch { return null; }
        const isEmail = url.protocol === 'mailto:';
        if (isEmail) {
            if (!emailPattern.test(url.pathname) || url.search || url.hash || /[%\\/:,< >"?&#;]/.test(url.pathname)) return null;
        } else if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;

        const host = url.hostname.replace(/^www\./, '');
        const inferred = isEmail ? 'email' : host === 'instagram.com' ? 'instagram' : host === 'facebook.com' ? 'facebook' : 'link';
        const platform = typeof item.platform === 'string' ? item.platform : inferred;
        const label = item.label.trim();
        const link = document.createElement('a');
        link.href = url.href;
        if (!isEmail) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
        link.title = isEmail ? `${label}: ${url.pathname}` : label;
        link.setAttribute('aria-label', isEmail ? `${label}: ${url.pathname}` : `${label} (opens in a new tab)`);
        if (Object.hasOwn(icons, platform)) {
            link.className = 'social-icon-link';
            const icon = document.createElement('span');
            icon.className = 'social-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.innerHTML = icons[platform];
            link.append(icon);
        } else {
            link.className = 'social-text-link';
            link.textContent = label;
        }
        return link;
    }

    function render(container, items) {
        if (!container) return;
        const links = (Array.isArray(items) ? items : []).map(createLink).filter(Boolean);
        container.replaceChildren(...links);
        container.hidden = links.length === 0;
    }

    window.MvrkSocialLinks = { createLink, render };
}());
