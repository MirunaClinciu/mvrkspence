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
   cards, navigation links, gallery photos, journal posts, footer/contact links,
   and products. Collapsed entries show their names so long lists stay manageable.
   The image fields open a file picker so photos can be selected from the
   computer. Photos are uploaded to `uploads/`.
5. Save changes as a draft, then use the CMS publish action when ready.
   Publishing commits the content and uploaded images to GitHub and triggers a
   Netlify deploy.

The editor controls the coming-soon page, shared site name/description/logo,
browser icon, navigation, footer, all page copy and images, contact/social
links, journal posts, and shop settings/products. To change the PayPal app, edit **PayPal
public client ID** in **Shop & payments**. This value is safe to edit in the
CMS because PayPal client IDs are public identifiers. The matching secret
must remain in Netlify environment variables and must be updated there when
switching PayPal apps or environments; never paste the secret into the CMS.

The site layout and styling are still maintained in the website source code.
Home, Concept, and Shop have visual previews inside the editor. These help check
text and uploaded images before publishing; preview buttons do not take payments.
The shop supports a fixed optional shipping fee per order containing physical
items; configure it in **Shop & payments**. Inventory is not tracked, orders
are not stored in an admin dashboard, and no order-email or digital-download
delivery system is configured. Mark products unavailable when they sell out,
and arrange fulfillment directly through PayPal. Tax handling is not configured
by the site. To preview changes locally, serve this folder over HTTP rather
than opening the HTML files directly; the site loads editable content from
JSON files.

## Editing the blog and shop

Open **Website pages > Concept page & journal** to change the page introduction,
main story or gallery. Under **Journal posts**, choose **Add Post**, enter a unique
permanent ID such as `studio-notes-01`, title, date and text, then optionally
upload a photo from your computer. Leave a blank line between paragraphs. Switch
**Published on the website** on when ready. Save and publish the Concept page to
make the changes live. Switch it off to hide a post while keeping it in the editor;
remove the list entry to delete it. Keep IDs unchanged after publishing so links
to those posts continue to work. Posts appear newest first on the Concept page. Hidden entries in a published
content file can still be read in its JSON; keep private drafts in the CMS
editorial workflow until ready to publish.
There are no prewritten journal entries.

Open **Shop & payments > Shop settings & products** to add, remove or reorder
Artwork listings. Use **Add Product**, choose a unique permanent ID, add its name,
description and image, then choose physical or digital. For an enquiry listing,
leave **Enable PayPal checkout** off. To sell it, enter the actual price above zero
in the selected shop currency and switch checkout on. Use **Show on Artwork page**
to hide a listing without deleting it; remove the list entry to delete it. New
listings start as enquiries to prevent publishing an unintended selling price.
The initial artwork listings use existing portfolio images and accept enquiries
until the administrator enters prices and enables checkout.

Publishing content and taking payments are separate: the CMS can publish artwork
before PayPal is configured. For checkout, complete the sandbox setup below and
test a payment before entering live credentials. The administrator controls the
public client ID in the CMS; the private secret stays in Netlify.

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

The preview homepage preserves the original full-width image stack without an
added title or introductory panel. Images and destinations remain CMS-editable.
Shared pages include a skip link, keyboard-accessible navigation and a basket
dialog that returns focus when closed.

Editor configuration follows the [Decap list widget documentation](https://decapcms.org/docs/widgets/list/)
and [custom preview API](https://decapcms.org/docs/customization/).
