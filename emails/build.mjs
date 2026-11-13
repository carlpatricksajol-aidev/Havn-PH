// ECStay email build. Plain Node, no dependencies.
//
//   node emails/build.mjs
//
// Reads  emails/src/layout.html and emails/src/<name>.html
// Writes emails/dist/<name>.html, emails/dist/<name>.txt, emails/dist/subjects.json
//        and emails/dist/supabase-otp.html (the sign-in code with Supabase Go-template variables).
//
// A body file starts with a front-matter comment (subject, preheader, reason, marketing) and uses
// plain tags with brand classes (h1, h2, p, small, link, strong) plus a few components:
//   <x-button href="" text="">Label</x-button>   bulletproof pill button (text = plain-text version)
//   <x-code note="">{{code}}</x-code>            big sign-in code on an evergreen plate, with a small line under it
//   <x-quote label="">...</x-quote>              linen box with a thin brass rule (reviewer note, message)
//   <x-rows><x-row label="">value</x-row></x-rows>  label / value lines with hairline dividers
//   <x-list><x-item title="">text</x-item></x-list> numbered list, brass serif numerals
//   <x-listing photo="" name="" area="" price=""></x-listing>  listing summary with thumbnail
//   <x-box>...</x-box>                           plain linen box
//   <x-divider></x-divider>                      hairline linen divider
// Runtime placeholders are Mustache style ({{name}}) and pass through untouched.
// Build-time slots in the layout use [[slot]] so they never clash with them.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

// ---------------------------------------------------------------- brand
export const C = {
  evergreen: '#1D3F35',
  evergreenDark: '#132C25',
  brass: '#B98B4E',
  brassText: '#8A6431',
  page: '#F9F6F0',
  linen: '#EFE8DC',
  line: '#E2D8C7',
  ink: '#17221D',
  ink2: '#3C443F',
  muted: '#666C66',
  foot: '#1C2A21',
  white: '#FFFFFF',
};
const SERIF = "'Newsreader', Georgia, 'Times New Roman', serif";
const SANS = "'Hanken Grotesk', Helvetica, Arial, sans-serif";
// The plain layout (sign-in code) uses the reader's own system font: nothing to download, the same in every mail app.
const SYS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
// Kapi (the site's 3D capybara) waving in front of the Davao hills: a looping GIF rendered from the real model.
export const SCENE_URL = 'https://www.havnph.com/assets/brand/kapi-code.gif';
export const ICON_URL = 'https://www.havnph.com/assets/brand/apple-touch-icon.png';

export const LOGO_URL = 'https://www.havnph.com/assets/brand/ecstay-email-logo.png';
// Display size of the logo. Export the PNG at 2x (264 x 64) with a transparent background.
// If the final file has a different shape, change LOGO_WIDTH so width / 32 matches its aspect ratio.
export const LOGO_WIDTH = 132;
export const LOGO_HEIGHT = 32;

