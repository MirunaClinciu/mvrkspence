import {
    fallbackPaymentSettings,
    paymentJson,
    publicPaymentSettings,
    readPaymentSettings
} from '../lib/payment-settings.mjs';

export function createPublicPayPalSettingsHandler({
    readSettings = readPaymentSettings,
    fallbackSettings = fallbackPaymentSettings
} = {}) {
    return async function publicPayPalSettings(request) {
        if (request.method !== 'GET') {
            return paymentJson(405, { error: 'Use GET for public payment settings.' }, { Allow: 'GET' });
        }
        try {
            const settings = await readSettings() ?? fallbackSettings();
            return paymentJson(200, publicPaymentSettings(settings));
        } catch (_) {
            return paymentJson(503, { error: 'Payment options are temporarily unavailable. Please try again later.' });
        }
    };
}

export default createPublicPayPalSettingsHandler();
