/* Site switch (Carl, 24 Nov 2026: "turn off the website, don't make it live for now"; people were asking about
 * the sample rooms). While CLOSED is true, every page shows a short "not open yet" note instead of the site,
 * with status 503 so search engines treat it as a temporary break, not as the site's real content.
 * Email templates (/emails/) and images (/assets/) keep working, so the account emails still send.
 * The owner still sees the real site with a private link (?open=<key>), which sets a cookie on that browser;
 * ?open=0 removes it. Only the key's SHA-256 fingerprint is in this file, never the key.
 * To reopen the site for everyone: set CLOSED to false and push. */
const CLOSED = true;
// SHA-256 fingerprints of the private links: [0] the owner's, [1] the testers' (added 25 Nov; to cut testers off,
// delete that line and push, the owner's link keeps working).
const KEYS = [
  '265f8e19b470e42df124a8f7ee7b65c64136f3ed3a54f77bbfe25f8226396897',
  '0f99980f99e5353b50cc596ad6b35ca7d5b7806c3671e605af904baf813cbf64',
];
const COOKIE = 'ecs-open';

export const config = { matcher: ['/((?!assets/|emails/|robots.txt).*)'] };

const pass = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>ECStay · Not open yet</title>
<link rel="icon" href="/assets/brand/ecstay-icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400..700&family=Newsreader:ital,opsz,wght@0,6..72,400..600&display=swap">
<style>
  :root { --evergreen: #1D3F35; --brass-text: #8A6431; --page: #F9F6F0; --linen: #EFE8DC; --text: #17221D; --ink-2: #3C443F; --line: #E2DACB; }
  * { box-sizing: border-box; margin: 0; }
  html, body { min-height: 100%; }
  body { display: flex; flex-direction: column; min-height: 100vh; min-height: 100dvh; background: var(--page); color: var(--text);
    font: 400 16px/1.55 'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif; -webkit-font-smoothing: antialiased; }
  header { display: flex; align-items: center; gap: 10px; padding: 20px 20px 0; }
  header img { width: 48px; height: auto; }
  header span { font: 800 22px/1 'Hanken Grotesk', system-ui, sans-serif; letter-spacing: -0.02em; color: var(--evergreen); }
  main { flex: 1; display: grid; place-items: center; padding: 28px 16px 40px; }
  .note { width: 100%; max-width: 560px; padding: 32px 24px; border-radius: 28px; background: var(--linen); text-align: center; }
  .kapi { display: block; width: 132px; height: 132px; margin: -8px auto 10px; object-fit: contain; }
  .eyebrow { font: 650 12px/1.3 'Hanken Grotesk', system-ui, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: var(--brass-text); }
  h1, h2 { font-family: 'Newsreader', Georgia, 'Times New Roman', serif; font-weight: 500; letter-spacing: -0.02em; color: var(--text); text-wrap: balance; }
  h1 { margin-top: 10px; font-size: 34px; line-height: 1.1; }
  h2 { font-size: 24px; line-height: 1.15; }
  p.body { margin-top: 12px; font-size: 16.5px; color: var(--ink-2); text-wrap: pretty; }
  .tl { margin-top: 24px; padding-top: 22px; border-top: 1px solid var(--line); }
  .tl p.body { font-size: 15.5px; }
  footer { padding: 0 20px 24px; text-align: center; font-size: 13.5px; color: var(--ink-2); }
  @media (min-width: 640px) {
    header { padding: 28px 40px 0; }
    .note { padding: 44px 48px; }
    h1 { font-size: 44px; }
    h2 { font-size: 28px; }
    .kapi { width: 160px; height: 160px; }
  }
</style>
</head>
<body>
<header><img src="/assets/brand/ecstay-mark.svg" width="66" height="44" alt=""><span>ECStay</span></header>
<main>
  <div class="note">
    <img class="kapi" src="/assets/capy/kapi.webp" width="360" height="360" alt="">
    <p class="eyebrow">Coming soon</p>
    <h1>ECStay is not open yet</h1>
    <p class="body">We are getting ECStay ready for boarding houses and bedspaces in Davao City. The rooms shown here before were samples, not real listings, so they cannot be rented.</p>
    <div class="tl" lang="tl">
      <h2>Hindi pa bukas ang ECStay</h2>
      <p class="body">Inihahanda pa namin ang ECStay para sa mga boarding house at bedspace sa Davao City. Mga sample lang ang mga kwartong nakita rito dati, hindi totoong listing, kaya hindi ito mauupahan.</p>
    </div>
  </div>
</main>
<footer>&copy; 2026 ECStay &middot; Davao City, Philippines</footer>
</body>
</html>`;

export default async function middleware(req) {
  if (!CLOSED) return pass();
  const url = new URL(req.url);
  if (/^\/(assets|emails)\//.test(url.pathname) || url.pathname === '/robots.txt') return pass();

  // The owner's private link: set (or with ?open=0, remove) the cookie, then go to the same page without the key.
  const key = url.searchParams.get('open');
  if (key !== null) {
    url.searchParams.delete('open');
    const ok = key !== '0' && KEYS.includes(await sha256(key));
    const cookie = COOKIE + '=' + (ok ? encodeURIComponent(key) + '; Max-Age=31536000' : '; Max-Age=0') + '; Path=/; Secure; HttpOnly; SameSite=Lax';
    return new Response(null, { status: 302, headers: { Location: url.pathname + url.search, 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
  }
  const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)ecs-open=([^;]+)/);
  if (m) {
    let v = ''; try { v = decodeURIComponent(m[1]); } catch (e) {}
    if (v && KEYS.includes(await sha256(v))) return pass();
  }

  return new Response(PAGE, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '86400', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}
