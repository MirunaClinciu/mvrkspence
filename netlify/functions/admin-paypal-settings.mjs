import { getUser } from '@netlify/identity';
import bundledShop from '../../content/shop.json' with { type: 'json' };
import {
    adminPaymentSettings,
    fallbackPaymentSettings,
    paymentJson,
    readPaymentSettings,
    writePaymentSettings
} from '../lib/payment-settings.mjs';

const ownerUserId = '74e5724b-5c9e-4540-811b-a75a9976f6f3';
const credentialFields = ['sandboxClientId', 'liveClientId', 'sandboxSecret', 'liveSecret'];
const paypalHosts = {
    sandbox: 'https://api-m.sandbox.paypal.com',
    live: 'https://api-m.paypal.com'
};

function canManagePayments(user) {
    // getUser() supplies the platform-verified Identity user. Its roles come
    // from server-controlled app_metadata, not editable profile metadata.
    return user?.id === ownerUserId || (Array.isArray(user?.roles) && user.roles.includes('admin'));
}

class PaymentSetupError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

function problem(message, status = 400) {
    return new PaymentSetupError(message, status);
}

function credentialValue(value, field) {
    if (typeof value !== 'string' || value.length > 1024 || /[\x00-\x1f\x7f]/.test(value)) {
        throw problem(`PayPal ${field.includes('Secret') ? 'Secret' : 'Client ID'} must be copied as one line from your PayPal app.`);
    }
    return value.trim();
}

export async function verifyPayPalCredentials(environment, clientId, secret) {
    const host = paypalHosts[environment];
    if (!host || !['sandbox', 'live'].includes(environment)) throw problem('Choose Test payments or Real payments.');
    let response;
    try {
        response = await fetch(`${host}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials',
            signal: AbortSignal.timeout(15000)
        });
    } catch (_) {
        throw problem('PayPal could not be reached. Your settings have not been changed. Please try again.', 503);
    }
    if (!response.ok) {
        // Never echo PayPal's response or submitted credentials to the browser.
        throw problem(`PayPal could not verify the ${environment === 'sandbox' ? 'test' : 'live'} Client ID and Secret. Check that both come from the same PayPal app.`);
    }
    let token;
    try { token = await response.json(); }
    catch (_) { throw problem('PayPal returned an unreadable response. Your settings have not been changed.', 502); }
    if (typeof token?.access_token !== 'string' || !token.access_token) {
        throw problem('PayPal did not confirm the credentials. Your settings have not been changed.', 502);
    }
}

export function createAdminPayPalSettingsHandler({
    authenticate = getUser,
    readSettings = readPaymentSettings,
    writeSettings = writePaymentSettings,
    fallbackSettings = fallbackPaymentSettings,
    verifyCredentials = verifyPayPalCredentials,
    sampleCatalogue = bundledShop.testMode === true
} = {}) {
    return async function adminPayPalSettings(request) {
        if (!['GET', 'POST'].includes(request.method)) {
            return paymentJson(405, { error: 'Use GET or POST for PayPal settings.' }, { Allow: 'GET, POST' });
        }
        let user;
        try { user = await authenticate(); }
        catch (_) { return paymentJson(401, { error: 'Sign in again to manage PayPal settings.' }); }
        if (!user) return paymentJson(401, { error: 'Sign in to manage PayPal settings.' });
        if (!canManagePayments(user)) return paymentJson(403, { error: 'This account does not have permission to manage payments.' });

        if (request.method === 'POST') {
            const origin = request.headers.get('origin');
            if (!origin || origin !== new URL(request.url).origin) {
                return paymentJson(403, { error: 'Open the payment settings on this website before saving.' });
            }
            if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
                return paymentJson(415, { error: 'Send payment settings as JSON.' });
            }
        }

        try {
            const current = await readSettings() ?? fallbackSettings();
            if (request.method === 'GET') return paymentJson(200, adminPaymentSettings(current));

            const raw = await request.text();
            if (raw.length > 12000) throw problem('The payment settings are too large.', 413);
            let body;
            try { body = JSON.parse(raw); }
            catch (_) { throw problem('The payment settings could not be read. Please try again.'); }
            if (!body || typeof body !== 'object' || Array.isArray(body)) {
                throw problem('The payment settings could not be read. Please try again.');
            }
            if (!['sandbox', 'live'].includes(body.environment)) throw problem('Choose Test payments or Real payments.');
            if (body.environment === 'live' && sampleCatalogue) {
                throw problem('Replace the sample products and switch off Test shop with sample products before enabling real payments. You can save live credentials while Test payments remains selected.');
            }

            const next = { ...current, environment: body.environment };
            for (const field of credentialFields) {
                if (body[field] === undefined) continue;
                const value = credentialValue(body[field], field);
                if (!field.endsWith('Secret') || value) next[field] = value;
            }

            const environmentsToVerify = new Set([next.environment]);
            for (const environment of ['sandbox', 'live']) {
                const idField = `${environment}ClientId`;
                const secretField = `${environment}Secret`;
                const suppliedSecret = typeof body[secretField] === 'string' && body[secretField].trim();
                if (next[idField] !== current[idField] && current[secretField] && !suppliedSecret) {
                    throw problem(`Enter the matching ${environment === 'sandbox' ? 'test' : 'live'} Secret when changing its Client ID.`);
                }
                if (suppliedSecret) {
                    if (!next[idField]) throw problem(`Enter the ${environment === 'sandbox' ? 'test' : 'live'} Client ID that belongs to this Secret.`);
                    environmentsToVerify.add(environment);
                }
            }
            const selected = next.environment;
            if (!next[`${selected}ClientId`] || !next[`${selected}Secret`]) {
                throw problem(`Enter both the ${selected === 'sandbox' ? 'test' : 'live'} Client ID and Secret before saving.`);
            }
            for (const environment of environmentsToVerify) {
                await verifyCredentials(environment, next[`${environment}ClientId`], next[`${environment}Secret`]);
            }
            await writeSettings(next);
            return paymentJson(200, adminPaymentSettings(next));
        } catch (error) {
            if (error instanceof PaymentSetupError) {
                return paymentJson(error.status, { error: error.message });
            }
            return paymentJson(503, { error: 'Secure payment settings could not be saved or loaded. Please try again later.' });
        }
    };
}

export default createAdminPayPalSettingsHandler();
