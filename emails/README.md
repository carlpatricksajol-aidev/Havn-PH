# ECStay emails

Transactional and lifecycle emails for ECStay, in the site's look (ivory page, white 600px card,
Newsreader headlines, Hanken Grotesk text, one evergreen pill button). Nothing here is wired up yet.

```
emails/
  build.mjs          builds dist/ from src/ (plain Node, no installs)
  preview.mjs        fills dist/ with sample data and screenshots it (600px and 375px)
  src/layout.html    shared shell: head, dark-mode + small-screen <style>, header, card, footer
  src/<name>.html    one body per email, with its subject and preheader in a front-matter comment
  dist/<name>.html   finished HTML, styles inlined, ready to send
  dist/<name>.txt    plain-text version
  dist/subjects.json { name: { subject, preheader } }
  dist/supabase-otp.html  the sign-in code for Supabase Auth (Go-template variables)
```

```
node emails/build.mjs              # rebuild dist/
node emails/preview.mjs            # rebuild + screenshots (needs Edge and playwright-core)
node emails/preview.mjs welcome    # one template
node emails/preview.mjs --dark     # also a dark-mode shot at 375px
```

Edit `src/`, never `dist/`. The body files use brand classes (`h1`, `h2`, `p`, `small`, `link`) and a
few components (`<x-button>`, `<x-code>`, `<x-quote>`, `<x-rows>`, `<x-list>`, `<x-listing>`, `<x-box>`,
`<x-divider>`); `build.mjs` expands them into tables and inlines every style. The comment at the top
of `build.mjs` lists what each component takes.

## The templates

Every template also needs `{{site_url}}` (`https://www.havnph.com`, no trailing slash): the header
logo and the footer links (help, privacy, terms) use it.

| Template | When it's sent | Subject | Placeholders (besides `site_url`) |
|---|---|---|---|
| `sign-in-code` | Someone asks for an email code to sign in. In production Supabase sends `supabase-otp.html` instead (see below). | `{{code}}` is your ECStay sign-in code | `code` |
| `welcome` | After a landlord's first sign-in. Lifecycle email: has an unsubscribe link. | Welcome to ECStay, `{{name}}` | `name`, `unsubscribe_url` |
| `listing-submitted` | A landlord sends a listing for review. | We got your listing: `{{listing_name}}` | `name`, `listing_name`, `area`, `price`, `photo_url` |
| `listing-live` | A reviewer approves the listing. | `{{listing_name}}` is now live on ECStay | `name`, `listing_name`, `listing_url` |
| `listing-needs-changes` | A reviewer sends the listing back with a note. | A few changes before `{{listing_name}}` goes live | `name`, `listing_name`, `review_note`, `edit_url` |
| `new-inquiry` | A renter sends an inquiry (to the landlord). | New inquiry for `{{listing_name}}` | `listing_name`, `renter_name`, `renter_mobile`, `move_in`, `message`, `sms_url`, `tel_url` |
| `inquiry-sent` | Right after a renter sends an inquiry (to the renter). | Your message to `{{listing_name}}` was sent | `listing_name`, `renter_mobile`, `move_in`, `message`, `near`, `search_url` |
| `finish-your-listing` | A draft listing has sat untouched for 24 hours. Send once. Lifecycle email: has an unsubscribe link. | Your listing is almost ready | `name`, `steps_done`, `edit_url`, `unsubscribe_url` |

What the values look like:

| Placeholder | Example | Notes |
|---|---|---|
| `name` | Maria | the landlord's first name |
| `listing_name` | Bajada Ladies' Boarding House | |
| `area` | Bajada, near AdDU | |
| `price` | ₱4,500 | lowest monthly price, with the peso sign; the email adds "From" and "/month" |
| `photo_url` | https://.../cover.jpg | shown at 112 x 84. Send a 4:3 crop at 2x (224 x 168): some email apps stretch images instead of cropping them. A Supabase Storage image transform (`?width=224&height=168&resize=cover`) does this. |
| `listing_url` | https://www.havnph.com/rooms/... | the public listing page |
| `edit_url` | https://www.havnph.com/host/listings/.../edit | the landlord's edit page for that listing |
| `review_note` | Please add a photo of the shared CR. | line breaks are kept |
| `renter_name` | Joshua Santos | |
| `renter_mobile` | 0917 555 0142 | as the renter typed it, for display |
| `move_in` | December 2026 | |
| `message` | Hi po! Is there still a bedspace...? | the renter's message; line breaks are kept |
| `sms_url` | sms:+639175550142 | no `?body=`: iPhone and Android disagree on its syntax |
| `tel_url` | tel:+639175550142 | |
| `near` | AdDU | the landmark or area for the button label |
| `search_url` | https://www.havnph.com/rooms?near=addu | search near that place |
| `steps_done` | 4 | how many of the 6 listing steps are done |
| `code` | 482913 | |
| `unsubscribe_url` | https://www.havnph.com/unsubscribe?t=... | one-click link that stops lifecycle emails (welcome tips, reminders). Also send it as the `List-Unsubscribe` header. |

## Sending with Resend

