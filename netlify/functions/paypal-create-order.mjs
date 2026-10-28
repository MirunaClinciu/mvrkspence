import {
    getPaypalAccessToken,
    getShopConfig,
    jsonResponse,
    readRequestBody,
    requestPaypal
} from './paypal-utils.mjs';
import { paymentFunction } from '../lib/payment-function.mjs';

function priceInCents(value) {
    const text = String(value);
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return null;
    const [whole, fraction = ''] = text.split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function nonnegativePriceInCents(value) {
    const text = String(value);
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return null;
    const [whole, fraction = ''] = text.split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return Number.isSafeInteger(cents) ? cents : null;
}

function money(value) {
    return (value / 100).toFixed(2);
}

export function createHandler({ loadConfig = getShopConfig } = {}) {
return async function handler(event) {
    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { error: 'Use POST to create a PayPal order.' });
    }

    try {
        const request = readRequestBody(event);
        if (!Array.isArray(request.items) || request.items.length === 0 || request.items.length > 30) {
            return jsonResponse(400, { error: 'Choose between 1 and 30 products.' });
        }

        const { config, siteUrl, paymentSecret } = await loadConfig();
        const catalog = Array.isArray(config.products) ? config.products : [];
        const requestedIds = new Set();
        const orderItems = [];
        let containsPhysicalItem = false;

        for (const requested of request.items) {
            if (
                !requested ||
                typeof requested.id !== 'string' ||
                !/^[A-Za-z0-9._-]{1,80}$/.test(requested.id) ||
                !Number.isInteger(requested.quantity) ||
                requested.quantity < 1 ||
                requested.quantity > 10 ||
                requestedIds.has(requested.id)
            ) {
                return jsonResponse(400, { error: 'One or more basket items are invalid.' });
            }
            requestedIds.add(requested.id);

            const matches = catalog.filter(item =>
                item &&
                item.id === requested.id &&
                item.available !== false &&
                item.purchasable !== false &&
                typeof item.name === 'string' &&
                item.name.trim() !== ''
            );
            if (matches.length !== 1) {
                return jsonResponse(400, { error: 'A basket item is unavailable. Refresh the shop and try again.' });
            }
            const product = matches[0];
            const unitCents = priceInCents(product.price);
            if (unitCents === null) {
                return jsonResponse(400, { error: 'A basket item is unavailable. Refresh the shop and try again.' });
            }
            const type = product.type === 'digital' ? 'digital' : 'physical';
            if (type === 'physical') containsPhysicalItem = true;

            orderItems.push({
                name: product.name.slice(0, 127),
                unitCents,
                quantity: requested.quantity,
                category: type === 'digital' ? 'DIGITAL_GOODS' : 'PHYSICAL_GOODS'
            });
        }

        const itemTotalCents = orderItems.reduce(
            (total, item) => total + item.unitCents * item.quantity,
            0
        );
        const shippingConfig = config.shipping && typeof config.shipping === 'object'
            ? config.shipping
            : { enabled: false, amount: 0 };
        const configuredShippingCents = nonnegativePriceInCents(shippingConfig.amount ?? 0);
        if (
            typeof shippingConfig.enabled !== 'boolean' ||
            configuredShippingCents === null
        ) {
            return jsonResponse(500, { error: 'Shop shipping settings are invalid.' });
        }
        const shippingCents = containsPhysicalItem && shippingConfig.enabled ? configuredShippingCents : 0;
        const orderTotalCents = itemTotalCents + shippingCents;
        if (!Number.isSafeInteger(itemTotalCents) || !Number.isSafeInteger(orderTotalCents) || itemTotalCents <= 0) {
            return jsonResponse(400, { error: 'The basket total is invalid.' });
        }

        const accessToken = await getPaypalAccessToken(config.paypalClientId, config.paypalEnvironment, paymentSecret);
        const breakdown = {
            item_total: {
                currency_code: config.currency,
                value: money(itemTotalCents)
            }
        };
        if (shippingCents > 0) {
            breakdown.shipping = {
                currency_code: config.currency,
                value: money(shippingCents)
            };
        }
        const result = await requestPaypal('/v2/checkout/orders', accessToken, {
            intent: 'CAPTURE',
            purchase_units: [{
                amount: {
                    currency_code: config.currency,
                    value: money(orderTotalCents),
                    breakdown
                },
                items: orderItems.map(item => ({
                    name: item.name,
                    quantity: String(item.quantity),
                    unit_amount: {
                        currency_code: config.currency,
                        value: money(item.unitCents)
                    },
                    category: item.category
                }))
            }],
            payment_source: {
                paypal: {
                    experience_context: {
                        brand_name: 'Mvrk Spence',
                        shipping_preference: containsPhysicalItem ? 'GET_FROM_FILE' : 'NO_SHIPPING',
                        user_action: 'PAY_NOW',
                        return_url: new URL('/preview/artwork.html?checkout=complete', siteUrl).href,
                        cancel_url: new URL('/preview/artwork.html?checkout=cancelled', siteUrl).href
                    }
                }
            }
        }, undefined, config.paypalEnvironment);

        if (typeof result.id !== 'string' || !result.id.trim() || !['CREATED', 'PAYER_ACTION_REQUIRED'].includes(result.status)) {
            console.error('PayPal returned an unexpected create-order response.');
            return jsonResponse(502, { error: 'PayPal did not create an order. Please try again.' });
        }
        return jsonResponse(200, { id: result.id });
    } catch (error) {
        console.error('Could not create PayPal order:', error.message);
        return jsonResponse(error.statusCode || 502, { error: error.message || 'Could not create a PayPal order.' });
    }
};
}

export default paymentFunction(createHandler());
