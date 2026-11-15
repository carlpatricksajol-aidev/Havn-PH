/* ECStay — the HTML that search engines and AI crawlers read.
 *
 * The site is one page app: every address used to send the same HTML (one title, a canonical link to the home page
 * and the home page's text), so Google and AI answer engines saw a single page. vercel.json now sends the public
 * addresses here. This function returns index.html with, for that address:
 *   - its own title, description, canonical link, social preview and robots rule,
 *   - structured data (breadcrumbs, the room list, the room, the questions on Help),
 *   - the page's text and links as plain HTML, inside the static block the app hides once it runs.
 * The app then starts as before, so people see no difference.
 *
 * It also serves /sitemap.xml with every real (live) room. Data: assets/js/data.js (places, sample rooms),
 * assets/js/pages.js (About, Help, ...) and the database's public view of live listings.
 * Anything goes wrong: plain index.html, exactly what the site served before. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://www.ecstay.ph';
let BASE = null;

function load() {
  if (BASE) return BASE;
  const win = {};
  const ctx = vm.createContext({ window: win });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'js', 'data.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'js', 'pages.js'), 'utf8'), ctx);
  BASE = {
    html: fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'),
    cfg: win.HAVN_CONFIG, schools: win.HAVN_SCHOOLS, landmarks: win.HAVN_LANDMARKS || [], areas: win.HAVN_AREAS,
    types: win.HAVN_ROOM_TYPES, amen: win.HAVN_AMENITIES, samples: win.HAVN_LISTINGS, pages: win.ECS_PAGES || {},
  };
  return BASE;
}

/* ---------- helpers ---------- */
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH');
const abs = (u) => (/^https?:/.test(u) ? u : SITE + u);
const photo = (id, w) => (/^(https?:|data:)/.test(id) ? id : '/assets/photos/' + id + '-' + (w || 1200) + '.webp');
const plain = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
function km(a, b) {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const walkMin = (d) => Math.max(1, Math.round((d * 1.3) / 4.8 * 60)); // same rule as the app (ui.js)
const nearText = (d) => (walkMin(d) <= 25 ? walkMin(d) + ' min walk' : d.toFixed(1) + ' km');
const who = (g) => (g === 'female' ? 'Female only' : g === 'male' ? 'Male only' : 'Male and female (mixed)');
const typeWord = (t, many) => {
  const w = { Bedspace: 'bedspace', 'Shared room': 'shared room', 'Private room': 'private room', Studio: 'studio' }[t] || 'room';
  return many ? w + 's' : w;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- live listings (the database's public view), cached for two minutes ---------- */
let LIVE = { at: 0, rows: [] };
async function liveListings(cfg) {
  if (Date.now() - LIVE.at < 120000) return LIVE.rows;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(cfg.supabaseUrl + '/rest/v1/listings_public?select=*', {
      headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + cfg.supabaseAnonKey }, signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error('listings ' + r.status);
    LIVE = { at: Date.now(), rows: await r.json() };
  } catch (e) {
    LIVE = { at: Date.now() - 90000, rows: LIVE.rows }; // try again in 30 s
  }
  return LIVE.rows;
}
/* The same shape the app builds in accounts.js (ECS.toSite), with only what the pages below use. */
const BILL = { included: 'included', meter: 'own meter', shared: 'shared, split by tenants' };
const RULE = { allowed: 'Allowed', daytime: 'Daytime only', none: 'Not allowed', yes: 'Allowed', no: 'Not allowed', outside: 'Outside only' };
function toSite(r) {
  const rooms = (r.rooms || []).filter((x) => x.price).sort((a, b) => a.price - b.price);
  const first = rooms[0] || {}, rules = r.rules || {}, bills = r.bills || {};
  const curfew = rules.curfew ? (rules.curfew === '00:00' ? '12:00 AM' : (parseInt(rules.curfew, 10) - 12) + ':00 PM') : '';
  return {
    id: r.id, live: true, name: r.name, type: first.type || 'Private room', rooms, gender: r.gender || 'mixed', area: r.area || '',
    lat: r.lat, lng: r.lng, price: first.price || 0, status: 'available', amenities: r.amenities || [],
    bills: 'Electricity: ' + (BILL[bills.electric] || 'ask the Keeper') + ' · Water: ' + (BILL[bills.water] || 'ask the Keeper'),
    advance: r.advance_months, deposit: r.deposit_months,
    rules: { curfew, visitors: RULE[rules.visitors] || '', cooking: RULE[rules.cooking] || '' },
    desc: r.description || '', host: { name: r.host_name || '' },
    photos: (r.photos || []).map((p) => p && (p.url || p)).filter(Boolean),
    published: r.published_at || r.created_at,
  };
}
async function allListings(B) {
  const have = new Set(B.samples.map((l) => l.id));
  const live = (await liveListings(B.cfg)).map(toSite).filter((l) => !have.has(l.id) && l.photos.length && typeof l.lat === 'number');
  return live.concat(B.samples);
}

/* ---------- places ---------- */
function places(B) { return B.schools.map((s) => Object.assign({ kind: 'school' }, s)).concat(B.landmarks); }
function placeById(B, id) { return places(B).find((p) => p.id === id) || null; }
const KIND = { school: 'CollegeOrUniversity', mall: 'ShoppingCenter', hospital: 'Hospital', work: 'Place' };
function nearest(B, l, n) {
  return places(B).map((p) => ({ p, d: km(l, p) })).sort((a, b) => a.d - b.d).slice(0, n);
}

function placeTitle(p) {
  const nm = p.name.replace(/\s*\([a-z][^)]*\)/g, '');
  const label = nm.includes(p.short) ? nm : p.short + ' (' + nm.replace(/\s*\([^)]*\)/g, '') + ')';
  const pre = p.kind === 'school' ? 'Boarding houses near ' : 'Rooms for rent near ';
  if ((pre + label).length + 13 <= 62 && !/Davao City/.test(label)) return pre + label + ', Davao City';
  if ((pre + label).length <= 62) return pre + label;
  return pre + p.short + ', Davao City';
}

/* ---------- the page pieces ---------- */
function crumbs(list) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: list.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: SITE + c[1] })),
  };
}
const crumbHtml = (list) => '<nav aria-label="Breadcrumb"><ol>' + list.map((c) => '<li><a href="' + esc(c[1]) + '">' + esc(c[0]) + '</a></li>').join('') + '</ol></nav>';
const siteLinks = () => '<nav aria-label="ECStay"><ul>' +
  [['Home', '/'], ['All rooms in Davao City', '/rooms'], ['List your boarding house', '/list'], ['About ECStay', '/about'], ['Help', '/help'], ['Listing standards', '/listing-standards'], ['Contact', '/contact']]
    .map((x) => '<li><a href="' + x[1] + '">' + esc(x[0]) + '</a></li>').join('') + '</ul></nav>';
