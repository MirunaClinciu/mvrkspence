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
    const formatLabels = { print: 'Art print', tshirt: 'T-shirt', framed: 'Framed print', canvas: 'Canvas' };
    const moneyFor = currency => price => {
        try { return new Intl.NumberFormat('en', { style: 'currency', currency: currency || 'GBP' }).format(price); }
        catch (_) { return String(price || 0); }
    };
    const productPreview = (props, product, index, money) => {
        const canBuy = product.purchasable !== false && Number(product.price) > 0;
        return h('article', { className: 'editor-product', key: index },
            image(props, product.image, product.imageAlt || product.name),
            h('div', { className: 'editor-product-copy' },
                product.available === false && h('p', { className: 'eyebrow' }, 'Hidden from website'),
                h('h2', {}, product.name),
                h('p', {}, product.description),
                h('strong', {}, canBuy ? money(product.price) : 'Enquiries welcome'),
                h('span', { className: 'editor-button' }, canBuy ? 'Add to basket' : 'Enquire about this piece')));
    };

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
        const money = moneyFor(data.currency);
        const photographs = Array.isArray(data.photographs) ? data.photographs : [];
        const products = Array.isArray(data.products) ? data.products : [];
        return h('main', { className: 'editor-page' }, intro(data),
            !photographs.length && !products.length && h('p', {}, data.emptyMessage || 'Use Add Photograph to upload a photograph and choose its product formats.'),
            photographs.length > 0 && h('h2', {}, data.photographsTitle || 'Photographs & artwork'),
            photographs.length > 0 && data.photographsIntro && h('p', {}, data.photographsIntro),
            h('div', { className: 'editor-grid' }, photographs.map((photograph, index) =>
                h('article', { className: 'editor-product', key: index },
                    image(props, photograph.image, photograph.imageAlt || photograph.name),
                    h('div', { className: 'editor-product-copy' },
                        photograph.available === false && h('p', { className: 'eyebrow' }, 'Photograph and formats hidden'),
                        h('h2', {}, photograph.name),
                        h('p', {}, photograph.description),
                        h('h3', {}, 'Formats & sizes'),
                        !(photograph.variants || []).length && h('p', {}, 'Add a format to offer this photograph as a product.'),
                        h('ul', { className: 'editor-formats' }, (photograph.variants || []).map((variant, variantIndex) =>
                            h('li', { key: variantIndex },
                                h('span', {}, `${formatLabels[variant.format] || 'Format'}${variant.option ? ` · ${variant.option}` : ''}`),
                                h('strong', {}, variant.available === false ? 'Not offered'
                                    : variant.purchasable === true && Number(variant.price) > 0 ? money(variant.price) : 'Enquiries welcome')))),
                        h('p', { className: 'editor-format-note' }, 'One photograph is reused for every format. Books are edited in the separate Books entry.'))))),
            products.length > 0 && h('h2', {}, 'Other / existing products'),
            h('div', { className: 'editor-grid' }, products.map((product, index) => productPreview(props, product, index, money))));
    });
    CMS.registerPreviewTemplate('books', props => {
        const data = dataFor(props);
        const books = Array.isArray(data.books) ? data.books : [];
        const bookPrice = price => `${Number(price).toFixed(2)} · shop currency`;
        return h('main', { className: 'editor-page' }, intro(data),
            h('p', { className: 'editor-format-note' }, 'Book prices use the currency and shipping settings in Photographs & shop settings.'),
            !books.length && h('p', {}, 'Use Add Book to upload a cover and add your first book.'),
            h('div', { className: 'editor-grid' }, books.map((book, index) => productPreview(props, book, index, bookPrice))));
    });
})();
