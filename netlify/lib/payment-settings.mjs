import { getStore } from '@netlify/blobs';
import bundledPayments from '../../content/payments.json' with { type: 'json' };
import bundledShop from '../../content/shop.json' with { type: 'json' };

const storeOptions = Object.freeze({
    name: 'paypal-payment-settings',
    consistency: 'strong',
    region: 'eu-central-1'
});
const settingsKey = 'credentials';
const credentialFields = ['sandboxClientId', 'liveClientId', 'sandboxSecret', 'liveSecret'];

export function getPaymentStore() {
    // Netlify injects this site's storage credentials. Nothing is put in the
    // browser or repository. Store and key names never come from a request.
    return getStore(storeOptions);
}

export async function readPaymentSettings({ store = getPaymentStore() } = {}) {
    const settings = await store.get(settingsKey, { type: 'json', consistency: 'strong' });
    if (settings === null) return null;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) ||
        !['sandbox', 'live'].includes(settings.environment) ||
        credentialFields.some(field => typeof settings[field] !== 'string')) {
        throw new Error('Stored payment settings are unavailable.');
    }
    return {
        environment: settings.environment,
        ...Object.fromEntries(credentialFields.map(field => [field, settings[field]]))
    };
}

export async function writePaymentSettings(settings, { store = getPaymentStore() } = {}) {
    // Write only the known fields; caller input cannot select a blob key or
    // smuggle another setting into the private store.
    await store.setJSON(settingsKey, {
        environment: settings.environment,
        ...Object.fromEntries(credentialFields.map(field => [field, settings[field]]))
    });
}

export function fallbackPaymentSettings() {
    const legacyEnvironment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
    const environment = ['sandbox', 'live'].includes(bundledPayments.environment)
        ? bundledPayments.environment : 'sandbox';
    const legacyId = environment === legacyEnvironment && typeof bundledShop.paypalClientId === 'string'
        ? bundledShop.paypalClientId.trim() : '';
    const legacySecret = typeof process.env.PAYPAL_CLIENT_SECRET === 'string'
        ? process.env.PAYPAL_CLIENT_SECRET.trim() : '';
    return {
        environment,
        sandboxClientId: typeof bundledPayments.sandboxClientId === 'string'
            ? bundledPayments.sandboxClientId.trim() || (environment === 'sandbox' ? legacyId : '') : '',
        liveClientId: typeof bundledPayments.liveClientId === 'string'
            ? bundledPayments.liveClientId.trim() || (environment === 'live' ? legacyId : '') : '',
        sandboxSecret: process.env.PAYPAL_CLIENT_SECRET_SANDBOX?.trim() ||
            (legacyEnvironment === 'sandbox' ? legacySecret : ''),
        liveSecret: process.env.PAYPAL_CLIENT_SECRET_LIVE?.trim() ||
            (legacyEnvironment === 'live' ? legacySecret : '')
    };
}

export function publicPaymentSettings(settings) {
    return {
        environment: settings.environment,
        sandboxClientId: settings.sandboxClientId,
        liveClientId: settings.liveClientId
    };
}

export function adminPaymentSettings(settings) {
    return {
        ...publicPaymentSettings(settings),
        sandboxSecretConfigured: Boolean(settings.sandboxSecret),
        liveSecretConfigured: Boolean(settings.liveSecret)
    };
}

export function paymentJson(status, body, headers = {}) {
    return Response.json(body, {
        status,
        headers: {
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            ...headers
        }
    });
}