function placeLinks(B, skip) {
  return '<h2>Rooms near schools, malls, hospitals and offices</h2><ul>' +
    places(B).filter((p) => p.id !== skip).map((p) => '<li><a href="/rooms?near=' + p.id + '">Rooms near ' + esc(p.short) + ' (' + esc(p.name) + ')</a></li>').join('') + '</ul>' +
    '<h2>Rooms by area</h2><ul>' + B.areas.map((a) => '<li><a href="/rooms?area=' + encodeURIComponent(a) + '">Rooms in ' + esc(a) + ', Davao City</a></li>').join('') + '</ul>' +
    '<h2>Rooms by monthly budget</h2><ul>' + [3000, 5000].map((b) => '<li><a href="/rooms?max=' + b + '">Rooms for rent in Davao City under ' + peso(b) + ' a month</a></li>').join('') + '</ul>' +
    '<h2>Rooms by type</h2><ul>' + B.types.map((t) => '<li><a href="/rooms?type=' + encodeURIComponent(t) + '">' + esc(cap(typeWord(t, true))) + ' for rent in Davao City</a></li>').join('') + '</ul>';
}
function card(B, l, place) {
  const near = place ? { p: place, d: km(l, place) } : nearest(B, l, 1)[0];
  return '<li><article><h3><a href="/room/' + esc(l.id) + '">' + esc(l.name) + '</a></h3>' +
    '<p>' + esc(cap(typeWord(l.type))) + ' in ' + esc(l.area) + ', Davao City · ' + esc(who(l.gender)) + ' · ' + esc(peso(l.price)) + ' a month' +
    ' · ' + esc(nearText(near.d)) + ' to ' + esc(near.p.short) + (l.sample ? ' · Sample listing (not for rent)' : '') + '</p></article></li>';
}
function roomList(B, list, place) {
  if (!list.length) return '<p>No rooms are listed here yet. <a href="/rooms">See all rooms in Davao City</a>.</p>';
  const samples = list.filter((l) => l.sample).length;
  return (samples ? '<p>' + (samples === list.length ? 'These rooms are samples' : samples + ' of these rooms are samples') +
      ': examples with stock photos, shown while real boarding houses are added. They are not for rent.</p>' : '') +
    '<ul>' + list.map((l) => card(B, l, place)).join('') + '</ul>';
}
function itemList(list) {
  const real = list.filter((l) => !l.sample);
  if (!real.length) return null;
  return { '@type': 'ItemList', numberOfItems: real.length, itemListElement: real.map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + '/room/' + l.id, name: l.name })) };
}

