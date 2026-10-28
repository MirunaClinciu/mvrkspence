import {
    getPaypalAccessToken,
    initializePaymentStore,
    getShopConfig,
    jsonResponse,
    readRequestBody,
    requestPaypal
} from './paypal-utils.mjs';

export function createHandler({ initialize = initializePaymentStore, loadConfig = getShopConfig } = {}) {
return async function handler(event) {
    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { error: 'Use POST to capture a PayPal order.' });
    }

    try {
        initialize(event);
        const request = readRequestBody(event);
        if (typeof request.orderId !== 'string' || !/^[A-Za-z0-9-]{6,100}$/.test(request.orderId)) {
            return jsonResponse(400, { error: 'The PayPal order ID is invalid.' });
        }

        const { config, paymentSecret } = await loadConfig();
        const accessToken = await getPaypalAccessToken(config.paypalClientId, config.paypalEnvironment, paymentSecret);
        const result = await requestPaypal(
            `/v2/checkout/orders/${encodeURIComponent(request.orderId)}/capture`,
            accessToken,
            {},
            `capture-${request.orderId}`,
            config.paypalEnvironment
        );

        if (!result || typeof result !== 'object') {
            return jsonResponse(502, { error: 'PayPal did not return a payment confirmation.' });
        }
        if (result.status !== 'COMPLETED') {
            return jsonResponse(409, { error: 'PayPal has not confirmed this payment.', status: typeof result.status === 'string' ? result.status : 'UNCONFIRMED' });
        }

        // A completed order can still contain a declined or pending card capture.
        // Only the actual captures confirm that money was received.
        const units = result.purchase_units;
        if (result.id !== request.orderId || !Array.isArray(units) || !units.length || units.some(unit =>
            !Array.isArray(unit?.payments?.captures) || !unit.payments.captures.length
        )) {
            return jsonResponse(502, { error: 'PayPal did not return a complete payment confirmation.' });
        }
        const captures = units.flatMap(unit => unit.payments.captures);
        if (captures.some(capture => !capture || typeof capture.id !== 'string' || !capture.id.trim() || typeof capture.status !== 'string')) {
            return jsonResponse(502, { error: 'PayPal did not return a complete payment confirmation.' });
        }
        const incomplete = captures.find(capture => capture.status !== 'COMPLETED');
        if (incomplete) {
            return jsonResponse(409, {
                error: incomplete.status === 'PENDING'
                    ? 'Your payment is still pending. Please check its status before trying again.'
                    : 'PayPal has not confirmed this payment. Please use another payment method.',
                status: incomplete.status
            });
        }
        return jsonResponse(200, { status: 'COMPLETED' });
    } catch (error) {
        console.error('Could not capture PayPal order:', error.message);
        return jsonResponse(error.statusCode || 502, { error: error.message || 'Could not confirm the PayPal payment.' });
    }
};
}

export const handler = createHandler();