// Class -> inline declarations. Classes stay on the element too, so the <style> block
// (dark mode, small screens) can still target them.
const STYLES = {
  'bg-page': `background-color:${C.page}`,
  'card': `background-color:${C.white};border:1px solid ${C.line};border-radius:16px`,
  'logo': `display:block;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;border:0;outline:none;text-decoration:none;font-family:${SERIF};font-size:26px;line-height:32px;font-weight:600;letter-spacing:-0.5px;color:${C.evergreen}`,
  'h1': `margin:0 0 16px;font-family:${SERIF};font-size:31px;line-height:37px;font-weight:500;letter-spacing:-0.6px;color:${C.ink}`,
  'h2': `margin:10px 0 8px;font-family:${SERIF};font-size:21px;line-height:28px;font-weight:500;letter-spacing:-0.3px;color:${C.ink}`,
  'p': `margin:0 0 18px;font-family:${SANS};font-size:16px;line-height:25px;font-weight:400;color:${C.ink2}`,
  'small': `margin:0 0 14px;font-family:${SANS};font-size:14px;line-height:22px;font-weight:400;color:${C.muted}`,
  'link': `color:${C.evergreen};font-weight:600;text-decoration:underline`,
  'strong': `color:${C.ink};font-weight:600`,
  'nowrap': `white-space:nowrap`,
  'label': `margin:0 0 6px;font-family:${SANS};font-size:13px;line-height:18px;font-weight:600;color:${C.brassText}`,
  'btn-td': `border-radius:999px;background-color:${C.evergreen};mso-padding-alt:15px 32px`,
  'btn-a': `display:inline-block;padding:15px 32px;font-family:${SANS};font-size:16px;line-height:20px;font-weight:600;color:${C.white};text-decoration:none;border-radius:999px;text-align:center`,
  'plate': `padding:30px 16px 24px;background-color:${C.evergreen};border-radius:16px;text-align:center`,
  'code': `margin:0;padding:0 0 0 14px;font-family:${SANS};font-size:44px;line-height:52px;font-weight:600;letter-spacing:14px;color:${C.page};font-variant-numeric:tabular-nums;text-align:center`,
  'code-note': `margin:10px 0 0;font-family:${SANS};font-size:13px;line-height:20px;font-weight:400;letter-spacing:0.2px;color:#C9D8CF;text-align:center`,
  'plain': `color:${C.ink};font-weight:600;text-decoration:none`,
  'h3': `margin:0 0 6px;font-family:${SANS};font-size:15px;line-height:22px;font-weight:600;color:${C.ink}`,
  'sign': `margin:22px 0 14px;font-family:${SERIF};font-size:18px;line-height:26px;font-weight:500;letter-spacing:-0.2px;color:${C.ink}`,
  'quote': `padding:18px 22px 18px 20px;background-color:${C.linen};border-left:3px solid ${C.brass};border-radius:0 12px 12px 0`,
  'quote-text': `margin:0;font-family:${SANS};font-size:16px;line-height:25px;font-weight:400;color:${C.ink};white-space:pre-line`,
  'box': `padding:20px 24px;background-color:${C.linen};border-radius:12px`,
  'box-big': `margin:0 0 4px;font-family:${SERIF};font-size:24px;line-height:30px;font-weight:500;letter-spacing:-0.4px;color:${C.ink}`,
  'box-small': `margin:0;font-family:${SANS};font-size:14px;line-height:21px;color:${C.ink2}`,
  'row-l': `width:112px;padding:13px 16px 13px 0;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:14px;line-height:21px;color:${C.muted};vertical-align:top`,
  'row-v': `padding:13px 0;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:15px;line-height:21px;font-weight:600;color:${C.ink};vertical-align:top`,
  'rows': `border-top:1px solid ${C.line}`,
  'num': `width:34px;padding:0 0 18px;font-family:${SERIF};font-size:21px;line-height:25px;font-weight:500;color:${C.brassText};vertical-align:top`,
  'item': `padding:0 0 18px;vertical-align:top`,
  'item-t': `margin:0 0 3px;font-family:${SANS};font-size:16px;line-height:24px;font-weight:600;color:${C.ink}`,
  'item-p': `margin:0;font-family:${SANS};font-size:15px;line-height:23px;font-weight:400;color:${C.ink2}`,
  'line': `height:1px;line-height:1px;font-size:1px;background-color:${C.line}`,
  'listing': `border:1px solid ${C.line};border-radius:12px`,
  'listing-img': `display:block;width:112px;height:84px;border:0;border-radius:8px;object-fit:cover;background-color:${C.linen};font-family:${SANS};font-size:12px;color:${C.muted}`,
  'listing-name': `margin:0 0 4px;font-family:${SERIF};font-size:19px;line-height:24px;font-weight:500;letter-spacing:-0.3px;color:${C.ink}`,
  'listing-meta': `margin:0 0 6px;font-family:${SANS};font-size:14px;line-height:20px;color:${C.muted}`,
  'listing-price': `margin:0;font-family:${SANS};font-size:15px;line-height:21px;font-weight:600;color:${C.ink}`,
  'pl-page': `background-color:${C.white}`,
  'pl-icon': `display:block;width:40px;height:40px;border:0;outline:none;border-radius:10px;font-family:${SYS};font-size:15px;line-height:40px;font-weight:700;color:${C.evergreen}`,
  'pl-h1': `margin:28px 0 10px;font-family:${SYS};font-size:24px;line-height:31px;font-weight:600;letter-spacing:-0.4px;color:${C.ink}`,
  'pl-p': `margin:0 0 22px;font-family:${SYS};font-size:16px;line-height:25px;font-weight:400;color:${C.ink2}`,
  'pl-scene-td': `background-color:#F3D7A6;border-radius:14px 14px 0 0;font-size:0;line-height:0`,
  'pl-scene': `display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;border-radius:14px 14px 0 0;font-family:${SYS};font-size:14px;line-height:22px;color:#5B4A2A`,
  'pl-box-joined': `border-radius:0 0 14px 14px`,
  'pl-box': `padding:22px 12px;background-color:#F3F1EC;border-radius:10px;text-align:center`,
  'pl-code': `margin:0;padding:0 0 0 8px;font-family:${SYS};font-size:34px;line-height:42px;font-weight:700;letter-spacing:8px;color:${C.ink};font-variant-numeric:tabular-nums;text-align:center`,
  'pl-small': `margin:0 0 10px;font-family:${SYS};font-size:14px;line-height:22px;font-weight:400;color:${C.muted}`,
  'pl-line': `height:1px;line-height:1px;font-size:1px;background-color:#E8E5DE`,
  'pl-foot': `margin:0 0 4px;font-family:${SYS};font-size:12px;line-height:19px;font-weight:400;color:#8A8F8A`,
  'pl-foot-link': `color:#8A8F8A;text-decoration:underline`,
  'foot-brand': `margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:20px;font-weight:600;color:${C.foot}`,
  'foot-links': `margin:0 0 12px;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted}`,
  'foot-link': `color:${C.foot};text-decoration:underline`,
  'foot-note': `margin:0 0 6px;font-family:${SANS};font-size:12px;line-height:18px;color:${C.muted}`,
};