/* ---------- one function per kind of page ---------- */
async function roomsPage(B, q) {
  const all = await allListings(B);
  const area = q.area && B.areas.includes(q.area) ? q.area : '';
  const place = !area && q.near ? placeById(B, q.near) : null;
  const types = (q.type || '').split(',').filter((t) => B.types.includes(t));
  const type = !place && !area && types.length === 1 ? types[0] : '';
  const budget = !place && !area && !type && !q.min && (q.max === '3000' || q.max === '5000') ? Number(q.max) : 0;
  // Anything else in the address (budget, filters, map box, sort) is a view of one of these pages.
  const personal = q.saved === '1' || !!q.bbox || !!q.q;
  let list, h1, title, desc, url, crumb, about = null, intro;
  if (place) {
    list = all.slice().sort((a, b) => km(a, place) - km(b, place)).filter((l) => km(l, place) <= 6);
    const isSchool = place.kind === 'school';
    h1 = (isSchool ? 'Boarding houses and bedspaces near ' : 'Rooms for rent near ') + place.name + ' (' + place.short + ')';
    title = placeTitle(place);
    desc = 'Boarding houses, bedspaces and rooms for rent near ' + place.name + ' (' + place.short + ') in Davao City, nearest first, with photos, monthly prices, who can stay and the walking time.';
    intro = 'Rooms within about 6 km of ' + place.name + ', nearest first. Walking times are estimates from the map.';
    url = '/rooms?near=' + place.id;
    crumb = [['ECStay', '/'], ['Rooms', '/rooms'], ['Near ' + place.short, url]];
    about = { '@type': KIND[place.kind] || 'Place', name: place.name, alternateName: place.short, geo: { '@type': 'GeoCoordinates', latitude: place.lat, longitude: place.lng },
      address: { '@type': 'PostalAddress', addressLocality: 'Davao City', addressCountry: 'PH' } };
  } else if (area) {
    list = all.filter((l) => l.area === area);
    h1 = 'Boarding houses, bedspaces and rooms for rent in ' + area + ', Davao City';
    title = 'Rooms for rent in ' + area + ', Davao City';
    desc = 'Boarding houses, bedspaces and rooms for rent in ' + area + ', Davao City, with photos, monthly prices, who can stay and the exact spot on the map.';
    intro = 'Rooms in ' + area + ', Davao City.';
    url = '/rooms?area=' + encodeURIComponent(area);
    crumb = [['ECStay', '/'], ['Rooms', '/rooms'], [area, url]];
    about = { '@type': 'Place', name: area + ', Davao City', address: { '@type': 'PostalAddress', addressLocality: 'Davao City', addressCountry: 'PH' } };
  } else if (type) {
    list = all.filter((l) => l.type === type || (l.rooms || []).some((r) => r.type === type));
    h1 = cap(typeWord(type, true)) + ' for rent in Davao City';
    title = type + ' for rent in Davao City';
    desc = cap(typeWord(type, true)) + ' for rent in Davao City near AdDU, UM, USeP, Gmall and SM Lanang, with photos, monthly prices, who can stay and the exact spot on the map.';
    intro = cap(typeWord(type, true)) + ' listed on ECStay, in every part of Davao City.';
    url = '/rooms?type=' + encodeURIComponent(type);
    crumb = [['ECStay', '/'], ['Rooms', '/rooms'], [cap(typeWord(type, true)), url]];
  } else if (budget) {
    list = all.filter((l) => l.price <= budget).sort((a, b) => a.price - b.price);
    h1 = 'Rooms for rent in Davao City for ' + peso(budget) + ' a month or less';
    title = 'Rooms for rent in Davao City under ' + peso(budget) + ' a month';
    desc = 'Cheap boarding houses, bedspaces and rooms for rent in Davao City for ' + peso(budget) + ' (' + budget / 1000 + 'k) a month or less, with photos, who can stay and the exact spot on the map.';
    intro = 'Rooms with a monthly price of ' + peso(budget) + ' or less, cheapest first.';
    url = '/rooms?max=' + budget;
    crumb = [['ECStay', '/'], ['Rooms', '/rooms'], ['Under ' + peso(budget), url]];
  } else {
    list = all;
    h1 = 'Boarding houses, bedspaces and rooms for rent in Davao City';
    title = 'Rooms for rent in Davao City: boarding houses and bedspaces';
    desc = 'Every boarding house, bedspace, shared room and studio for rent on ECStay in Davao City, on a list and a map, with photos, monthly prices and who can stay.';
    intro = 'Every room on ECStay in Davao City. Filter by budget, room type, who can stay and amenities like aircon, own CR and Wi-Fi.';
    url = '/rooms';
    crumb = [['ECStay', '/'], ['Rooms', '/rooms']];
  }
  const items = itemList(list);
  const ld = [crumbs(crumb), Object.assign({ '@type': 'CollectionPage', '@id': SITE + url + '#page', url: SITE + url, name: h1, description: desc, isPartOf: { '@id': SITE + '/#site' } },
    about ? { about } : {}, items ? { mainEntity: items } : {})];
  const body = crumbHtml(crumb) + '<h1>' + esc(h1) + '</h1><p>' + esc(intro) + '</p>' +
    '<p>' + (list.length === 1 ? '1 room' : list.length + ' rooms') + '.</p>' + roomList(B, list, place) + placeLinks(B, place && place.id) + siteLinks();
  return { title, desc, url, robots: personal ? 'noindex, follow' : '', ld, body };
}