Fill the placeholders in your code, then send `html` and `text` together. HTML-escape the values
for the `.html` file (renter messages and reviewer notes are user text) and use them raw for the
`.txt` file and the subject:

```js
import { readFileSync } from 'node:fs';
import { Resend } from 'resend';

const subjects = JSON.parse(readFileSync('emails/dist/subjects.json', 'utf8'));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fill = (tpl, data, escape) =>
  tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => {
    if (!(k in data)) throw new Error(`missing {{${k}}}`);
    return escape ? esc(data[k]) : String(data[k]);
  });

export async function sendEmail(name, to, data, headers = {}) {
  const html = fill(readFileSync(`emails/dist/${name}.html`, 'utf8'), data, true);
  const text = fill(readFileSync(`emails/dist/${name}.txt`, 'utf8'), data, false);
  const subject = fill(subjects[name].subject, data, false);
  const resend = new Resend(process.env.RESEND_API_KEY);
  return resend.emails.send({ from: 'ECStay <hello@your-verified-domain>', to, subject, html, text, headers });
}

// welcome and finish-your-listing:
// sendEmail('welcome', email, data, { 'List-Unsubscribe': `<${data.unsubscribe_url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
```

The preheader is already inside each HTML file; `subjects.json` lists it too for reference.

## The sign-in code in Supabase

`dist/supabase-otp.html` is the same email as `sign-in-code`, using only Supabase's own variables:
`{{ .Token }}` for the 6-digit code and `{{ .SiteURL }}` for the site.
It uses its own layout (`src/layout-plain.html`, picked by `layout: plain` in the front matter): white page, no card, left-aligned,
480px, the reader's system font, the app icon, the code in a quiet grey box, one link. That is how the large companies send
codes (plain, short, nothing to download), and it survives Gmail's dark mode and blocked images. Keep it that way: no
marketing, no extra links, no tracking.

Its one flourish is the scene on top of the code box: Kapi, the site's 3D capybara, waving in front of the Davao hills
(`assets/brand/kapi-code.gif`, 540 x 285, about 1 MB, a loop rendered from `assets/capy/kapi.glb` over
`assets/scene/davao-golden-2400.webp`). The code itself stays live text under it. With images blocked the email still reads
fine; Outlook on Windows shows the first frame (Kapi standing).

1. Supabase dashboard > **Authentication > Email Templates > Magic Link** (newer dashboards:
   Authentication > Emails > Templates > Magic link).
2. Subject: `{{ .Token }} is your ECStay sign-in code` (the code first, so it can be read from the notification)
3. Body: paste the whole of `dist/supabase-otp.html` (switch the editor to source/HTML first) and save.
   Because the template shows `{{ .Token }}` and no link, `signInWithOtp` users get a code instead
   of a magic link.
4. Paste the same subject and body into **Confirm signup** too. A brand-new address can be sent that
   template for its first code when email confirmation is on.
5. **Authentication > Providers > Email** (or Sign In / Providers > Email): set **Email OTP Expiration**
   to `600` seconds. The email says "expires in 10 minutes"; Supabase's default is 3600 (one hour).
   Keep **Email OTP Length** at `6`.
6. **Authentication > URL Configuration**: Site URL `https://www.havnph.com` with no trailing slash,
   so the footer links come out as `https://www.havnph.com/help`.
7. Supabase's built-in mail sender is only for testing (it sends to your team's addresses and
   is rate-limited). For real users, turn on **custom SMTP** (Authentication > SMTP Settings) with
   Resend's SMTP details from the Resend dashboard, using the same verified domain as the other emails.

After editing `src/sign-in-code.html` or the layout, run `node emails/build.mjs` and paste the new
`supabase-otp.html` again. If Supabase strips HTML comments when it renders the template, the
Outlook-only parts go with them. Everything still reads fine; Outlook on Windows just shows the card wider.

## The logo

The header loads `https://www.havnph.com/assets/brand/ecstay-email-logo.png` (alt text "ECStay",
shown at 132 x 32). The repo now has that file (`assets/brand/ecstay-email-logo.png`, 265 x 64,
transparent: the mark plus the "ECStay" wordmark at 2x). It works in emails once it's deployed to
that URL. If the logo changes shape, change `LOGO_WIDTH` in `build.mjs` so that width / 32 matches it,
and rebuild.

When images are off, the alt text "ECStay" shows in evergreen serif type. `preview.mjs` embeds the
local logo file as a data URL, or draws the site's mark and a serif wordmark if the file is missing,
because the live URL doesn't exist yet. The swap happens only in previews.

## Email-client notes

- Table layout, 600px max, no flexbox or grid; Outlook gets a fixed 600px ghost table and Arial/Georgia
  fonts. Outlook on Windows shows the pill buttons and the card with square corners. That's expected.
- Gmail ignores the Google Fonts link and uses Helvetica/Arial and Georgia instead.
- The `<style>` block holds only the small-screen rules (480px and narrower: tighter padding,
  full-width button) and dark-mode colours for Apple Mail and other clients that support them. In
  dark mode the logo sits on a small ivory backing so an evergreen logo stays readable.
- Buttons are table cells with a background colour and a padded link, so they still show when
  images are off.
