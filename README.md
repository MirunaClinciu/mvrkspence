# Mvrk Spence website

## Publishing and site admin

The site deploys from the `main` branch of `MirunaClinciu/mvrkspence` on
Netlify. If the repository is connected, commits to `main` trigger a deploy.
The included `netlify.toml` sets the publish directory and PayPal function
directory.

The root URL displays a coming-soon page. The original portfolio homepage and
the full site are available at
`https://stellar-tanuki-2253d7.netlify.app/preview/`; its Home, Concept,
Artwork & Shop, and Contact pages are all under `/preview/`.
The portfolio homepage keeps the original image-led layout: full-width Book,
Artwork, and Concept images stacked below the dark navigation.

The Netlify project is intended to remain private for now. With production
visibility set to **Private**, visitors outside the Netlify team cannot open
the deployed pages. Netlify team access is separate from the CMS login: an
Identity invite by itself does not grant access to a private deployment. Keep
the site private and add anyone who needs to open it as a Netlify team member.
Keep `mvrkspence.com` pointed at its existing site until you decide to make
this deployment public.

To enable the editor:

1. Enable Netlify Identity for the deployed site, set registration to **Invite
   only**, and enable Git Gateway.
2. Invite the site administrator using their email address. They accept the
   invite and create their own password; do not put account passwords in the
   repository or share them with editors.
3. Open `https://stellar-tanuki-2253d7.netlify.app/admin/` and sign in using
   the invited email and password.
4. In the CMS, open **Website setup**, **Website pages**, or **Shop & payments**
   to edit the related settings. List controls add, remove, and reorder home
   cards, navigation links, gallery photos, footer/contact links, and products.
   The image fields open a file picker so photos can be selected from the
   computer. Photos are uploaded to `uploads/`.
5. Save changes as a draft, then use the CMS publish action when ready.
   Publishing commits the content and uploaded images to GitHub and triggers a
   Netlify deploy.

The editor controls the coming-soon page, shared site name/description/logo,
browser icon, navigation, footer, all page copy and images, contact/social
links, and shop settings/products. To change the PayPal app, edit **PayPal
public client ID** in **Shop & payments**. This value is safe to edit in the
CMS because PayPal client IDs are public identifiers. The matching secret
must remain in Netlify environment variables and must be updated there when
switching PayPal apps or environments; never paste the secret into the CMS.

The site layout and styling are still maintained in the website source code.
The shop supports a fixed optional shipping fee per order containing physical
items; configure it in **Shop & payments**. Inventory is not tracked, orders
are not stored in an admin dashboard, and no order-email or digital-download
delivery system is configured. Mark products unavailable when they sell out,
and arrange fulfillment directly through PayPal. Tax handling is not configured
by the site. To preview changes locally, serve this folder over HTTP rather
than opening the HTML files directly; the site loads editable content from
JSON files.

## PayPal checkout

Checkout uses the PayPal Orders API through Netlify Functions. The server reads
current prices and availability from `content/shop.json` and creates/captures
orders using server-side credentials. It does not accept prices from a
customer's browser.

1. Create a PayPal app in the PayPal Developer Dashboard.
2. Add its **sandbox** client ID to **Shop & payments** in the CMS.
3. In Netlify site environment variables, set `PAYPAL_CLIENT_SECRET` to the
   matching sandbox secret and `PAYPAL_ENVIRONMENT` to `sandbox`.
4. Test a complete checkout with PayPal sandbox buyer and seller accounts.
5. Before accepting real payments, change the CMS client ID to the live ID,
   set the matching live `PAYPAL_CLIENT_SECRET`, and change
   `PAYPAL_ENVIRONMENT` to `live`.

Never put a PayPal client secret in the CMS, a JSON file, or browser code. The
PayPal buttons appear after a client ID is configured; checkout will report a
configuration error until the matching server secret is set in Netlify.
Product prices and the fixed shipping fee use two decimal places. Physical
goods checkout asks PayPal for the buyer's shipping address; digital items do
not add shipping.

## Repository setup

The website source is in the `MirunaClinciu/mvrkspence` GitHub repository.
Netlify Identity/Git Gateway, PayPal credentials and the Netlify site itself
must be configured in their respective dashboards; those account-specific
settings cannot be created from the static site files.
