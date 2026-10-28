(function () {
    'use strict';

    const icons = {
        instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
        facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.8 21v-8.2h2.8l.4-3h-3.2V7.9c0-.9.3-1.5 1.6-1.5h1.7V3.7c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v1.9H7.6v3h2.8V21z"/></svg>',
        email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg>',
        buymeacoffee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 7h12l-1.5 14h-9L6 7ZM5 4h14v3H5V4ZM8 4l1-2h6l1 2"/><path d="M6.5 11h11l-.6 6H7.1l-.6-6Z" fill="currentColor" stroke="none"/></svg>'
    };

    const referenceIcons = {
        instagram: '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="3" fill="currentColor"/><g fill="none" stroke="#fff" stroke-width="1.6"><rect x="6" y="6" width="12" height="12" rx="3"/><circle cx="12" cy="12" r="3"/></g><circle cx="16.2" cy="7.8" r="0.9" fill="#fff"/></svg>',
        email: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2" fill="currentColor"/><path d="m2.8 6 9.2 7 9.2-7" fill="none" stroke="#fff" stroke-width="1.4"/></svg>'
    };

    function createLink(item, options = {}) {
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
        const inferred = isEmail ? 'email' : host === 'instagram.com' ? 'instagram'
            : host === 'facebook.com' ? 'facebook' : host === 'buymeacoffee.com' ? 'buymeacoffee' : 'link';
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
            icon.innerHTML = options.reference === true && Object.hasOwn(referenceIcons, platform)
                ? referenceIcons[platform] : icons[platform];
            link.append(icon);
        } else {
            link.className = 'social-text-link';
            link.textContent = label;
        }
        return link;
    }

    function render(container, items, options) {
        if (!container) return;
        const links = (Array.isArray(items) ? items : []).map(item => createLink(item, options)).filter(Boolean);
        container.replaceChildren(...links);
        container.hidden = links.length === 0;
    }

    window.MvrkSocialLinks = { createLink, render };
}());
