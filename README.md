# Mvrk Spence website

## Publishing and site admin

The site is hosted on Netlify from `MirunaClinciu/mvrkspence`, with `main` as
the publishing branch. Automatic updates require the repository connection
and available production deployment capacity. The included `netlify.toml`
sets the publish directory and PayPal function directory.

The root URL displays the original portfolio homepage. Home, Concept,
Artwork & Shop, and Contact are available at
`https://mvrkspence.com/`. The custom domain is connected to the Netlify site;
`www.mvrkspence.com` redirects to the main domain. The `/preview/` pages remain
available for testing. The separate coming-soon page is at `/coming-soon.html`.
The portfolio homepage keeps the original image-led layout: full-width Book,
Artwork, and Concept images stacked below the dark navigation.

The custom domain serves the portfolio. The shop stays in sandbox mode while
sample prices and products are being tested. Administrator editing requires
an invited website account; Netlify hosting-account access is separate.

The latest hosting check reported a Netlify production deployment pause.
Editor loading, media uploads and draft saving have been verified, but new
published content will not appear live until the hosting owner resolves the
deployment restriction. Uploading an image or saving a draft alone does not
confirm that Netlify has deployed a new website version.

The simple website manager is at `/manage/`. It provides sign-in and direct
editing options for home pictures, Concept and journal, photographs and their product formats, separate books,
contact details, website setup and PayPal payments. PayPal setup is explained at
`/manage/paypal.html`. The editing guide at `/admin/guide.html`
explains each step; no coding experience is needed for content changes.
The full editor remains available at `/admin/`. **Manage image library** opens
`/admin/?task=images`. The dashboard groups tasks and explains adding,
replacing and removing pictures. The editing guide starts with these image
tasks and a short Edit → Save and check → Publish walkthrough.

To enable the editor:

1. Enable Netlify Identity for the deployed site, set registration to **Invite
   only**, and enable Git Gateway.
2. Invite the site administrator using their email address. They accept the
   invite and create their own password; do not put account passwords in the
   repository or share them with editors.
3. Open `https://mvrkspence.com/manage/` and sign in using
   the invited email and password.
4. In the CMS, open **Website setup**, **Website pages**, or **Artwork & books**
   to edit the related settings. List controls add, remove, and reorder home
   cards, navigation links, gallery photos, journal posts, footer/contact links,
   and products. Collapsed entries show their names so long lists stay manageable.
   The image fields open a file picker so photos can be selected from the
   computer. Photos are uploaded to `uploads/`.
5. Save changes as a draft, check the visual preview, then use **Publish** when
   ready. Publishing commits the content to GitHub. Confirm that the Netlify
   deployment succeeds before expecting the live website to change.

The editor controls the separate `/coming-soon.html` page, shared site name/description/logo,
browser icon, navigation, footer, all page copy and images, contact/social
links, journal posts, and shop settings/products. Open **PayPal payments** from
the website dashboard to enter both the Client ID and Secret directly, choose
test or live mode, then use **Save and connect PayPal**. This protected form
checks the app details with PayPal and stores them on the server. Secrets never
enter the CMS content, GitHub repository or a browser storage field.

The site layout and styling are still maintained in the website source code.
Home, Concept, Shop and Books have visual previews inside the editor. These help check
text and uploaded images before publishing; preview buttons do not take payments.
The shop supports a fixed optional shipping fee per order containing physical
items; configure it in **Artwork & books > Photographs & shop settings**. Inventory is not tracked, orders
are not stored in an admin dashboard, and no order-email or digital-download
delivery system is configured. Mark products unavailable when they sell out,
and arrange fulfillment directly through PayPal. Tax handling is not configured
by the site. To preview changes locally, serve this folder over HTTP rather
than opening the HTML files directly; the site loads editable content from
JSON files.

## Editing the blog and shop

Open **Website pages > Concept page & journal** to change the page introduction,
main story or gallery. Under **Journal posts**, choose **Add Post**, enter a
title, date and text, then optionally
upload a photo from your computer. Leave a blank line between paragraphs. Switch
**Published on the website** on when ready. Save and publish the Concept page to
make the changes live. Switch it off to hide a post while keeping it in the editor;
remove the list entry to delete it. Stable references are generated automatically
for new posts and retained when an existing title changes. Posts appear newest
first on the Concept page. Hidden entries remain in published JSON; keep
unfinished changes in the draft workflow until ready to publish. Repository
visibility determines whether draft source is private.
There are no prewritten journal entries.

