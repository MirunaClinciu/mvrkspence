(function (root, factory) {
    'use strict';
    const catalog = factory();
    if (typeof module === 'object' && module.exports) module.exports = catalog;
    if (root) root.MvrkCatalog = catalog;
}(typeof window === 'object' ? window : null, function () {
    'use strict';

    const formatLabels = Object.freeze({
        print: 'Art print',
        tshirt: 'T-shirt',
        framed: 'Framed print',
        canvas: 'Canvas'
    });
    const validId = id => typeof id === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(id);
    const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const text = value => typeof value === 'string' ? value.trim() : '';

    function hasPrice(value) {
        if (typeof value !== 'number' && typeof value !== 'string') return false;
        if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(value))) return false;
        const amount = Number(value);
        return amount > 0 && Number.isSafeInteger(Math.round(amount * 100));
    }

    function expandCatalog(shop = {}, booksData = {}) {
        const candidates = [];
        const addFlat = (product, group) => {
            if (!isRecord(product) || !validId(product.id) || !text(product.name)) return;
            candidates.push({
                ...product,
                name: text(product.name),
                group,
                purchasable: product.purchasable !== false && hasPrice(product.price),
                available: product.available !== false
            });
        };

        if (isRecord(shop) && Array.isArray(shop.products)) {
            shop.products.forEach(product => {
                const isBook = isRecord(product) && ['book', 'books'].some(value =>
                    product.group === value || product.category === value
                );
                addFlat(product, isBook ? 'books' : 'legacy');
            });
        }

        if (isRecord(shop) && Array.isArray(shop.photographs)) {
            const photographIds = new Map();
            shop.photographs.forEach(photograph => {
                if (isRecord(photograph) && validId(photograph.id)) {
                    photographIds.set(photograph.id, (photographIds.get(photograph.id) || 0) + 1);
                }
            });
            shop.photographs.forEach(photograph => {
                if (!isRecord(photograph) || !validId(photograph.id) || !text(photograph.name) ||
                    photographIds.get(photograph.id) !== 1 || !text(photograph.image) ||
                    !Array.isArray(photograph.variants)) return;
                photograph.variants.forEach(variant => {
                    if (!isRecord(variant) || !validId(variant.id) || !Object.hasOwn(formatLabels, variant.format)) return;
                    const option = text(variant.option);
                    // Keep format and size first so PayPal's item-name limit cannot
                    // remove the information needed to fulfil the selected variant.
                    const label = `${formatLabels[variant.format]}${option ? ` · ${option}` : ''}`;
                    candidates.push({
                        id: variant.id,
                        name: `${label} — ${text(photograph.name)}`,
                        description: text(photograph.description),
                        image: text(photograph.image),
                        imageAlt: text(photograph.imageAlt) || text(photograph.name),
                        price: variant.price,
                        type: 'physical',
                        available: (photograph.available === undefined || photograph.available === true) &&
                            (variant.available === undefined || variant.available === true),
                        purchasable: variant.purchasable === true && hasPrice(variant.price),
                        group: 'photographs',
                        photographId: photograph.id,
                        format: variant.format,
                        option
                    });
                });
            });
        }

        if (isRecord(booksData) && Array.isArray(booksData.books)) {
            booksData.books.forEach(book => addFlat(book, 'books'));
        }

        // A SKU must identify exactly one item across photographs, books and old
        // listings. Exclude all collisions rather than choosing a different price
        // depending on which collection happened to be expanded first.
        const counts = new Map();
        candidates.forEach(product => counts.set(product.id, (counts.get(product.id) || 0) + 1));
        return candidates.filter(product => counts.get(product.id) === 1);
    }

    return { expandCatalog, formatLabels };
}));
