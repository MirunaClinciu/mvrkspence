# Mvrk Spence website

## Publishing and site admin

The site is static and is designed to deploy from the `main` branch of
`MirunaClinciu/mvrkspence` on Netlify. In Netlify, import that GitHub repository
as a new site. The included `netlify.toml` sets the publish directory and
PayPal function directory.

To enable the editor:

1. Enable Netlify Identity for the deployed site, set registration to **Invite
   only**, and enable Git Gateway.
2. Invite the site administrator through Netlify Identity.
3. Open `https://<your-site-domain>/admin/` and sign in.
4. Edit pages and products in the CMS. Photos selected from the computer are
   uploaded to `uploads/`; publishing changes commits them to the repository
   and triggers a new site deploy.

The admin edits page text, home page cards, contact/social links, product
details and product photos. To preview changes locally, serve this folder over
HTTP rather than opening the HTML files directly; the site loads its editable
content from JSON files.

## PayPal checkout

Checkout uses the PayPal Orders API through Netlify Functions. The server reads
current prices and availability from `content/shop.json` and creates/captures
orders using server-side credentials. It does not accept prices from a
customer's browser.

1. Create a PayPal app in the PayPal Developer Dashboard.
2. Add its **sandbox** client ID to Artwork & shop in the CMS.
3. In Netlify site environment variables, set `PAYPAL_CLIENT_SECRET` to the
   matching sandbox secret and `PAYPAL_ENVIRONMENT` to `sandbox`.
4. Test a complete checkout with PayPal sandbox buyer and seller accounts.
5. Before accepting real payments, change the CMS client ID to the live ID,
   set the matching live `PAYPAL_CLIENT_SECRET`, and change
   `PAYPAL_ENVIRONMENT` to `live`.

Never put a PayPal client secret in the CMS, a JSON file, or browser code. The
PayPal buttons appear after a client ID is configured; checkout will report a
configuration error until the matching server secret is set in Netlify.
Product prices use two decimal places. Physical goods checkout asks PayPal for
the buyer's shipping address.

## Repository setup

The local website files need to be pushed to the GitHub repository before
Netlify can deploy them. Netlify Identity/Git Gateway, PayPal credentials and
the Netlify site itself must be configured in their respective dashboards;
those account-specific settings cannot be created from the static site files.