Open **Artwork & books > Photographs & shop settings** and use **Add Photograph**
under **Photographs & artwork**. Enter its title and description, then upload or
select its image once. New photographs start with four enquiry-only formats:
art print, T-shirt, framed print and canvas. Expand **Formats & sizes** to change
their sizes and prices, remove unwanted formats, or use **Add Format** for another
size. References are generated automatically and hidden from the form; existing
references remain stable when names or sizes change. The photograph is reused
automatically for all formats. For several T-shirt sizes, add one entry per size.
Leave **Enable checkout for this
format** off for enquiries, or enter a price above zero and switch it on to sell.
Use **Offer this format** to hide one variant, or **Show this photograph on Artwork**
to hide the photograph and all its variants. The website's visual previews illustrate
image placement; physical printing, production and dispatch are arranged manually.
There is no automatic connection to a print-on-demand supplier.

Books are edited separately in **Artwork & books > Books**, stored in
`content/books.json`, and displayed in their own Artwork page section. Use **Add Book**,
upload its cover and enter the title, edition description and price. Its stable
reference is generated automatically.
Books share the shop's currency and shipping settings. Leave **Enable PayPal checkout**
off for enquiries; use **Show this book** to hide a sold-out book. Each editor entry
is saved and published separately. Existing standalone products remain supported
under **Other / existing products** in the shop editor.

The sample shop includes the original demonstration photograph and the uploaded
photograph listed as **Ravens in the Mist**. Its name and description are editable.
Both offer sample art print (GBP 25), framed print (GBP 60), T-shirt (GBP 28) and
canvas (GBP 70) variants. A separate sample book costs GBP 35, with a sample GBP
4.95 shipping fee per physical order. Existing sample product IDs are preserved.
These are placeholders for testing; check descriptions, sizes and prices before
real sales.
**Test shop with sample products** prevents live PayPal processing while these
example prices are in use. Keep it on until the real catalogue is ready.

Publishing content and taking payments are separate: the CMS can publish artwork
before PayPal is configured. For checkout, complete the sandbox setup below and
test a payment before entering live credentials. The administrator manages
Client IDs, Secrets and payment mode at `/manage/paypal.html`.

## Adding, replacing and removing images

Open the page, photograph or book you want to change and use its image field:

- **Choose an image** opens the library; select an existing file or use **Upload**.
- **Replace image** changes that picture while keeping the listing's text and formats.
- **Remove image** clears an optional image field. An artwork or book needs an image;
  replace it, hide the listing or remove the complete list entry instead.
- A list entry's **Remove** control removes a homepage picture, gallery item, artwork,
  book or journal post from that page after saving and publishing.

An upload is stored in `uploads/`; it does not create a product listing by itself.
Removing a page image or listing keeps its uploaded file available in the library.
Use **Manage image library > Delete selected** only to delete an unused file
completely. Check that no other page or product uses that file first.

## PayPal checkout

Checkout uses the PayPal Orders API through Netlify Functions. The server uses prices and availability from `content/shop.json` and `content/books.json` bundled during
each deployment and creates/captures
orders using server-side credentials. It does not accept prices from a
customer's browser.

1. Open **PayPal payments** at `/manage/paypal.html` and sign in with the
   website administrator account.
2. Open or create a **Sandbox** app in the PayPal Developer Dashboard. Copy its
   Client ID and Secret into **Test Client ID** and **Test Secret** on the form.
3. Choose **Test payments**, then select **Save and connect PayPal**. The server
   verifies the details with PayPal before saving; this does not make a charge.
   Reopen the shop to use the updated payment setup. No content publish or
   Netlify environment-variable editing is required.
4. Test checkout using a separate PayPal sandbox buyer account.
5. Before real sales, replace all sample products and prices and turn **Test
   shop with sample products** off. Enter the Live app's Client ID and Secret
   under **Real payment details**, choose **Real payments**, then save.

Secrets are stored in a site-wide Netlify Blobs store, encrypted by Netlify at
rest and in transit. Only the verified website owner or an account with a
server-assigned admin role may read the redacted settings or save credentials.
The API returns only public Client IDs and whether each Secret is saved. A saved
Secret is never returned to the browser. Leave a Secret field blank to preserve
it; supply a new matching Secret when changing its Client ID.

Existing public settings in `content/payments.json` and matching Netlify
environment secrets remain a migration fallback until settings are saved in
the protected form. The server uses the active saved payment mode and selects
the matching PayPal API host. Never place a private Secret in CMS JSON files.

Product prices and the fixed shipping fee use two decimal places. Physical
goods checkout asks PayPal for the buyer's shipping address; digital items do
not add shipping.

## Repository setup

The website source is in the `MirunaClinciu/mvrkspence` GitHub repository.
Netlify Identity/Git Gateway, PayPal credentials and the Netlify site itself
must be configured in their respective dashboards; those account-specific
settings cannot be created from the static site files.

The homepage preserves the original full-width image stack without an
added title or introductory panel. Images and destinations remain CMS-editable.
Shared pages include a skip link, keyboard-accessible navigation and a basket
dialog that returns focus when closed.

Editor configuration follows the [Decap list widget documentation](https://decapcms.org/docs/widgets/list/)
and [custom preview API](https://decapcms.org/docs/customization/).
