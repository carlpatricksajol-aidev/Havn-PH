// ECStay email previews: fills every dist template with sample data and screenshots it
// at 600px and 375px wide (Edge via playwright-core).
//
//   node emails/preview.mjs                 build, then screenshot all templates
//   node emails/preview.mjs welcome         only the named template(s)
//   node emails/preview.mjs --dark          also take a dark-mode shot at 375px
//   PREVIEW_DIR=C:\some\folder node emails/preview.mjs
//
// The real logo (https://www.havnph.com/assets/brand/ecstay-email-logo.png) isn't live yet, so ONLY
// here it is swapped for the local repo copy (as a data URL) or, if that's missing, the site's mark
// plus a serif "ECStay" wordmark.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, LOGO_URL } from './build.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const REPO = dirname(ROOT);
const OUT =
  process.env.PREVIEW_DIR ||
  'C:/Users/Predator/AppData/Local/Temp/claude/1f333e1a6ef35520/87c54e1e-8b41-48e6-86cf-f4ed0e688a6a/scratchpad/emails-preview';
const PLAYWRIGHT =
  'C:/Users/Predator/AppData/Local/Temp/claude/1f333e1a6ef35520/87c54e1e-8b41-48e6-86cf-f4ed0e688a6a/scratchpad/tools/node_modules/playwright-core';

const require = createRequire(import.meta.url);
const { chromium } = require(PLAYWRIGHT);

// ---------------------------------------------------------------- sample data
function dataUrl(path, mime) {
  return existsSync(path) ? `data:${mime};base64,${readFileSync(path).toString('base64')}` : '';
}
const SITE = 'https://www.havnph.com';
const sample = {
  site_url: SITE,
  name: 'Maria',
  listing_name: "Bajada Ladies' Boarding House",
  area: 'Bajada, near AdDU',
  price: '₱4,500',
  photo_url: dataUrl(join(REPO, 'assets/photos/r-4a602277-640.webp'), 'image/webp'),
  code: '482913',
  renter_name: 'Joshua Santos',
  renter_mobile: '0917 555 0142',
  move_in: 'December 2026',
  message:
    "Hi po! Is there still a bedspace for December? I'm a 2nd year student at AdDU.\nCan I visit this Saturday afternoon to see the room?",
  review_note: 'Please add a photo of the shared CR.\nThe map pin also looks one street off. Please drag it to your gate.',
  steps_done: '4',
  listing_url: `${SITE}/rooms/bajada-ladies-boarding-house`,
  edit_url: `${SITE}/host/listings/sample/edit`,
  sms_url: 'sms:+639175550142',
  tel_url: 'tel:+639175550142',
  near: 'AdDU',
  search_url: `${SITE}/rooms?near=addu`,
  unsubscribe_url: `${SITE}/unsubscribe?t=sample`,
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fill(html) {
  return html
    .replace(/\{\{\s*\.Token\s*\}\}/g, sample.code)
    .replace(/\{\{\s*\.SiteURL\s*\}\}/g, sample.site_url)
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => {
      if (!(k in sample)) throw new Error(`no sample value for {{${k}}}`);
      return escapeHtml(sample[k]);
    });
}

// Preview-only logo. If the repo already has the email logo file, embed it as a data URL;
// otherwise draw the site's mark (45 x 30, as in the site header) + a serif wordmark.
const LOGO_FILE = dataUrl(join(REPO, 'assets/brand/ecstay-email-logo.png'), 'image/png');
const MARK = dataUrl(join(REPO, 'assets/brand/ecstay-mark.svg'), 'image/svg+xml');
function swapLogo(html) {
  if (LOGO_FILE) return html.split(LOGO_URL).join(LOGO_FILE);
  const re = new RegExp(`<img class="logo"[^>]*src="${LOGO_URL.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"[^>]*>`);
  const word =
    `<span class="logo-word" style="display:inline-block;vertical-align:middle;font-family:'Newsreader', Georgia, serif;` +
    `font-size:25px;line-height:32px;font-weight:600;letter-spacing:-0.6px;color:#1D3F35;">ECStay</span>`;
  const mark = MARK
    ? `<img src="${MARK}" width="45" height="30" alt="" style="display:inline-block;vertical-align:middle;width:45px;height:30px;margin-right:9px;border:0;">`
    : '';
  return html.replace(re, `<span class="logo" style="display:inline-block;white-space:nowrap;">${mark}${word}</span>`);
}

// ---------------------------------------------------------------- run
const args = process.argv.slice(2);
const dark = args.includes('--dark');
const only = args.filter((a) => !a.startsWith('--'));

const { names } = build({ quiet: true });
const all = [...names, 'supabase-otp'].filter((n) => !only.length || only.includes(n));

mkdirSync(join(OUT, 'html'), { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const shots = [];
try {
  for (const name of all) {
    const filled = swapLogo(fill(readFileSync(join(DIST, `${name}.html`), 'utf8')));
    const file = join(OUT, 'html', `${name}.html`);
    writeFileSync(file, filled);
    const runs = [
      [600, 'light'],
      [375, 'light'],
      ...(dark ? [[375, 'dark']] : []),
    ];
    for (const [width, scheme] of runs) {
      const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 1, colorScheme: scheme });
      await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const png = join(OUT, `${name}-${width}${scheme === 'dark' ? '-dark' : ''}.png`);
      await page.screenshot({ path: png, fullPage: true });
      if (name === names[0] && width === 600 && scheme === 'light') {
        const w = await page.evaluate(() => document.querySelector('.logo')?.getBoundingClientRect().width);
        console.log(`logo lockup (mark + wordmark) renders ${Math.round(w)}px wide at 32px high`);
      }
      await page.close();
      shots.push(png);
    }
  }
} finally {
  await browser.close();
}
console.log(shots.join('\n'));