async function roomPage(B, id) {
  const all = await allListings(B);
  const l = all.find((x) => x.id === id);
  if (!l) {
    return { status: 404, title: 'Room not found', desc: 'This room is not on ECStay. It may have been removed.', url: '/room/' + id, robots: 'noindex, follow', ld: [],
      body: '<h1>Room not found</h1><p>This room may have been removed. <a href="/rooms">See all rooms in Davao City</a>.</p>' + siteLinks() };
  }
  const near = nearest(B, l, 4);
  const kind = cap(typeWord(l.type));
  const title = l.name + ' · ' + l.type + ' for rent in ' + l.area + ', Davao City';
  const desc = cut(kind + ' in ' + l.area + ', Davao City (' + who(l.gender).toLowerCase() + '), from ' + peso(l.price) + ' a month, ' + nearText(near[0].d) + ' to ' + near[0].p.short + '. ' + plain(l.desc), 158);
  const url = '/room/' + l.id;
  const crumb = [['ECStay', '/'], ['Rooms', '/rooms'], [l.area, '/rooms?area=' + encodeURIComponent(l.area)], [l.name, url]];
  const amen = (l.amenities || []).map((k) => (B.amen[k] ? B.amen[k].label : null)).filter(Boolean);
  const rooms = l.rooms && l.rooms.length ? l.rooms : [{ type: l.type, price: l.price }];
  const r = l.rules || {};
  let body = crumbHtml(crumb) + '<h1>' + esc(l.name) + '</h1>' +
    (l.sample ? '<p><strong>Sample listing:</strong> an example with stock photos, shown while real boarding houses are added. It is not for rent.</p>' : '') +
    '<p>' + esc(kind) + ' in ' + esc(l.area) + ', Davao City · ' + esc(who(l.gender)) + ' · from ' + esc(peso(l.price)) + ' a month</p>' +
    (l.photos[0] ? '<img src="' + esc(photo(l.photos[0], 1200)) + '" alt="' + esc(l.name + ', ' + typeWord(l.type) + ' in ' + l.area + ', Davao City') + '" width="1200" height="900">' : '') +
    (l.desc ? '<h2>About this room</h2><p>' + esc(l.desc) + '</p>' : '') +
    '<h2>Monthly rent</h2><ul>' + rooms.map((x) => '<li>' + esc(cap(typeWord(x.type))) + ': ' + esc(peso(x.price)) + ' a month</li>').join('') + '</ul>' +
    (l.bills ? '<p>Bills: ' + esc(l.bills) + '</p>' : '') +
    (l.advance || l.deposit ? '<p>Move-in: ' + [l.advance ? l.advance + ' month' + (l.advance > 1 ? 's' : '') + ' advance' : '', l.deposit ? l.deposit + ' month' + (l.deposit > 1 ? 's' : '') + ' deposit' : ''].filter(Boolean).join(' and ') + '</p>' : '') +
    '<h2>Who can stay</h2><p>' + esc(who(l.gender)) + '</p>' +
    (amen.length ? '<h2>What\'s included</h2><ul>' + amen.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul>' : '') +
    (r.curfew || r.visitors || r.cooking ? '<h2>House rules</h2><ul>' + (r.curfew ? '<li>Curfew: ' + esc(r.curfew) + '</li>' : '<li>No curfew</li>') +
      (r.visitors ? '<li>Visitors: ' + esc(r.visitors) + '</li>' : '') + (r.cooking ? '<li>Cooking: ' + esc(r.cooking) + '</li>' : '') + '</ul>' : '') +
    '<h2>Where you will live</h2><p>' + esc(l.area) + ', Davao City. Distances from the pin on the map:</p><ul>' +
    near.map((n) => '<li>' + esc(nearText(n.d)) + ' to <a href="/rooms?near=' + n.p.id + '">' + esc(n.p.name) + ' (' + esc(n.p.short) + ')</a></li>').join('') + '</ul>' +
    '<p>To ask about this room, open it on ECStay and tap Contact Keeper. You pay the Keeper directly, after you have seen the room.</p>';
  const similar = all.filter((x) => x.id !== l.id).sort((a, b) => km(a, l) - km(b, l)).slice(0, 4);
  if (similar.length) body += '<h2>Similar rooms nearby</h2><ul>' + similar.map((x) => card(B, x)).join('') + '</ul>';
  body += siteLinks();
  const ld = [crumbs(crumb)];
  if (!l.sample) {
    ld.push({
      '@type': 'Offer', '@id': SITE + url + '#offer', url: SITE + url, price: l.price, priceCurrency: 'PHP',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: l.price, priceCurrency: 'PHP', unitCode: 'MON', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } },
      availability: 'https://schema.org/InStock', businessFunction: 'http://purl.org/goodrelations/v1#LeaseOut',
      itemOffered: {
        '@type': 'Accommodation', name: l.name, description: plain(l.desc) || undefined, image: l.photos.slice(0, 6).map((p) => abs(photo(p, 1200))),
        address: { '@type': 'PostalAddress', addressLocality: l.area + ', Davao City', addressRegion: 'Davao del Sur', addressCountry: 'PH' },
        geo: { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lng },
        amenityFeature: amen.map((a) => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })),
      },
    });
  }
  return {
    title, desc, url, robots: l.sample ? 'noindex, follow' : '', ld, body,
    image: l.photos[0] ? abs(photo(l.photos[0], 1200)) : null, imageAlt: l.name + ' in ' + l.area + ', Davao City',
  };
}

