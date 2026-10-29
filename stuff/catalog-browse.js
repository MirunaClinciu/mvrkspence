(function (root, factory) {
    'use strict';
    const browse = factory();
    if (typeof module === 'object' && module.exports) module.exports = browse;
    if (root) root.MvrkCatalogBrowse = browse;
}(typeof window === 'object' ? window : null, function () {
    'use strict';

    const cleanQuery = value => typeof value === 'string'
        ? value.trim().replace(/\s+/g, ' ').slice(0, 160).trimEnd()
        : '';
    const searchText = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const positiveInteger = value => Number.isSafeInteger(value) && value > 0;

    function browseItems(items, options = {}) {
        const settings = options && typeof options === 'object' ? options : {};
        const query = cleanQuery(settings.query);
        const needle = searchText(query);
        const pageSize = positiveInteger(settings.pageSize) && settings.pageSize <= 48 ? settings.pageSize : 9;
        const filtered = (Array.isArray(items) ? items : []).filter(item =>
            item && typeof item === 'object' && !Array.isArray(item) &&
            typeof item.name === 'string' && item.name.trim() &&
            searchText(item.name).includes(needle)
        );
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const requestedPage = positiveInteger(settings.page) ? settings.page : 1;
        const page = Math.min(requestedPage, totalPages);
        const offset = (page - 1) * pageSize;
        const pageItems = filtered.slice(offset, offset + pageSize);
        return {
            items: pageItems,
            query,
            total,
            totalPages,
            page,
            pageSize,
            from: total ? offset + 1 : 0,
            to: offset + pageItems.length
        };
    }

    function pageNumbers(current, total) {
        const totalPages = positiveInteger(total) ? total : 1;
        const page = Math.min(positiveInteger(current) ? current : 1, totalPages);
        const candidates = [...new Set([1, page - 1, page, page + 1, totalPages])]
            .filter(number => positiveInteger(number) && number <= totalPages)
            .sort((a, b) => a - b);
        const numbers = [];
        candidates.forEach((number, index) => {
            if (index) {
                const gap = number - candidates[index - 1];
                if (gap === 2) numbers.push(number - 1);
                else if (gap > 2) numbers.push('ellipsis');
            }
            numbers.push(number);
        });
        return numbers;
    }

    return { browseItems, pageNumbers };
}));
