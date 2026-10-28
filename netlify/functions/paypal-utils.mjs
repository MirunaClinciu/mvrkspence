import { connectLambda } from '@netlify/blobs';
import { readPaymentSettings } from '../lib/payment-settings.mjs';
import bundledShop from '../../content/shop.json' with { type: 'json' };
import bundledPayments from '../../content/payments.json' with { type: 'json' };

const paypalHosts = {
    sandbox: 'https://api-m.sandbox.paypal.com',
    live: 'https://api-m.paypal.com'
};

const supportedCurrencies = new Set([
    'AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'NZD', 'SGD', 'USD'
]);

export function jsonResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        },
        body: JSON.stringify(body)
    };
}

export function getSiteUrl() {
    const rawUrl = process.env.DEPLOY_PRIME_URL || process.env.URL;
    if (!rawUrl) throw new Error('Netlify did not provide the site URL.');

    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
        throw new Error('The published site URL must use HTTPS.');
    }
    return url;
}

export function initializePaymentStore(event) {
    // Netlify supplies the scoped Blobs token on legacy Lambda events.
    // Modern Functions use the runtime context automatically.
    if (event.blobs) connectLambda(event);
}

export async function getShopConfig({ readSettings = readPaymentSettings } = {}) {
    const siteUrl = getSiteUrl();
    // A bundled catalog also works when the deployment requires visitor authentication.
    const config = structuredClone(bundledShop);
    if (!config || typeof config !== 'object') throw new Error('The product catalog is invalid.');
    const legacyEnvironment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
    let saved;
    try { saved = await readSettings(); }
    catch (_) { throw new Error('PayPal settings are temporarily unavailable. Please try again later.'); }
    if (saved !== null && (!saved || typeof saved !== 'object' || Array.isArray(saved))) {
        throw new Error('The saved PayPal settings could not be read. Reconnect PayPal in the admin.');
    }
    const payments = saved || bundledPayments;
    const environment = saved ? payments.environment : payments.environment ?? legacyEnvironment;
    getPaypalHost(environment);
    const publicId = environment === 'live' ? payments.liveClientId : payments.sandboxClientId;
    config.paypalEnvironment = environment;
    config.paypalClientId = typeof publicId === 'string' && publicId.trim()
        ? publicId.trim()
        : !saved && environment === legacyEnvironment && typeof config.paypalClientId === 'string'
            ? config.paypalClientId.trim() : '';
    if (config.testMode === true && environment !== 'sandbox') {
        throw new Error('The sample catalogue can only use PayPal sandbox. Choose Test payments in the admin PayPal settings while testing.');
    }
    if (typeof config.paypalClientId !== 'string' || !config.paypalClientId.trim()) {
        throw new Error(`The ${environment} PayPal client ID is missing. Add it in the admin PayPal settings.`);
    }
    config.paypalClientId = config.paypalClientId.trim();
    if (typeof config.currency !== 'string' || !supportedCurrencies.has(config.currency)) {
        throw new Error('The shop currency is invalid or unsupported.');
    }
    // Secrets stay separate from the public catalog shape and are never returned
    // from the create/capture endpoints.
    const paymentSecret = saved
        ? environment === 'live' ? saved.liveSecret || '' : saved.sandboxSecret || ''
        : undefined;
    return { config, siteUrl, paymentSecret };
}

export function getPaypalHost(environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox') {
    if (environment !== 'sandbox' && environment !== 'live') {
        throw new Error('The PayPal payment environment must be "sandbox" or "live".');
    }
    const host = paypalHosts[environment];
    return host;
}

export async function getPaypalAccessToken(clientId, environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox', secretOverride) {
    const host = getPaypalHost(environment);
    const secretName = environment === 'live' ? 'PAYPAL_CLIENT_SECRET_LIVE' : 'PAYPAL_CLIENT_SECRET_SANDBOX';
    const legacyEnvironment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
    const clientSecret = secretOverride === undefined
        ? process.env[secretName]?.trim() || (legacyEnvironment === environment ? process.env.PAYPAL_CLIENT_SECRET?.trim() : '')
        : typeof secretOverride === 'string' ? secretOverride.trim() : '';
    if (!clientSecret) throw new Error('PayPal is not connected. Add the matching Client ID and Secret in the admin PayPal settings, then choose Save and connect.');

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(`${host}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
        console.error('PayPal authentication failed with status', response.status);
        throw new Error('PayPal authentication failed. Check the PayPal client ID, secret and environment.');
    }

    const token = await response.json();
    if (typeof token.access_token !== 'string') throw new Error('PayPal did not return an access token.');
    return token.access_token;
}

export function readRequestBody(event) {
    const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
    if (!event.body || event.body.length > 20000) throw invalid('The request body is missing or too large.');
    let body;
    try {
        body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
    } catch (error) {
        throw invalid('The request body must be valid JSON.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw invalid('The request body must be a JSON object.');
    }
    return body;
}

export async function requestPaypal(path, accessToken, body, requestId = crypto.randomUUID(), environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox') {
    const response = await fetch(`${getPaypalHost(environment)}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            // The default minimal response omits capture payment statuses.
            Prefer: 'return=representation',
            'PayPal-Request-Id': requestId
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000)
    });
    const result = await response.json();
    if (!response.ok) {
        console.error('PayPal API request failed with status', response.status);
        throw new Error('PayPal could not complete the request. Please check the shop configuration and try again.');
    }
    return result;
}
