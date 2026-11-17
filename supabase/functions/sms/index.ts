// ECStay sign-in codes by text. Supabase Auth calls this function (the "Send SMS" hook) each time a person asks
// to sign in with a mobile number; it sends the 6-digit code through Semaphore (semaphore.co), a Philippine
// SMS service. Only Philippine mobile numbers are accepted, so nobody can run up a bill with foreign numbers.
//
// Secrets: SEMAPHORE_API_KEY, SEND_SMS_HOOK_SECRET (the same value as in Authentication > Hooks),
// and optionally SEMAPHORE_SENDER (a sender name Semaphore has approved, for example ECStay).

const env = (k: string) => Deno.env.get(k) ?? '';
const enc = new TextEncoder();
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const reply = (status: number, message?: string) =>
  new Response(JSON.stringify(message ? { error: { http_code: status, message } } : {}), { status, headers: { 'Content-Type': 'application/json' } });

// Standard Webhooks check: the call really comes from this project's Auth, and is recent.
async function fromAuth(req: Request, body: string) {
  const id = req.headers.get('webhook-id') ?? '', ts = req.headers.get('webhook-timestamp') ?? '', sigs = req.headers.get('webhook-signature') ?? '';
  const secret = env('SEND_SMS_HOOK_SECRET').replace(/^v1,/, '').replace(/^whsec_/, '');
  if (!id || !ts || !sigs || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', unb64(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = b64(await crypto.subtle.sign('HMAC', key, enc.encode(`${id}.${ts}.${body}`)));
  return sigs.split(' ').some((s) => {
    const got = s.replace(/^v1,/, '');
    if (got.length !== want.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
    return diff === 0;
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, 'no');
  const body = await req.text();
  if (!(await fromAuth(req, body))) return reply(401, 'not from auth');
  let phone = '', otp = '';
  try { const p = JSON.parse(body); phone = String(p.user?.phone ?? '').replace(/\D/g, ''); otp = String(p.sms?.otp ?? ''); } catch (_) { return reply(400, 'bad request'); }
  if (!/^639\d{9}$/.test(phone)) return reply(400, 'sms_ph_only');
  if (!/^\d{6}$/.test(otp)) return reply(400, 'bad code');
  if (!env('SEMAPHORE_API_KEY')) return reply(500, 'sms_not_set_up');

  const form = new URLSearchParams({
    apikey: env('SEMAPHORE_API_KEY'), number: '0' + phone.slice(2), code: otp,
    message: 'ECStay: Your sign-in code is {otp}. It expires in 10 minutes. Do not share it with anyone.',
  });
  if (env('SEMAPHORE_SENDER')) form.set('sendername', env('SEMAPHORE_SENDER'));
  try {
    const r = await fetch('https://api.semaphore.co/api/v4/otp', { method: 'POST', body: form });
    const out = await r.json().catch(() => null);
    if (r.ok && Array.isArray(out) && out[0]?.message_id) return reply(200);
    console.error('semaphore', r.status, JSON.stringify(out).slice(0, 300));   // never the code or the key
    return reply(502, 'sms_send_failed');
  } catch (e) {
    console.error('semaphore unreachable', String(e));
    return reply(502, 'sms_send_failed');
  }
});
