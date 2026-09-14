# Spotify Pixel for Google Tag Manager Web

The **Spotify Pixel by Stape** tag integrates the [Spotify Ad Analytics Pixel](https://adshelp.spotify.com/s/article/About-the-Spotify-Pixel-US) into your website via a Google Tag Manager Web container. It allows you to send standard or custom events to Spotify, including user data for `alias`-based advanced matching, to improve ad performance and attribution.

✅ This tag does not require the base pixel code to be installed separately as a Custom HTML tag — simply add the tag to your GTM container and it will work.

## How to Use

1. Add the **Spotify Pixel by Stape** tag to your Web GTM container.
2. Enter your **Spotify Pixel Key** from Spotify Ad Analytics.
3. Choose how the **Event Name** is defined:
   - **Inherit from DataLayer** — maps GTM/GA4 event names to Spotify Pixel equivalents.
   - **Override** — choose from the list of standard commands or one of the 5 custom event slots.
4. Enable **Automatic Data Layer Mapping** (recommended) to automatically parse GA4 e-commerce data for User Data and Event Parameters.
5. (Optional) Enable **Advanced Matching** to securely pass user data (email, phone number, ID) to Spotify via the `alias` command for better attribution.
6. (Optional) Enable **Event User Data Enhancement** to store and reuse resolved user data via `localStorage` across sessions.
7. (Optional) Configure **Consent Settings**, using manual consent or Google Consent Mode.
8. (Optional) Configure **Server-Side Tracking Settings** by providing an Event ID for deduplication with the Spotify Conversions API.
9. (Optional) Add extra metadata to your events using the **Event Parameters** section.

## Event Name Setup Options

Spotify's pixel uses a fixed vocabulary of event commands — there is no support for freeform custom event names.

- **Standard commands** (when overriding): `view` (Page View), `product` (View Product), `lead`, `signup`, `addtocart`, `checkout`, `purchase`.
- **Custom commands** (when overriding): `custom_event_1` through `custom_event_5` — 5 fixed slots only.
- **Inherit from DataLayer** (default) maps common GA4/GTM event names to their Spotify equivalents:

| DataLayer Event | Spotify Pixel Command |
|---|---|
| `page_view`, `gtm.init`, `gtm.js`, `gtm.historyChange`, `gtm.dom`, `page_view_stape` | `view` |
| `view_item`, `view_item_stape`, `gtm4wp.productClickEEC` | `product` |
| `generate_lead` | `lead` |
| `sign_up`, `sign_up_stape` | `signup` |
| `add_to_cart`, `add_to_cart_stape`, `gtm4wp.addProductToCartEEC` | `addtocart` |
| `begin_checkout`, `begin_checkout_stape`, `gtm4wp.checkoutStepEEC` | `checkout` |
| `purchase`, `purchase_stape`, `gtm4wp.orderCompletedEEC` | `purchase` |

A DataLayer event name without a mapping above is not sent as an event — the tag still sends the `conf` and (if enabled) `alias` commands, and completes successfully.

## Required Fields

- **Spotify Pixel Key** — must be a non-empty string from your Spotify Ad Analytics account.
- **Event Name** — must be resolved either from the Data Layer or the override settings.

⚠️ **Only one Spotify Pixel Key is active per page at a time.** The vendor SDK's `conf` command is global — if it's called more than once on the same page (e.g. from multiple tags), the last call wins and silently overrides any previous key. Make sure every Spotify Pixel tag on a page uses the same Pixel Key.

## Features

### Advanced Matching (`alias`)

Unlike some other pixels, Spotify links its own cookie ID to your first-party identifiers through a dedicated `alias` command rather than merging user data into every event call.

⚠️ **Email and Phone Number must be sent RAW, not pre-hashed.** Spotify's own pixel script hashes these two fields itself, client-side, on every page — unconditionally, with no detection of an already-hashed value. If you pre-hash them yourself before passing them to this tag, Spotify's script will hash the hash, and the result will no longer match Spotify's own hashed user database. This tag intentionally does **not** offer a "pre-hashed" option for these two fields, and sends whatever you provide as-is. Supported fields:

- **Email** (`email`) — send raw, e.g. `jane@example.com`
- **Phone Number** (`phone_number`) — send raw, e.g. `+14155552671`
- **ID** (`id`) — the one exception: sent exactly as provided, with no hashing applied by this tag or by Spotify's script. Spotify's docs state this field should already be a hashed internal user ID, and since the hashing algorithm/salt used is unknown to this tag, hashing it again could corrupt an already-processed identifier.
- **Spotify Click ID** (`click_id`) — sent exactly as provided, with no hashing applied. Spotify's pixel script already auto-captures this from the `?spclid=` URL parameter and persists it in `sessionStorage` for the rest of the browser tab's session — only set this field if you need to override that value or supply a click ID from another source.
- **Partner User ID** (`partner_user_id`) — sent exactly as provided, with no hashing applied.

User data can be sourced from:

- A manually entered table.
- The Data Layer (`user_data` object).
- A custom variable (e.g. a User-Provided Data Variable).

⚠️ **Disabling Advanced Matching later does not clear data Spotify's script has already cached in the browser.** Every `alias` call the pixel script processes writes the hashed email/phone number and the ID/partner ID into `localStorage` (which persists indefinitely) and the click ID into `sessionStorage`. On every later page view, if the outgoing events don't already include an `alias` call, the pixel script automatically re-sends one built from whatever is still cached there — this happens entirely inside the vendor script, with no setting exposed to turn it off. So turning off **Enable Advanced Matching** only stops *this tag* from sending new user data going forward; to stop the pixel script itself from resending previously-collected data, clear `alias_id`, `user_hashed_email`, `user_hashed_phone_number` and `partner_user_id` from `localStorage` and `click_id` from `sessionStorage` (or test in a fresh browser profile).

### Event User Data Enhancement

When enabled, resolved user data is stored in `localStorage` to persist across events and sessions, improving match quality for repeat visitors or multi-page actions. Reads and writes are gated on consent — when consent hasn't been granted, the tag skips all `localStorage` interactions.

### Consent Settings

- **Manual Consent** (`consentGranted` field) — explicitly grant or deny consent for the pixel to fire.
- **Google Consent Mode** — when enabled, the tag checks the `ad_storage` consent signal. If consent is denied at tag execution time, the tag's commands and the pixel script load are queued and dispatched automatically once `ad_storage` is granted.

### Server-Side Deduplication

If you use both client-side and server-side (Conversions API, see [Spotify Conversions API by Stape](https://github.com/stape-io/spotify-tag)) Spotify tracking, you can prevent duplicate conversions:

- Use the **Event ID** field to send a unique identifier for each event (the `event_id` parameter).
- Enable **DataLayer Push** to create a new Data Layer event containing the Event ID, which can be used to trigger your server-side tag and forward the same ID.

### Event Parameters

Send additional metadata with your events using:

- **Event Parameters Table**: for standard Spotify parameters (`value`, `currency`, `quantity`, `category`, `type`, `product_id`, `product_name`, `product_type`, `product_vendor`, `variant_id`, `variant_name`, `discount_code`, `is_new_customer`, `order_id`, `sign_up_method`).
- **Custom Variable**: load parameters from a JavaScript object variable.
- **Data Layer Mapping**: automatically maps `value` and `currency` (from `ecommerce`/top-level Data Layer keys) and a `quantity` summed across all items, for every event.
  - For **`checkout`/`purchase`** — the only two Spotify events with a multi-product `line_items` field — every GA4 `items[]` element is also mapped into one `line_items` entry (`item_id`→`product_id`, `item_name`→`product_name`, `item_category`→`product_type`, `item_brand`→`product_vendor`, `item_variant_id`→`variant_id`, `item_variant`→`variant_name`, `price`→`value`, `quantity`→`quantity`).
  - For every other event (`product`, `addtocart`, etc.), Spotify's schema has only a single `product_id`/`product_name`/... slot, not an array — so rather than silently picking one GA4 item and dropping the rest when there's more than one, no item fields are auto-mapped at all. Set them explicitly via the Event Parameters table or a custom variable instead.

## Useful Resources

- [About the Spotify Pixel](https://adshelp.spotify.com/s/article/About-the-Spotify-Pixel-US)
- [Install and Verify the Spotify Pixel](https://adshelp.spotify.com/s/article/Install-and-Verify-the-Spotify-Pixel-US)
- [How does the Alias ID event work](https://help.adanalytics.spotify.com/how-does-the-alias-id-event-work)
- [About Conversion Event Types](https://adshelp.spotify.com/HelpCenter/s/article/about-conversion-event-types-US)
- [About Parameters](https://adshelp.spotify.com/HelpCenter/s/article/About-Parameters-US)
- [Sample Pixel Implementation Guide](https://adshelp.spotify.com/HelpCenter/s/article/Sample-Pixel-Implementation-Guide-US)

## Open Source

The **Spotify Pixel for Google Tag Manager Web** is developed and maintained by the [Stape Team](https://stape.io/) under the Apache 2.0 license.

### GTM Gallery Status
🔴 Not listed
