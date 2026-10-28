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
                throw new Error(`${label} item ${index + 1} needs a valid permanent ID. Complete that field, or remove the unfinished item.`);
            }
            if (ids.has(item.id)) {
                throw new Error(`${label} ID "${item.id}" is used more than once. Give the new item a different ID before saving.`);
            }
            ids.add(item.id);
        });
    }

    function validateEntry({ entry }) {
        const storedData = entry.get('data');
        const data = storedData && typeof storedData.toJS === 'function' ? storedData.toJS() : storedData;
        const path = String(entry.get('path') || '').replace(/^\/+/, '');
        const collection = entry.get('collection');
        const slug = entry.get('slug');
        const shop = path === 'content/shop.json' || (collection === 'shop' && slug === 'shop');
        const payments = path === 'content/payments.json' || (collection === 'shop' && slug === 'payments');
        const concept = path === 'content/concept.json' || (collection === 'pages' && slug === 'concept');
        const contact = path === 'content/contact.json' || (collection === 'pages' && slug === 'contact');
        if (!shop && !concept && !payments && !contact) return storedData;
        if (!data || typeof data !== 'object') throw new Error('This page could not be read. Reload the editor and try again.');

        if (shop) {
            const products = data.products === undefined ? [] : data.products;
            uniqueIds(products, /^[A-Za-z0-9._-]{1,80}$/, 'Artwork');
            products.forEach((product, index) => {
                const label = product.name || `Artwork item ${index + 1}`;
                if (product.purchasable !== false && !validMoney(product.price, true)) {
                    throw new Error(`${label}: enter a price above zero with no more than two decimal places, or switch off Enable PayPal checkout.`);
                }
                if (product.purchasable === false && product.price !== undefined && product.price !== '' && !validMoney(product.price, false)) {
                    throw new Error(`${label}: the price must be zero or above, with no more than two decimal places.`);
                }
            });
            if (data.shipping !== undefined) {
                const shipping = data.shipping;
                if (!shipping || typeof shipping !== 'object' || typeof shipping.enabled !== 'boolean' || typeof shipping.amount !== 'number' || !validMoney(shipping.amount, false)) {
                    throw new Error('Shipping: enter a fee of zero or above with no more than two decimal places, and choose whether shipping is charged.');
                }
            }
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

        // Leave the entry unchanged. Decap stops the operation and displays any
        // thrown error, before it saves a draft or publishes an existing draft.
        return storedData;
    }

    cms.registerEventListener({ name: 'preSave', handler: validateEntry });
    cms.registerEventListener({ name: 'prePublish', handler: validateEntry });
})();
