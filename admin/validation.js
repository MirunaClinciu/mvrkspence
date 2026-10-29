(function registerContentValidation() {
    'use strict';
    const cms = window.CMS;
    if (!cms || typeof cms.registerEventListener !== 'function') return;

    function validMoney(value, positive) {
        const text = String(value);
        if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return false;
        const [whole, fraction = ''] = text.split('.');
        const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
        return Number.isSafeInteger(cents) && (positive ? cents > 0 : cents >= 0);
    }

    function uniqueIds(items, pattern, label) {
        if (!Array.isArray(items)) throw new Error(`${label} could not be read. Reload the editor and try again.`);
        const ids = new Set();
        items.forEach((item, index) => {
            if (!item || typeof item.id !== 'string' || !pattern.test(item.id)) {
                throw new Error(`${label} item ${index + 1} needs a valid permanent ID. Remove this unfinished item and add it again; its reference will be created automatically.`);
            }
            if (ids.has(item.id)) {
                throw new Error(`${label} ID "${item.id}" is used more than once. Remove the newly added copy and use Add to create it again; references are created automatically.`);
            }
            ids.add(item.id);
        });
    }

    function validatePrice(product, label, enquiryByDefault = false, checkoutLabel = 'Enable PayPal checkout') {
        const canBuy = enquiryByDefault ? product.purchasable === true : product.purchasable !== false;
        if (canBuy && !validMoney(product.price, true)) {
            throw new Error(`${label}: enter a price above zero with no more than two decimal places, or switch off ${checkoutLabel}.`);
        }
        if (!canBuy && product.price !== undefined && product.price !== '' && !validMoney(product.price, false)) {
            throw new Error(`${label}: the price must be zero or above, with no more than two decimal places.`);
        }
    }

    function requireNameAndImage(item, label) {
        if (typeof item.name !== 'string' || !item.name.trim()) {
            throw new Error(`${label}: enter a name before saving.`);
        }
        if (typeof item.image !== 'string' || !item.image.trim()) {
            throw new Error(`${item.name}: upload a photograph or cover image before saving.`);
        }
    }

    function addMissingReferences(data, shop, books, concept) {
        const changes = [];
        const reserved = new Set();
        const reserve = items => Array.isArray(items) && items.forEach(item => {
            if (item && typeof item.id === 'string') reserved.add(item.id);
        });
        reserve(data.products);
        reserve(data.photographs);
        reserve(data.books);
        reserve(data.posts);
        if (Array.isArray(data.photographs)) data.photographs.forEach(photo => reserve(photo && photo.variants));
        function assign(items, path, prefix, nameFor) {
            if (!Array.isArray(items)) return;
            items.forEach((item, index) => {
                if (!item || typeof item !== 'object' || (item.id !== undefined && item.id !== null && item.id !== '')) return;
                const name = String(nameFor(item) || 'item').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '') || 'item';
                // References are permanent after the first successful save. A random
                // suffix also keeps independently edited books and artwork distinct.
                const token = window.crypto && typeof window.crypto.randomUUID === 'function'
                    ? window.crypto.randomUUID().replace(/-/g, '').slice(0, 16)
                    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
                const base = `${prefix}-${name}-${token}`.slice(0, 76);
                let reference = base;
                let suffix = 2;
                while (reserved.has(reference)) reference = `${base}-${suffix++}`;
                item.id = reference;
                reserved.add(reference);
                changes.push([[...path, index, 'id'], reference]);
            });
        }
        if (shop) {
            assign(data.products, ['products'], 'item', item => item.name);
            assign(data.photographs, ['photographs'], 'photo', item => item.name);
            if (Array.isArray(data.photographs)) data.photographs.forEach((photo, index) => {
                if (photo) assign(photo.variants, ['photographs', index, 'variants'], 'art', item => `${photo.name || 'artwork'}-${item.format || 'format'}-${item.option || ''}`);
            });
        }
        if (books) assign(data.books, ['books'], 'book', item => item.name);
        if (concept) assign(data.posts, ['posts'], 'post', item => item.title);
        return changes;
    }

    function validateEntry({ entry }) {
        const storedData = entry.get('data');
        const data = storedData && typeof storedData.toJS === 'function' ? storedData.toJS() : storedData;
        const path = String(entry.get('path') || '').replace(/^\/+/, '');
        const collection = entry.get('collection');
        const slug = entry.get('slug');
        const shop = path === 'content/shop.json' || (collection === 'shop' && slug === 'shop');
        const books = path === 'content/books.json' || (collection === 'shop' && slug === 'books');
        const payments = path === 'content/payments.json' || (collection === 'shop' && slug === 'payments');
        const concept = path === 'content/concept.json' || (collection === 'pages' && slug === 'concept');
        const contact = path === 'content/contact.json' || (collection === 'pages' && slug === 'contact');
        if (!shop && !books && !concept && !payments && !contact) return storedData;
        if (!data || typeof data !== 'object') throw new Error('This page could not be read. Reload the editor and try again.');
        const referenceChanges = addMissingReferences(data, shop, books, concept);

        if (shop) {
            const products = data.products === undefined ? [] : data.products;
            uniqueIds(products, /^[A-Za-z0-9._-]{1,80}$/, 'Artwork');
            products.forEach((product, index) => {
                validatePrice(product, product.name || `Artwork item ${index + 1}`);
            });
            const photographs = data.photographs === undefined ? [] : data.photographs;
            uniqueIds(photographs, /^[A-Za-z0-9._-]{1,80}$/, 'Photograph');
            const allProducts = [...products];
            photographs.forEach((photograph, index) => {
                requireNameAndImage(photograph, `Photograph ${index + 1}`);
                const variants = photograph.variants;
                if (!Array.isArray(variants) || variants.length === 0) {
                    throw new Error(`${photograph.name}: add at least one print, T-shirt, framed print or canvas format before saving.`);
                }
                uniqueIds(variants, /^[A-Za-z0-9._-]{1,80}$/, `${photograph.name}: format`);
                variants.forEach(variant => {
                    if (!['print', 'tshirt', 'framed', 'canvas'].includes(variant.format)) {
                        throw new Error(`${photograph.name}: choose Art print, T-shirt, Framed print or Canvas for every format.`);
                    }
                    const label = `${photograph.name} (${variant.option || variant.format})`;
                    validatePrice(variant, label, true, 'Enable checkout for this format');
                    allProducts.push(variant);
                });
            });
            uniqueIds(allProducts, /^[A-Za-z0-9._-]{1,80}$/, 'Product or format');
            if (data.shipping !== undefined) {
                const shipping = data.shipping;
                if (!shipping || typeof shipping !== 'object' || typeof shipping.enabled !== 'boolean' || typeof shipping.amount !== 'number' || !validMoney(shipping.amount, false)) {
                    throw new Error('Shipping: enter a fee of zero or above with no more than two decimal places, and choose whether shipping is charged.');
                }
            }
        }
        if (books) {
            const items = data.books === undefined ? [] : data.books;
            uniqueIds(items, /^[A-Za-z0-9._-]{1,80}$/, 'Book');
            items.forEach((book, index) => {
                requireNameAndImage(book, `Book ${index + 1}`);
                validatePrice(book, book.name);
            });
        }
        if (concept) uniqueIds(data.posts === undefined ? [] : data.posts, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Journal post');
        if (contact && (typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) {
            throw new Error('Contact: enter a complete email address, such as hello@example.com, so visitors can get in touch.');
        }
        if (payments) {
            if (!['sandbox', 'live'].includes(data.environment)) {
                throw new Error('PayPal: choose Test payments or Real payments before saving.');
            }
            for (const name of ['sandboxClientId', 'liveClientId']) {
                if (data[name] !== undefined && typeof data[name] !== 'string') {
                    throw new Error('PayPal: copy the public Client ID as text from your PayPal app.');
                }
            }
            if (data.environment === 'live' && !String(data.liveClientId || '').trim()) {
                throw new Error('PayPal: enter your Live PayPal public client ID before choosing Real payments, or keep Test payments selected.');
            }
        }

        // Preserve Decap's Immutable data type and every existing reference.
        // Validation finishes before any generated references are persisted.
        return referenceChanges.reduce((result, [path, value]) => result.setIn(path, value), storedData);
    }

    cms.registerEventListener({ name: 'preSave', handler: validateEntry });
    cms.registerEventListener({ name: 'prePublish', handler: validateEntry });
})();
