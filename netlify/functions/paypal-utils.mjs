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

export async function getShopConfig() {
    const siteUrl = getSiteUrl();
    const response = await fetch(new URL('/content/shop.json', siteUrl), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Could not load the product catalog (${response.status}).`);

    const config = await response.json();
    if (!config || typeof config !== 'object') throw new Error('The product catalog is invalid.');
    if (typeof config.paypalClientId !== 'string' || !config.paypalClientId.trim()) {
        throw new Error('PayPal client ID is missing from the shop settings.');
    }
    config.paypalClientId = config.paypalClientId.trim();
    if (typeof config.currency !== 'string' || !supportedCurrencies.has(config.currency)) {
        throw new Error('The shop currency is invalid or unsupported.');
    }
    return { config, siteUrl };
}

export function getPaypalHost() {
    const environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
    const host = paypalHosts[environment];
    if (!host) throw new Error('PAYPAL_ENVIRONMENT must be "sandbox" or "live".');
    return host;
}

export async function getPaypalAccessToken(clientId) {
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientSecret) throw new Error('PAYPAL_CLIENT_SECRET is not set in the Netlify environment.');

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(`${getPaypalHost()}/v1/oauth2/token`, {
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
    if (!event.body || event.body.length > 20000) throw new Error('The request body is missing or too large.');
    let body;
    try {
        body = JSON.parse(event.body);
    } catch (error) {
        throw new Error('The request body must be valid JSON.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('The request body must be a JSON object.');
    }
    return body;
}

export async function requestPaypal(path, accessToken, body) {
    const response = await fetch(`${getPaypalHost()}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': crypto.randomUUID()
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