// ---------------------------------------------------------------- helpers
const attr = (s, name) => {
  const m = s.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : '';
};

function tidyStyle(s) {
  const map = new Map();
  for (const part of s.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k || !v) continue;
    map.delete(k);
    map.set(k, v); // later declarations win, as in CSS
  }
  return [...map].map(([k, v]) => `${k}:${v}`).join(';');
}

// Turn class="..." into inline style="..." (existing inline styles are kept and win).
export function inlineStyles(html) {
  return html.replace(/<([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*?)?>/g, (m, tag, attrs = '') => {
    const cm = attrs.match(/\sclass="([^"]+)"/);
    if (!cm) return m;
    const decl = cm[1].split(/\s+/).map((c) => STYLES[c]).filter(Boolean).join(';');
    if (!decl) return m;
    let rest = attrs;
    let style = decl;
    const sm = rest.match(/\sstyle="([^"]*)"/);
    if (sm) {
      style = `${decl};${sm[1]}`;
      rest = rest.replace(sm[0], '');
    }
    return `<${tag}${rest} style="${tidyStyle(style)}">`;
  });
}

const spacer = (inner, pad) =>
  `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td style="padding:${pad};">${inner}</td></tr></table>`;

// ---------------------------------------------------------------- components (HTML)
function expandComponents(body) {
  let out = body;

  out = out.replace(/<x-button\b([^>]*)>([\s\S]*?)<\/x-button>/g, (_, a, label) => {
    const href = attr(a, 'href');
    const altHref = attr(a, 'alt-href');
    const btn =
      `<table role="presentation" class="btn-table" border="0" cellspacing="0" cellpadding="0"><tr>` +
      `<td class="btn-td" align="center" bgcolor="${C.evergreen}">` +
      `<a class="btn-a" href="${href}" target="_blank">${label.trim()}</a>` +
      `</td></tr></table>`;
    // optional secondary text link under the button (e.g. "Or call 0917 ...")
    const alt = altHref
      ? `<p class="p alt-link" style="margin:16px 0 0;">${attr(a, 'alt-before')}<a class="link" href="${altHref}" target="_blank">${attr(a, 'alt-label')}</a></p>`
      : '';
    return spacer(btn + alt, '6px 0 26px');
  });

  // the scene sits on top of the code box as one piece: picture with round top corners, box with round bottom corners
  out = out.replace(/<x-code scene>([\s\S]*?)<\/x-code>/g, (_, code) =>
    spacer(
      `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">` +
        `<tr><td class="pl-scene-td" bgcolor="#F3D7A6"><img class="pl-scene" src="${SCENE_URL}" width="480" alt="Kapi, the ECStay capybara, waving hello from the hills of Davao"></td></tr>` +
        `<tr><td class="pl-box pl-box-joined" align="center" bgcolor="#F3F1EC"><p class="pl-code">${code.trim()}</p></td></tr></table>`,
      '0 0 22px',
    ),
  );
  out = out.replace(/<x-code plain>([\s\S]*?)<\/x-code>/g, (_, code) =>
    spacer(
      `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"><tr>` +
        `<td class="pl-box" align="center" bgcolor="#F3F1EC"><p class="pl-code">${code.trim()}</p></td></tr></table>`,
      '0 0 22px',
    ),
  );
  out = out.replace(/<x-code\b([^>]*)>([\s\S]*?)<\/x-code>/g, (_, a, code) =>
    spacer(
      `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"><tr>` +
        `<td class="plate" align="center" bgcolor="${C.evergreen}">` +
        `<p class="code">${code.trim()}</p>` +
        (attr(a, 'note') ? `<p class="code-note">${attr(a, 'note')}</p>` : '') +
        `</td></tr></table>`,
      '8px 0 24px',
    ),
  );

  out = out.replace(/<x-quote\b([^>]*)>([\s\S]*?)<\/x-quote>/g, (_, a, text) => {
    const label = attr(a, 'label');
    return spacer(
      `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"><tr>` +
        `<td class="quote" bgcolor="${C.linen}">` +
        (label ? `<p class="label">${label}</p>` : '') +
        `<p class="quote-text">${text.trim()}</p></td></tr></table>`,
      '2px 0 24px',
    );
  });

  out = out.replace(/<x-box>([\s\S]*?)<\/x-box>/g, (_, inner) =>
    spacer(
      `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"><tr>` +
        `<td class="box" bgcolor="${C.linen}">${inner.trim()}</td></tr></table>`,
      '2px 0 24px',
    ),
  );

  out = out.replace(/<x-rows>([\s\S]*?)<\/x-rows>/g, (_, inner) => {
    const rows = [...inner.matchAll(/<x-row\b([^>]*)>([\s\S]*?)<\/x-row>/g)]
      .map(([, a, v]) => `<tr><td class="row-l">${attr(a, 'label')}</td><td class="row-v">${v.trim()}</td></tr>`)
      .join('');
    return spacer(
      `<table role="presentation" class="rows" width="100%" border="0" cellspacing="0" cellpadding="0">${rows}</table>`,
      '2px 0 22px',
    );
  });

  out = out.replace(/<x-list>([\s\S]*?)<\/x-list>/g, (_, inner) => {
    const items = [...inner.matchAll(/<x-item\b([^>]*)>([\s\S]*?)<\/x-item>/g)]
      .map(
        ([, a, text], i) =>
          `<tr><td class="num" width="34">${i + 1}</td><td class="item">` +
          `<p class="item-t">${attr(a, 'title')}</p><p class="item-p">${text.trim()}</p></td></tr>`,
      )
      .join('');
    return spacer(
      `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">${items}</table>`,
      '4px 0 8px',
    );
  });

  out = out.replace(/<x-listing\b([^>]*)>\s*<\/x-listing>/g, (_, a) => {
    const photo = attr(a, 'photo');
    const name = attr(a, 'name');
    const area = attr(a, 'area');
    const price = attr(a, 'price');
    return spacer(
      `<table role="presentation" class="listing" width="100%" border="0" cellspacing="0" cellpadding="0"><tr>` +
        `<td class="listing-pic" width="112" style="padding:14px 0 14px 14px;vertical-align:top;">` +
        `<img class="listing-img" src="${photo}" width="112" height="84" alt="Photo of ${name}"></td>` +
        `<td class="listing-txt" style="padding:14px 16px;vertical-align:middle;">` +
        `<p class="listing-name">${name}</p>` +
        `<p class="listing-meta">${area}</p>` +
        `<p class="listing-price">From ${price}/month</p></td></tr></table>`,
      '4px 0 26px',
    );
  });

  out = out.replace(/<x-divider>\s*<\/x-divider>/g, () =>
    spacer(
      `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"><tr>` +
        `<td class="line" height="1">&nbsp;</td></tr></table>`,
      '6px 0 24px',
    ),
  );

  // data-text is only for the plain-text version
  out = out.replace(/\sdata-text="[^"]*"/g, '');
  return out;
}

