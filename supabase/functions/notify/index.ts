// ECStay — notify: the database calls this (see public.notify in the migration) when something happens that
// someone should hear about. It loads the matching email template from the website (/emails/dist), fills it in
// and sends it with Resend.
//
// Secrets (supabase secrets set ...): RESEND_API_KEY, EMAIL_FROM (e.g. "ECStay <hello@mail.yourdomain.com>"),
// TEAM_EMAIL (where sample-listing inquiries and contact messages go), NOTIFY_SECRET (same value as in Vault),
// SITE_URL (e.g. https://www.havnph.com). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const env = (k: string) => Deno.env.get(k) ?? '';
const SITE = env('SITE_URL').replace(/\/$/, '') || 'https://www.havnph.com';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

type Data = Record<string, string | number | null | undefined>;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fill = (tpl: string, d: Data, html: boolean) => tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => (html ? esc(d[k]) : String(d[k] ?? '')));
const peso = (n: number) => '₱' + Number(n).toLocaleString('en-PH');
const mobile = (m: string) => (/^09\d{9}$/.test(m) ? `${m.slice(0, 4)} ${m.slice(4, 7)} ${m.slice(7)}` : m);
const first = (name?: string | null) => (name || '').trim().split(/\s+/)[0] || 'there';
const priceFrom = (rooms: { price: number }[] = []) => Math.min(...rooms.map((r) => r.price).filter(Boolean));

let subjects: Record<string, { subject: string; preheader: string }> | null = null;
async function template(name: string) {
  if (!subjects) subjects = await (await fetch(`${SITE}/emails/dist/subjects.json`)).json();
  const [html, text] = await Promise.all([fetch(`${SITE}/emails/dist/${name}`), fetch(`${SITE}/emails/dist/${name}.txt`)]);
  if (!html.ok) throw new Error(`template ${name}: ${html.status}`);
  return { html: await html.text(), text: text.ok ? await text.text() : '', subject: subjects![name]?.subject ?? 'ECStay' };
}

async function send(to: string, name: string, data: Data, replyTo?: string) {
  if (!to) return;
  const t = await template(name);
  const d = { site_url: SITE, ...data };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM'), to: [to], subject: fill(t.subject, d, false), html: fill(t.html, d, true), text: fill(t.text, d, false), ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`);
}

async function listingWithOwner(id: string) {
  const { data: l } = await db.from('listings').select('*').eq('id', id).single();
  if (!l) throw new Error('listing not found');
  const { data: p } = await db.from('profiles').select('*').eq('id', l.owner_id).single();
  return { l, p };
}

const STEPS_DONE = (l: any) =>
  [l.name && l.place_type && l.gender && (l.description || '').length >= 40, l.area && l.address && l.lat != null,
   (l.rooms || []).length && l.advance_months != null && l.deposit_months != null, (l.amenities || []).length && l.rules?.visitors,
   (l.photos || []).length >= 5, l.contact_mobile && l.confirmed].filter(Boolean).length;

Deno.serve(async (req) => {
  if (req.method !== 'POST' || req.headers.get('X-Notify-Secret') !== env('NOTIFY_SECRET')) return new Response('no', { status: 401 });
  const { event, data } = await req.json();
  try {
    if (event === 'welcome') {
      const { data: p } = await db.from('profiles').select('*').eq('id', data.profile_id).single();
      if (p?.email) await send(p.email, 'welcome', { name: first(p.full_name), unsubscribe_url: `${SITE}/host/profile` });
    } else if (event === 'listing-review' || event === 'listing-live' || event === 'listing-changes') {
      const { l, p } = await listingWithOwner(data.listing_id);
      const base = { name: first(p?.full_name), listing_name: l.name };
      if (event === 'listing-review') await send(p.email, 'listing-submitted', { ...base, area: l.area, price: peso(priceFrom(l.rooms)), photo_url: l.photos?.[0]?.url ?? '' });
      if (event === 'listing-live') await send(p.email, 'listing-live', { ...base, listing_url: `${SITE}/room/${l.id}` });
      if (event === 'listing-changes') await send(p.email, 'listing-needs-changes', { ...base, review_note: l.review_note ?? '', edit_url: `${SITE}/host/edit/${l.id}` });
      if (event === 'listing-review' && env('TEAM_EMAIL')) await send(env('TEAM_EMAIL'), 'listing-submitted', { ...base, name: 'team', area: l.area, price: peso(priceFrom(l.rooms)), photo_url: l.photos?.[0]?.url ?? '' });
    } else if (event === 'finish-your-listing') {
      const { l, p } = await listingWithOwner(data.listing_id);
      if (p?.marketing_ok) await send(p.email, 'finish-your-listing', { name: first(p.full_name), steps_done: STEPS_DONE(l), edit_url: `${SITE}/host/edit/${l.id}`, unsubscribe_url: `${SITE}/host/profile` });
    } else if (event === 'inquiry') {
      const { data: q } = await db.from('inquiries').select('*').eq('id', data.inquiry_id).single();
      if (!q) throw new Error('inquiry not found');
      let to = env('TEAM_EMAIL'), area = 'Davao';
      if (q.listing_id) { const { l, p } = await listingWithOwner(q.listing_id); to = p?.email || to; area = l.area || area; }
      const d = { listing_name: q.listing_name, renter_name: q.renter_name, renter_mobile: mobile(q.renter_mobile), move_in: q.move_in || 'Not sure yet',
        message: q.message || '', sms_url: `sms:${q.renter_mobile}`, tel_url: `tel:${q.renter_mobile}` };
      await send(to, 'new-inquiry', d, q.renter_email || undefined);
      if (q.renter_email) await send(q.renter_email, 'inquiry-sent', { ...d, near: area, search_url: `${SITE}/rooms` });
    } else if (event === 'contact') {
      const { data: m } = await db.from('contact_messages').select('*').eq('id', data.message_id).single();
      if (m && env('TEAM_EMAIL')) {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: env('EMAIL_FROM'), to: [env('TEAM_EMAIL')], reply_to: m.email, subject: `[ECStay contact: ${m.topic}] ${m.name}`, text: `${m.name} <${m.email}>\nTopic: ${m.topic}\n\n${m.message}` }),
        });
        if (!r.ok) throw new Error(`resend ${r.status}`);
      }
    }
    return new Response('ok');
  } catch (e) {
    console.error(event, e);
    return new Response(String(e), { status: 500 });
  }
});
