# Mvrk Spence website

## Publishing and site admin

The site deploys from the `main` branch of `MirunaClinciu/mvrkspence` on
Netlify. If the repository is connected, commits to `main` trigger a deploy.
The included `netlify.toml` sets the publish directory and PayPal function
directory.

The root URL displays a coming-soon page. The full site is available at
`https://<your-site-domain>/preview/`; its Home, Concept, Artwork & Shop, and
Contact pages are all under `/preview/`.

To enable the editor:

1. Enable Netlify Identity for the deployed site, set registration to **Invite
   only**, and enable Git Gateway.
2. Invite the site administrator through Netlify Identity.
3. Open `https://<your-site-domain>/admin/` and sign in.
4. Edit pages and products in the CMS. Photos selected from the computer are
   uploaded to `uploads/`; publishing changes commits them to the repository
   and triggers a new site deploy.

The admin edits page text, home page cards, contact/social links, product
details and product photos. To change the PayPal app, open **Artwork & shop**
and edit **PayPal client ID**. This value is safe to edit in the CMS because
PayPal client IDs are public identifiers. The matching secret must remain in
Netlify environment variables and must be updated there when switching PayPal
apps or environments; never paste the secret into the CMS. To preview changes
locally, serve this folder over HTTP rather than opening the HTML files
directly; the site loads its editable content from JSON files.

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

The website source is in the `MirunaClinciu/mvrkspence` GitHub repository.
Netlify Identity/Git Gateway, PayPal credentials and the Netlify site itself
must be configured in their respective dashboards; those account-specific
settings cannot be created from the static site files.