// ---------------------------------------------------------------- plain text
const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&middot;': '·', '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”', '&mdash;': '—', '&ndash;': '–', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&zwnj;': '' };
const decode = (s) => s.replace(/&[a-z]+;|&#\d+;/g, (e) => (e in ENTITIES ? ENTITIES[e] : e));

function inlineText(html) {
  return html
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/p>\s*<p\b[^>]*>/g, '\n')
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g, (_, a, label) => {
      const override = attr(a, 'data-text');
      if (override) return override;
      const href = attr(a, 'href');
      const text = label.replace(/<[^>]+>/g, '').trim();
      return text === href ? href : `${text} (${href})`;
    })
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function toText(body) {
  // links marked "plain" are only there to stop mail apps from re-styling an address: keep their text alone
  let t = body.replace(/<a class="plain"[^>]*>([\s\S]*?)<\/a>/g, '$1');
  const block = (s) => `\n\n${s}\n\n`;
  t = t.replace(/<x-button\b([^>]*)>([\s\S]*?)<\/x-button>/g, (_, a, label) => {
    const main = attr(a, 'text') || `${inlineText(label)}: ${attr(a, 'href')}`;
    const alt = attr(a, 'alt-text');
    return block(alt ? `${main}\n${alt}` : main);
  });
  t = t.replace(/<x-quote\b([^>]*)>([\s\S]*?)<\/x-quote>/g, (_, a, text) => {
    const label = attr(a, 'label');
    return block(`${label ? `${label}:\n` : ''}"${inlineText(text)}"`);
  });
  t = t.replace(/<x-box>([\s\S]*?)<\/x-box>/g, (_, inner) => block(inlineText(inner)));
  t = t.replace(/<x-rows>([\s\S]*?)<\/x-rows>/g, (_, inner) =>
    block([...inner.matchAll(/<x-row\b([^>]*)>([\s\S]*?)<\/x-row>/g)].map(([, a, v]) => `${attr(a, 'label')}: ${inlineText(v)}`).join('\n')),
  );
  t = t.replace(/<x-list>([\s\S]*?)<\/x-list>/g, (_, inner) =>
    block(
      [...inner.matchAll(/<x-item\b([^>]*)>([\s\S]*?)<\/x-item>/g)]
        .map(([, a, text], i) => `${i + 1}. ${attr(a, 'title')}\n   ${inlineText(text)}`)
        .join('\n\n'),
    ),
  );
  t = t.replace(/<x-listing\b([^>]*)>\s*<\/x-listing>/g, (_, a) =>
    block(`${attr(a, 'name')}\n${attr(a, 'area')}\nFrom ${attr(a, 'price')}/month`),
  );
  t = t.replace(/<x-divider>\s*<\/x-divider>/g, '\n\n');
  t = t.replace(/<x-code (?:plain|scene)>([\s\S]*?)<\/x-code>/g, (_, code) => block(`    ${code.trim()}`));
  t = t.replace(/<x-code\b([^>]*)>([\s\S]*?)<\/x-code>/g, (_, a, code) => block(`    ${code.trim()}${attr(a, 'note') ? `\n\n${decode(attr(a, 'note'))}` : ''}`));
  t = t.replace(/<(h1|h2|h3|p)\b[^>]*>([\s\S]*?)<\/\1>/g, (_, tag, inner) => block(inlineText(inner)));
  t = inlineText(t);
  return decode(t).replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------- front matter
function parse(file) {
  const raw = readFileSync(file, 'utf8');
  const m = raw.match(/^\s*<!--([\s\S]*?)-->/);
  if (!m) throw new Error(`${file}: missing front-matter comment`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const k of ['subject', 'preheader', 'reason']) if (!meta[k]) throw new Error(`${file}: front matter needs "${k}"`);
  meta.marketing = /^(yes|true)$/i.test(meta.marketing || '');
  return { meta, body: raw.slice(m[0].length).trim() };
}

// ---------------------------------------------------------------- compose
// Zero-width filler after the preheader keeps clients from pulling body text into the inbox preview.
const PREHEADER_FILLER = '&#847;&zwnj;&nbsp;'.repeat(60);

function footerHtml(meta) {
  const unsub = meta.marketing
    ? `<p class="foot-note">Don’t want tips and reminders from ECStay? <a class="foot-link" href="{{unsubscribe_url}}" target="_blank">Unsubscribe</a>.</p>`
    : '';
  return `<p class="foot-note">${meta.reason}</p>${unsub}`;
}

function footerText(meta) {
  return [
    '--',
    'ECStay · Rooms and bedspaces in Davao City',
    'Help: {{site_url}}/help',
    'Privacy: {{site_url}}/privacy',
    'Terms: {{site_url}}/terms',
    '',
    meta.reason,
    meta.marketing ? 'Don’t want tips and reminders from ECStay? Unsubscribe: {{unsubscribe_url}}' : '',
  ]
    .filter((l, i, a) => !(l === '' && i === a.length - 1))
    .join('\n')
    .trim();
}

function compose(layout, meta, body) {
  const content = expandComponents(body);
  const html = layout
    .replace('[[subject]]', meta.subject)
    .replace('[[preheader]]', meta.preheader)
    .replace('[[preheader_filler]]', PREHEADER_FILLER)
    .replace('[[logo_url]]', LOGO_URL)
    .replace(/\[\[logo_width\]\]/g, String(LOGO_WIDTH))
    .replace(/\[\[logo_height\]\]/g, String(LOGO_HEIGHT))
    .replace(/\[\[width\]\]/g, String(parseInt(meta.width, 10) || 600))
    .replace('[[content]]', content)
    .replace('[[footer]]', footerHtml(meta))
    .replace('[[icon_url]]', ICON_URL)
    .replace('[[reason]]', meta.reason);
  // inline only the <body>; the <head> keeps its <style> as written
  const i = html.indexOf('<body');
  return html.slice(0, i) + inlineStyles(html.slice(i));
}

export const placeholders = (s) => [...new Set([...s.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]))];

