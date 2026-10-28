function setText(id, value) {
    if (typeof value !== 'string') return;
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

async function loadComingSoonContent() {
    document.getElementById('year').textContent = String(new Date().getFullYear());
    try {
        const [contentResponse, settingsResponse] = await Promise.all([
            fetch('/content/coming-soon.json', { cache: 'no-store' }),
            fetch('/content/site.json', { cache: 'no-store' })
        ]);
        if (!contentResponse.ok) throw new Error(`Could not load coming-soon content (${contentResponse.status}).`);
        if (!settingsResponse.ok) throw new Error(`Could not load site settings (${settingsResponse.status}).`);
        const [content, settings] = await Promise.all([
            contentResponse.json(),
            settingsResponse.json()
        ]);
        const logo = document.getElementById('coming-soon-logo');
        if (typeof content.logo === 'string' && content.logo.trim()) {
            logo.src = `/${content.logo.replace(/^\/+/, '')}`;
        }
        if (typeof content.logoAlt === 'string') logo.alt = content.logoAlt;
        setText('coming-soon-message', content.message);
        setText('coming-soon-link', content.previewLabel);
        setText('coming-soon-footer', content.footerText);
        if (typeof settings.siteName === 'string' && settings.siteName.trim()) {
            document.getElementById('page-title').textContent = `${settings.siteName.trim()} | ${content.message || 'Coming soon'}`;
        }
        if (typeof settings.metaDescription === 'string') {
            document.getElementById('page-description').content = settings.metaDescription;
        }
        const favicon = document.getElementById('site-favicon');
        if (typeof content.favicon === 'string' && content.favicon.trim()) {
            favicon.href = `/${content.favicon.replace(/^\/+/, '')}`;
        }

        const previewLink = document.getElementById('coming-soon-link');
        if (typeof content.previewLink === 'string') {
            const link = new URL(content.previewLink, window.location.origin);
            if (link.origin === window.location.origin) previewLink.href = link.href;
        }
    } catch (error) {
        console.error('Unable to load coming-soon page content.', error);
    }
}

loadComingSoonContent();