function docPage(B, name) {
  const P = B.pages[name];
  if (!P) return null;
  const url = '/' + name;
  const crumb = [['ECStay', '/'], [P.title, url]];
  const ld = [crumbs(crumb), { '@type': name === 'about' ? 'AboutPage' : name === 'contact' ? 'ContactPage' : 'WebPage', '@id': SITE + url + '#page', url: SITE + url, name: P.title, description: P.description, isPartOf: { '@id': SITE + '/#site' } }];
  // Help is written as questions people open one by one: the same questions and answers, as structured data.
  const qa = [];
  String(P.html).replace(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g, (m, q, a) => { qa.push({ '@type': 'Question', name: plain(q), acceptedAnswer: { '@type': 'Answer', text: plain(a) } }); return m; });
  if (qa.length) ld.push({ '@type': 'FAQPage', '@id': SITE + url + '#faq', mainEntity: qa });
  return { title: P.title, desc: P.description, url, ld, body: crumbHtml(crumb) + '<h1>' + esc(P.title) + '</h1>' + P.html + siteLinks() };
}

function listPage() {
  const url = '/list';
  const crumb = [['ECStay', '/'], ['List your boarding house', url]];
  return {
    title: 'List your boarding house in Davao City', url,
    desc: 'List your boarding house, bedspace or rooms in Davao City on ECStay. Add photos, prices and the exact spot on the map. We review every listing.',
    ld: [crumbs(crumb)],
    body: crumbHtml(crumb) + '<h1>List your boarding house, bedspace or rooms in Davao City</h1>' +
      '<p>ECStay calls the owners and managers who list their places Keepers. Sign in with Google or with a 6-digit code sent to your email, then add your boarding house: its pin on the map, room types and monthly prices, the deposit and advance, who can stay, amenities, house rules and photos.</p>' +
      '<p>We review every listing against our <a href="/listing-standards">listing standards</a> before it goes live. Renters near AdDU, UM, USeP, Gmall, SM Lanang and the rest of Davao City then find it by school, budget and room type, and message you through ECStay.</p>' +
      siteLinks(),
  };
}

