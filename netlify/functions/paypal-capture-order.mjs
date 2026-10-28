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

        if (result.status !== 'COMPLETED') {
            return jsonResponse(409, { error: 'PayPal has not confirmed this payment.', status: result.status });
        }
        return jsonResponse(200, { status: result.status });
    } catch (error) {
        console.error('Could not capture PayPal order:', error.message);
        return jsonResponse(error.statusCode || 502, { error: error.message || 'Could not confirm the PayPal payment.' });
    }
};
}

export const handler = createHandler();
