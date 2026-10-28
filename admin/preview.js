(function registerEditorPreviews() {
    'use strict';
    if (!window.CMS || !window.h) return;
    const h = window.h;
    const dataFor = props => props.entry.getIn(['data']).toJS();
    const assetFor = (props, path) => {
        if (typeof path !== 'string' || !path.trim()) return '';
        const asset = props.getAsset(path);
        const source = asset ? asset.toString() : path;
        // Preview iframes inherit /admin/ as their base. Bundled images are
        // rooted at the website, while new upload previews use blob/data URLs.
        if (/^(?:blob:|data:image\/|https?:\/\/|\/\/)/i.test(source)) return source;
        if (/^[a-z][a-z0-9+.-]*:/i.test(source)) return '';
        try {
            const url = new URL(source, `${window.location.origin}/`);
            return `${url.pathname}${url.search}${url.hash}`;
        } catch (_) { return ''; }
    };
    const image = (props, path, alt, className) => path
        ? h('img', { src: assetFor(props, path), alt: alt || '', className: className || '' })
        : null;
    const intro = data => h('header', { className: 'editor-intro' },
        data.eyebrow && h('p', { className: 'eyebrow' }, data.eyebrow),
        h('h1', {}, data.title || ''),
        data.intro && h('p', {}, data.intro));
    const paragraphs = value => String(value || '').split(/\n\s*\n/)
        .filter(Boolean).map((text, index) => h('p', { key: index }, text));

    CMS.registerPreviewStyle('/admin/editor.css');
    CMS.registerPreviewTemplate('home', props => {
        const data = dataFor(props);
        return h('div', { className: 'editor-home' },
            h('div', { className: 'editor-nav' }, 'Mvrk Spence'),
            (data.cards || []).map((card, index) => h('figure', { key: index },
                image(props, card.image, card.alt || card.title))));
    });
    CMS.registerPreviewTemplate('concept', props => {
        const data = dataFor(props);
        return h('main', { className: 'editor-page' }, intro(data),
            h('section', { className: 'editor-feature' },
                h('div', {}, h('h2', {}, data.bodyHeading), paragraphs(data.body)),
                image(props, data.image, data.imageAlt)),
            h('div', { className: 'editor-grid' }, (data.gallery || []).map((item, index) =>
                h('figure', { key: index }, image(props, item.image, item.alt),
                    item.caption && h('figcaption', {}, item.caption)))),
            (data.posts || []).map((post, index) => h('article', { className: 'editor-post', key: index },
                h('p', { className: 'eyebrow' }, post.published ? 'Published post' : 'Hidden draft'),
                post.date && h('time', {}, String(post.date).slice(0, 10)),
                h('h2', {}, post.title),
                post.summary && h('p', {}, post.summary),
                image(props, post.image, post.imageAlt),
                paragraphs(post.body))));
    });
    CMS.registerPreviewTemplate('shop', props => {
        const data = dataFor(props);
        const money = price => {
            try { return new Intl.NumberFormat('en', { style: 'currency', currency: data.currency || 'USD' }).format(price); }
            catch (_) { return String(price || 0); }
        };
        return h('main', { className: 'editor-page' }, intro(data),
            !(data.products || []).length && h('p', {}, data.emptyMessage || 'Add your first product using the Products list.'),
            h('div', { className: 'editor-grid' }, (data.products || []).map((product, index) => {
                const canBuy = product.purchasable !== false && Number(product.price) > 0;
                return h('article', { className: 'editor-product', key: index },
                    image(props, product.image, product.imageAlt || product.name),
                    h('div', { className: 'editor-product-copy' },
                        product.available === false && h('p', { className: 'eyebrow' }, 'Hidden from website'),
                        h('h2', {}, product.name),
                        h('p', {}, product.description),
                        h('strong', {}, canBuy ? money(product.price) : 'Enquiries welcome'),
                        h('span', { className: 'editor-button' }, canBuy ? 'Add to basket' : 'Enquire about this piece')));
            })));
    });
})();