/* ---------- putting the page together ---------- */
function setMeta(html, p) {
  const title = /ECStay/.test(p.title) ? p.title : p.title + ' · ECStay';
  const rep = (re, val) => { html = html.replace(re, val); };
  rep(/<title>[\s\S]*?<\/title>/, '<title>' + esc(title) + '</title>');
  rep(/(<meta name="description" content=")[^"]*(")/, '$1' + esc(p.desc) + '$2');
  rep(/(<link rel="canonical" href=")[^"]*(")/, '$1' + esc(SITE + p.url) + '$2' + (p.robots ? '\n  <meta name="robots" content="' + p.robots + '">' : ''));
  rep(/(<meta property="og:title" content=")[^"]*(")/, '$1' + esc(title) + '$2');
  rep(/(<meta property="og:description" content=")[^"]*(")/, '$1' + esc(p.desc) + '$2');
  rep(/(<meta property="og:url" content=")[^"]*(")/, '$1' + esc(SITE + p.url) + '$2');
  rep(/(<meta name="twitter:title" content=")[^"]*(")/, '$1' + esc(title) + '$2');
  rep(/(<meta name="twitter:description" content=")[^"]*(")/, '$1' + esc(p.desc) + '$2');
  if (p.image) {
    rep(/(<meta property="og:image" content=")[^"]*(")/, '$1' + esc(p.image) + '$2');
    rep(/(<meta name="twitter:image" content=")[^"]*(")/, '$1' + esc(p.image) + '$2');
    rep(/\s*<meta property="og:image:width"[^>]*>\s*<meta property="og:image:height"[^>]*>/, '');
    rep(/(<meta property="og:image:alt" content=")[^"]*(")/, '$1' + esc(p.imageAlt || p.title) + '$2');
  }
  if (p.ld && p.ld.length) {
    const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': p.ld }).replace(/</g, '\\u003c');
    html = html.replace('</head>', '  <script type="application/ld+json">' + json + '</script>\n</head>');
  }
  // The readable text: the block between these markers is shown only when JavaScript is off (and to crawlers).
  return html.replace(/<!--static-->[\s\S]*?<!--\/static-->/, '<!--static--><div class="static-home">' + p.body + '</div><!--/static-->');
}

function sitemap(B, all) {
  const day = new Date().toISOString().slice(0, 10);
  const urls = [['/', 'daily', '1.0'], ['/rooms', 'daily', '0.9']]
    .concat(places(B).map((p) => ['/rooms?near=' + p.id, 'daily', '0.8']))
    .concat(B.areas.map((a) => ['/rooms?area=' + encodeURIComponent(a), 'weekly', '0.7']))
    .concat(B.types.map((t) => ['/rooms?type=' + encodeURIComponent(t), 'weekly', '0.7']))
    .concat([['/rooms?max=3000', 'weekly', '0.7'], ['/rooms?max=5000', 'weekly', '0.7']])
    .concat([['/list', 'monthly', '0.6']])
    .concat(['about', 'help', 'listing-standards', 'privacy', 'terms', 'contact'].filter((n) => B.pages[n]).map((n) => ['/' + n, 'monthly', n === 'privacy' || n === 'terms' ? '0.3' : '0.5']));
  const rooms = all.filter((l) => !l.sample).map((l) => ['/room/' + l.id, 'weekly', '0.8', (l.published || '').slice(0, 10)]);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.concat(rooms).map((u) => '  <url>\n    <loc>' + esc(SITE + u[0]) + '</loc>\n    <lastmod>' + (u[3] || day) + '</lastmod>\n    <changefreq>' + u[1] + '</changefreq>\n    <priority>' + u[2] + '</priority>\n  </url>').join('\n') +
    '\n</urlset>\n';
}

module.exports = async function handler(req, res) {
  const q = req.query || {};
  let B;
  try {
    B = load();
    if (q.r === 'sitemap') {
      const xml = sitemap(B, await allListings(B));
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).send(xml);
    }
    let p = null;
    if (q.r === 'rooms') p = await roomsPage(B, q);
    else if (q.r === 'room' && /^[\w-]{1,80}$/.test(q.id || '')) p = await roomPage(B, q.id);
    else if (q.r === 'doc') p = docPage(B, q.d);
    else if (q.r === 'list') p = listPage();
    if (!p) throw new Error('unknown page');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
    return res.status(p.status || 200).send(setMeta(B.html, p));
  } catch (e) {
    console.error('page', q.r, String(e && e.message));
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
      return res.status(200).send((B && B.html) || fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
    } catch (e2) {
      return res.status(500).send('ECStay is having trouble. Please try again in a minute.');
    }
  }
};