// ---------------------------------------------------------------- run
export function build({ quiet = false } = {}) {
  mkdirSync(DIST, { recursive: true });
  const layouts = { card: readFileSync(join(SRC, 'layout.html'), 'utf8'), plain: readFileSync(join(SRC, 'layout-plain.html'), 'utf8') };
  const names = readdirSync(SRC)
    .filter((f) => f.endsWith('.html') && !f.startsWith('layout'))
    .map((f) => f.replace(/\.html$/, ''))
    .sort();

  const subjects = {};
  const report = [];
  for (const name of names) {
    const { meta, body } = parse(join(SRC, `${name}.html`));
    const html = compose(layouts[meta.layout || 'card'], meta, body);
    const plain = meta.layout === 'plain';
    const text = plain
      ? `${toText(body)}\n\n--\nECStay · Rooms and bedspaces in Davao City\n{{site_url}}\n\n${meta.reason}\n`
      : `${toText(body)}\n\n${footerText(meta)}\n`;
    writeFileSync(join(DIST, `${name}.html`), html);
    writeFileSync(join(DIST, `${name}.txt`), text);
    subjects[name] = { subject: meta.subject, preheader: meta.preheader };
    report.push([name, placeholders(meta.subject + meta.preheader + html + text)]);

    if (name === 'sign-in-code') {
      // Supabase Auth variant: Go-template variables only.
      const supa = html
        .replace(/\{\{\s*code\s*\}\}/g, '{{ .Token }}')
        .replace(/\{\{\s*email\s*\}\}/g, '{{ .Email }}')
        .replace(/\{\{\s*site_url\s*\}\}/g, '{{ .SiteURL }}');
      const left = placeholders(supa);
      if (left.length) throw new Error(`supabase-otp.html still has placeholders: ${left.join(', ')}`);
      writeFileSync(join(DIST, 'supabase-otp.html'), supa);
      report.push(['supabase-otp', ['{{ .Token }}', '{{ .Email }}', '{{ .SiteURL }}']]);
    }
  }
  writeFileSync(join(DIST, 'subjects.json'), `${JSON.stringify(subjects, null, 2)}\n`);

  if (!quiet) {
    console.log(`Built ${names.length} templates into ${DIST}`);
    for (const [name, ph] of report) console.log(`  ${name.padEnd(22)} ${ph.join(', ')}`);
  }
  return { names, subjects };
}

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)).toLowerCase() === resolve(process.argv[1]).toLowerCase();
if (isMain) build();
