(function () {
    'use strict';

    const sections = [
        ['terms', 'terms-and-conditions', 'Terms and Conditions'],
        ['refunds', 'refunds', 'Refund Policy'],
        ['delivery', 'delivery', 'Delivery Policy'],
        ['privacy', 'privacy-and-security', 'Privacy and Security'],
        ['secureCheckout', 'secure-checkout', 'Secure Checkout Policy'],
        ['paymentMethods', 'accepted-payment-methods', 'Accepted Payment Methods']
    ];
    const text = value => typeof value === 'string' ? value.trim() : '';
    const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const emailAddress = value => /^[^\s@%\\/:,< >"?&#;]+@[^\s@%\\/:,< >"?&#;]+\.[^\s@%\\/:,< >"?&#;]+$/.test(text(value))
        ? text(value) : 'mvrkspence@gmail.com';

    function safeImagePath(value) {
        if (!text(value)) return '';
        try {
            const url = new URL(value, `${window.location.origin}/`);
            if (!['https:', 'http:'].includes(url.protocol) || url.origin !== window.location.origin || url.username || url.password) return '';
            return url.href;
        } catch { return ''; }
    }

    function element(tag, className, content) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (content !== undefined) node.textContent = content;
        return node;
    }

    function missingDetails(data) {
        const seller = object(data.seller);
        const delivery = object(data.deliveryDetails);
        return [
            [seller.legalName, 'Legal seller name'],
            [seller.businessAddress, 'Business postal address'],
            [seller.returnsAddress, 'Returns address'],
            [delivery.countries, 'Shipping destinations'],
            [delivery.dispatchTime, 'Production / dispatch time'],
            [delivery.deliveryTime, 'Delivery estimates'],
            [delivery.changeOfMindReturnCosts, 'Who pays change-of-mind return costs'],
            [delivery.nonPostalReturnCost, 'Return-cost estimate for items that cannot normally be posted (or not applicable)']
        ].filter(([value]) => !text(value)).map(([, label]) => label);
    }

    function detailsList(rows) {
        const list = element('dl', 'policy-details');
        rows.forEach(([label, value, required]) => {
            if (!text(value) && !required) return;
            list.append(element('dt', '', label), element('dd', text(value) ? '' : 'policy-unconfirmed',
                text(value) || 'To be confirmed before real orders open.'));
        });
        return list;
    }

    function emailLink(address) {
        const email = emailAddress(address);
        const link = element('a', '', email);
        link.href = `mailto:${email}`;
        return link;
    }

    function shippingMessage(shop) {
        const shipping = object(shop.shipping);
        if (typeof shipping.enabled !== 'boolean') return '';
        if (!shipping.enabled) return 'No separate shipping fee is currently configured in the basket. Delivery availability still needs to be confirmed.';
        const amount = Number(shipping.amount);
        if (!Number.isFinite(amount) || amount < 0) return '';
        let formatted;
        try { formatted = new Intl.NumberFormat('en-GB', { style: 'currency', currency: text(shop.currency) || 'GBP' }).format(amount); }
        catch { return ''; }
        return `${shop.testMode === true ? 'Current test-shop' : 'Current'} delivery charge: ${formatted} per order containing physical goods. Review the final total in the basket.`;
    }

    function render(data, shop = {}, settings = {}) {
        data = object(data);
        shop = object(shop);
        settings = object(settings);
        const main = document.getElementById('policies-content');
        if (!main) return;
        const seller = object(data.seller);
        const delivery = object(data.deliveryDetails);
        const privacy = object(data.privacyDetails);
        const siteName = text(settings.siteName) || text(seller.tradingName) || 'Mvrk Spence';
        const intro = element('header', 'policy-intro');
        intro.append(element('p', 'policy-eyebrow', 'Customer information'),
            element('h1', '', text(data.title) || 'Shop policies'));
        if (text(data.intro)) intro.append(element('p', '', data.intro));
        if (text(data.updated)) intro.append(element('p', 'policy-updated', `Updated ${data.updated}`));
        const contents = [intro];
        const missing = missingDetails(data);
        if (data.draft !== false || missing.length || shop.testMode === true || shop.settingsUnavailable === true) {
            const notice = element('aside', 'policy-notice');
            notice.setAttribute('role', 'note');
            if (data.draft !== false || missing.length) {
                notice.append(element('h2', '', 'Draft policies — awaiting seller review'),
                    element('p', '', 'These policies are being prepared. Seller details, fulfilment arrangements and privacy information must be confirmed before real orders open.'));
                if (missing.length) {
                    notice.append(element('p', '', 'Details still to be completed:'));
                    const list = element('ul');
                    missing.forEach(label => list.append(element('li', '', label)));
                    notice.append(list);
                }
            }
            if (shop.settingsUnavailable === true) notice.append(element('p', '', 'Checkout availability cannot currently be confirmed. Contact the seller before attempting to order.'));
            else if (shop.testMode === true) notice.append(element('p', '', 'Test shop: checkout uses PayPal Sandbox. No real orders or payments are accepted through this preview.'));
            contents.push(notice);
        }
        const navigation = element('nav', 'policy-navigation');
        navigation.setAttribute('aria-label', 'Shop policies');
        sections.forEach(([key, id, fallbackTitle]) => {
            const link = element('a', '', text(object(data[key]).title) || fallbackTitle);
            link.href = `#${id}`;
            navigation.append(link);
        });
        contents.push(navigation);

        const identity = element('section', 'policy-seller');
        identity.id = 'seller-information';
        identity.append(element('h2', '', 'Seller & contact details'), detailsList([
            ['Trading name', text(seller.tradingName) || siteName, true],
            ['Legal seller', seller.legalName, true],
            ['Business address', seller.businessAddress, true],
            ['Returns address', seller.returnsAddress, true],
            ['Telephone', seller.phone],
            ['Company registration', seller.companyNumber],
            ['VAT registration', seller.vatNumber]
        ]));
        const contact = element('p', '', 'Enquiries, cancellations and privacy requests: ');
        contact.append(emailLink(seller.email));
        identity.append(contact);
        contents.push(identity);

        sections.forEach(([key, id, fallbackTitle]) => {
            const sectionData = object(data[key]);
            const section = element('section', 'policy-section');
            section.id = id;
            section.tabIndex = -1;
            section.setAttribute('aria-labelledby', `${id}-heading`);
            const heading = element('h2', '', text(sectionData.title) || fallbackTitle);
            heading.id = `${id}-heading`;
            section.append(heading);
            if (key === 'paymentMethods') {
                const badges = element('div', 'policy-payment-badges');
                badges.setAttribute('aria-label', 'PayPal, with eligible card options shown at checkout');
                badges.append(element('span', 'policy-payment-badge', 'PayPal'), element('span', 'policy-payment-badge', 'Debit & credit cards · where available'));
                section.append(badges);
                const imagePath = safeImagePath(sectionData.image);
                if (imagePath) {
                    const figure = element('figure', 'policy-card-methods');
                    const image = element('img', 'policy-card-icons');
                    image.src = imagePath;
                    image.alt = text(sectionData.imageAlt) || 'Card payment logos; availability is shown at checkout';
                    image.width = 460;
                    image.height = 60;
                    image.loading = 'lazy';
                    figure.append(image, element('figcaption', '', text(sectionData.imageCaption) || 'Available card options are shown by PayPal at checkout and can vary.'));
                    section.append(figure);
                }
            }
            (Array.isArray(sectionData.paragraphs) ? sectionData.paragraphs : []).forEach(paragraph => {
                if (text(paragraph)) section.append(element('p', '', paragraph));
            });
            if (key === 'refunds') {
                const cancellation = element('div', 'policy-cancellation');
                cancellation.append(element('h3', '', 'Optional cancellation form'),
                    element('p', '', 'You can use this form or send any other clear statement of cancellation by email. Fill in the relevant details; a signature is needed only for a paper form.'));
                cancellation.append(element('p', '', `To: ${text(seller.legalName) || text(seller.tradingName) || siteName}\n${text(seller.businessAddress) || 'Business address to be confirmed before real orders open.'}\n${emailAddress(seller.email)}\n\nI/We give notice that I/we cancel the contract for the following goods:\n[Describe goods]\nOrdered on / received on: [Date]\nConsumer name(s): [Name]\nConsumer address: [Address]\nDate: [Date]\nSignature (paper form only): [Signature]`));
                section.append(cancellation);
            }
            if (key === 'delivery') {
                section.append(detailsList([
                    ['Shipping destinations', delivery.countries, true],
                    ['Production / dispatch', delivery.dispatchTime, true],
                    ['Estimated transit time', delivery.deliveryTime, true],
                    ['Change-of-mind return costs', delivery.changeOfMindReturnCosts, true],
                    ['Non-postal return-cost estimate', delivery.nonPostalReturnCost, true]
                ]));
                const message = shippingMessage(shop);
                if (message) section.append(element('p', '', message));
            }
            if (key === 'privacy') section.append(detailsList([
                ['Retention', privacy.retention, true],
                ['Services receiving information', privacy.serviceProviders, true],
                ['International processing', privacy.internationalTransfers, true]
            ]));
            contents.push(section);
        });
        main.replaceChildren(...contents);
        document.title = `${siteName} | ${text(data.title) || 'Shop policies'}`;
        const copyright = document.getElementById('policy-copyright');
        if (copyright) copyright.textContent = `© ${new Date().getFullYear()} ${siteName}`;
        if (window.MvrkSocialLinks) window.MvrkSocialLinks.render(document.getElementById('policy-socials'), settings.footerLinks, { reference: true });
    }

    function scrollToAnchor() {
        const id = window.location.hash.replace(/^#/, '');
        if (!sections.some(([, sectionId]) => sectionId === id) && id !== 'seller-information') return;
        const target = document.getElementById(id);
        if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView();
    }

    async function loadJson(path) {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Could not load policies (${response.status}).`);
        const value = await response.json();
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid policy content.');
        return value;
    }

    async function initialize() {
        const [policies, shop, settings] = await Promise.allSettled([
            loadJson('/content/policies.json'), loadJson('/content/shop.json'), loadJson('/content/site.json')
        ]);
        if (policies.status !== 'fulfilled') {
            const main = document.getElementById('policies-content');
            const error = element('p', '', 'Policies could not be loaded. Please refresh or email ');
            error.setAttribute('role', 'alert');
            error.append(emailLink('mvrkspence@gmail.com'));
            main.replaceChildren(element('h1', '', 'Shop policies'), error);
            return;
        }
        render(policies.value, shop.status === 'fulfilled' ? shop.value : { settingsUnavailable: true },
            settings.status === 'fulfilled' ? settings.value : {});
        scrollToAnchor();
    }

    window.MvrkPolicies = { render, missingDetails, sectionIds: sections.map(([, id]) => id) };
    if (typeof window.addEventListener === 'function') window.addEventListener('hashchange', scrollToAnchor);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
}());
