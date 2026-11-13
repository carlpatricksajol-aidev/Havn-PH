/* ECStay — accounts and data: landlord sign-in (Google or a 6-digit email code), listings and photos,
 * renter inquiries and contact messages.
 *
 * Three modes (ECS.mode):
 *   live  HAVN_CONFIG.supabaseUrl + supabaseAnonKey are set: Supabase does sign-in, data and photos,
 *         and sends the emails (see /supabase/README.md).
 *   demo  open any page with ?demo=1 (kept for this browser tab, ?demo=0 ends it): every screen works,
 *         but everything stays in this browser and nothing is sent. A banner says so; the code is 123456.
 *   off   neither: the site keeps the older listing form and Messenger, and account pages point to it.
 *
 * Every call returns a Promise. Errors are Error objects with a message that can be shown to people.
 */
(function () {
  var C = window.HAVN_CONFIG || {};
  var ECS = (window.ECS = {});
  var DEMO_FLAG = 'ecs-demo', DEMO_DB = 'ecs-demo-db', DEMO_SESSION = 'ecs-demo-session';
  var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
  var BUCKET = 'listing-photos';

  function ss(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; }
  }
  try {
    if (/[?&]demo=1(&|$)/.test(location.search)) ss(DEMO_FLAG, '1');
    if (/[?&]demo=0(&|$)/.test(location.search)) ss(DEMO_FLAG, null);
  } catch (e) { /* storage blocked: demo stays off */ }

  // ?demo=1 always wins, so the whole flow can be shown without touching real accounts.
  ECS.mode = ss(DEMO_FLAG) === '1' ? 'demo' : C.supabaseUrl && C.supabaseAnonKey ? 'live' : 'off';
  ECS.google_on = ECS.mode === 'demo' || !!C.googleSignIn;
  ECS.enabled = function () { return ECS.mode !== 'off'; };
  ECS.DEMO_CODE = '123456';

  function fail(msg) { return Promise.reject(new Error(msg)); }
  function uid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  function now() { return new Date().toISOString(); }

  /* ---------- Shared helpers ---------- */
  // A Philippine mobile as 09XXXXXXXXX, or '' when it isn't one.
  ECS.mobile = function (v) {
    var d = String(v || '').replace(/[^\d]/g, '');
    if (/^639\d{9}$/.test(d)) d = '0' + d.slice(2);
    if (/^9\d{9}$/.test(d)) d = '0' + d;
    return /^09\d{9}$/.test(d) ? d : '';
  };
  ECS.showMobile = function (d) { return /^09\d{9}$/.test(d) ? d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7) : d || ''; };
  ECS.email = function (v) { v = String(v || '').trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v) ? v : ''; };

  // Listing steps and what each needs; the editor and the dashboard both use this.
  ECS.STEPS = [
    { id: 'place', label: 'Your place', done: function (l) { return !!(l.name && l.name.trim().length >= 4 && l.place_type && l.gender && (l.description || '').trim().length >= 40); } },
    { id: 'location', label: 'Location', done: function (l) { return !!(l.area && l.address && typeof l.lat === 'number' && typeof l.lng === 'number'); } },
    { id: 'rooms', label: 'Rooms and prices', done: function (l) { var r = l.rooms || []; return r.length > 0 && r.every(function (x) { return x.type && x.price >= 500 && x.count >= 1; }) && l.advance_months != null && l.deposit_months != null; } },
    { id: 'amenities', label: 'Amenities and rules', done: function (l) { return (l.amenities || []).length >= 1 && !!(l.rules && l.rules.visitors); } },
    { id: 'photos', label: 'Photos', done: function (l) { return (l.photos || []).length >= 5; } },
    { id: 'contact', label: 'Contact and review', done: function (l) { return !!(ECS.mobile(l.contact_mobile) && l.confirmed); } },
  ];
  ECS.stepsDone = function (l) { return ECS.STEPS.filter(function (s) { return s.done(l); }).length; };
  ECS.ready = function (l) { return ECS.stepsDone(l) === ECS.STEPS.length; };
  // The Free plan: a Keeper answers this many new renters a month; a paid plan has no limit.
  ECS.FREE_REPLIES = 5;
  ECS.LIMIT_MSG = 'You have answered 5 new renters this month. A paid plan lets you answer every renter.';
  function manilaDay(d) { return new Date((d ? new Date(d) : new Date()).getTime() + 8 * 36e5).toISOString().slice(0, 10); }
  ECS.planOn = function (l) { return !!(l && l.plan && l.plan_until && l.plan_until >= manilaDay()); };
  // The day the Free count starts again, e.g. "December 1".
  ECS.quotaResets = function () { var p = manilaDay().split('-'); return new Date(+p[0], +p[1], 1).toLocaleDateString('en-PH', { month: 'long', day: 'numeric' }); };
  ECS.priceFrom = function (l) { var p = (l.rooms || []).map(function (r) { return r.price; }).filter(Boolean); return p.length ? Math.min.apply(null, p) : 0; };

  // Photos: shrink before upload (max 1600 px on the long side, JPEG), so phones on data upload quickly.
  ECS.shrink = function (file, max, quality) {
    max = max || 1600; quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) { reject(new Error(t('Please choose a photo (JPG, PNG or HEIC saved as JPG).'))); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) { blob ? resolve({ blob: blob, w: w, h: h }) : reject(new Error(t('That photo could not be read. Try another one.'))); }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error(t('That photo could not be read. Try another one.'))); };
      img.src = url;
    });
  };

  /* ================= Demo backend: this browser only ================= */
  var demo = (function () {
    function db() { var d = H.store.get(DEMO_DB, null); return d && d.v === 1 ? d : { v: 1, users: {}, profiles: {}, listings: {}, inquiries: [], contacts: [], outbox: [] }; }
    function save(d) { try { localStorage.setItem(DEMO_DB, JSON.stringify(d)); } catch (e) { throw new Error(t('This browser is out of space for the demo. Remove a few photos and try again.')); } }
    function me() { var s = H.store.get(DEMO_SESSION, null); var d = db(); return s && d.users[s] ? d.users[s] : null; }
    function mail(d, to, template, data) { d.outbox.unshift({ id: uid(), to: to, template: template, data: data, at: now() }); }
    var listeners = [];
    function emit() { var u = me(); listeners.forEach(function (f) { f(u ? { user: u } : null); }); }
    function signIn(email, name, avatar) {
      var d = db(), u = null;
      Object.keys(d.users).forEach(function (k) { if (d.users[k].email === email) u = d.users[k]; });
      var isNew = !u;
      if (!u) {
        u = { id: uid(), email: email, name: name || '', avatar: avatar || '' };
        d.users[u.id] = u;
        d.profiles[u.id] = { id: u.id, email: email, full_name: name || '', mobile: '', contact_pref: 'either', marketing_ok: true, role: 'host', created_at: now() };
        mail(d, email, 'welcome', { name: name || email.split('@')[0] });
      }
      save(d); H.store.set(DEMO_SESSION, u.id); emit();
      return { user: u, isNew: isNew };
    }
    function mine(d, id) { var u = me(), l = d.listings[id]; if (!u || !l || l.owner_id !== u.id) throw new Error(t('That listing was not found.')); return l; }
    // Free plan in the demo: the same rules the database applies on the real service.
    function ownIds(d, u) { return Object.keys(d.listings).filter(function (k) { return d.listings[k].owner_id === u.id; }); }
    function answered(d, q) { return (d.messages || []).some(function (m) { return m.inquiry_id === q.id && m.sender_role === 'keeper'; }); }
    function used(d, u) {
      var ids = ownIds(d, u), month = manilaDay().slice(0, 7), first = {};
      (d.messages || []).forEach(function (m) {
        if (m.sender_role !== 'keeper' || m.sender_id !== u.id) return;
        if (!first[m.inquiry_id] || m.created_at < first[m.inquiry_id]) first[m.inquiry_id] = m.created_at;
      });
      return d.inquiries.filter(function (q) { return ids.indexOf(q.listing_id) >= 0 && first[q.id] && manilaDay(first[q.id]).slice(0, 7) === month; }).length;
    }
    function asKeeper(d, u, q) {
      if (q.example) return Object.assign({}, q, { paid: false, answered: true, locked: false });
      var a = answered(d, q);
      return Object.assign({}, q, { paid: false, answered: a, locked: !a && used(d, u) >= ECS.FREE_REPLIES }, a ? {} : { renter_mobile: null, renter_email: null });
    }
    var CONTENT = ['name', 'place_type', 'gender', 'description', 'area', 'address', 'lat', 'lng', 'rooms', 'advance_months', 'deposit_months', 'bills', 'available_from', 'amenities', 'rules', 'photos', 'contact_mobile'];
    return {
      session: function () { var u = me(); return Promise.resolve(u ? { user: u } : null); },
      onChange: function (f) { listeners.push(f); },
      google: function () {
        // Simulated: a Google account chooser would appear here.
        return Promise.resolve(signIn('maria.santos.demo@gmail.com', 'Maria Santos', ''));
      },
      sendCode: function (email) { return Promise.resolve({ sent: true, demo: true }); },
      verifyCode: function (email, code) {
        if (String(code).replace(/\D/g, '') !== ECS.DEMO_CODE) return fail(t('That code is not right. Check the email and try again.'));
        return Promise.resolve(signIn(email, ''));
      },
      signOut: function () { H.store.set(DEMO_SESSION, null); emit(); return Promise.resolve(); },
      profile: function () { var u = me(); return u ? Promise.resolve(db().profiles[u.id]) : fail(t('Please sign in first.')); },
      saveProfile: function (p) {
        var u = me(); if (!u) return fail(t('Please sign in first.'));
        var d = db(), cur = d.profiles[u.id];
        ['full_name', 'mobile', 'contact_pref', 'marketing_ok'].forEach(function (k) { if (k in p) cur[k] = p[k]; });
        if (p.full_name) d.users[u.id].name = p.full_name;
        save(d); return Promise.resolve(cur);
      },
      myListings: function () {
        var u = me(); if (!u) return fail(t('Please sign in first.'));
        var d = db();
        return Promise.resolve(Object.keys(d.listings).map(function (k) { return d.listings[k]; })
          .filter(function (l) { return l.owner_id === u.id; })
          .sort(function (a, b) { return a.updated_at < b.updated_at ? 1 : -1; }));
      },
      listing: function (id) { try { return Promise.resolve(mine(db(), id)); } catch (e) { return Promise.reject(e); } },
      saveListing: function (l) {
        var u = me(); if (!u) return fail(t('Please sign in first.'));
        var d = db(), cur = l.id ? d.listings[l.id] : null;
        if (cur && cur.owner_id !== u.id) return fail(t('That listing was not found.'));
        if (!cur) { cur = { id: uid(), owner_id: u.id, status: 'draft', created_at: now() }; d.listings[cur.id] = cur; }
        var changed = false;
        CONTENT.concat(['confirmed']).forEach(function (k) { if (k in l && JSON.stringify(cur[k]) !== JSON.stringify(l[k])) { cur[k] = l[k]; if (k !== 'confirmed') changed = true; } });
        // Edits to a listing that is live (or paused) go back to review, as on the real service.
        if (changed && (cur.status === 'live' || cur.status === 'paused')) { cur.status = 'review'; cur.submitted_at = now(); mail(d, u.email, 'listing-submitted', { listing_name: cur.name }); }
        cur.updated_at = now();
        save(d); return Promise.resolve(cur);
      },
      submitListing: function (id) {
        var d = db(), l;
        try { l = mine(d, id); } catch (e) { return Promise.reject(e); }
        if (!ECS.ready(l)) return fail(t('A few steps still need your details.'));
        l.status = 'review'; l.submitted_at = l.updated_at = now();
        mail(d, me().email, 'listing-submitted', { listing_name: l.name });
        save(d);
        // Demo only: approve after a short wait so the whole journey can be seen.
        setTimeout(function () {
          var d2 = db(), x = d2.listings[id];
          if (x && x.status === 'review') { x.status = 'live'; x.published_at = now(); mail(d2, me() ? me().email : '', 'listing-live', { listing_name: x.name }); save(d2); document.dispatchEvent(new CustomEvent('ecs:changed')); }
        }, 20000);
        return Promise.resolve(l);
      },
      setPaused: function (id, paused) {
        var d = db(), l;
        try { l = mine(d, id); } catch (e) { return Promise.reject(e); }
        if (paused && l.status === 'live') l.status = 'paused';
        else if (!paused && l.status === 'paused') l.status = 'live';
        else return fail(t('Only live listings can be paused.'));
        l.updated_at = now(); save(d); return Promise.resolve(l);
      },
      deleteListing: function (id) {
        var d = db(), l;
        try { l = mine(d, id); } catch (e) { return Promise.reject(e); }
        if (l.status !== 'draft') return fail(t('Only drafts can be deleted. Pause a live listing instead.'));
        delete d.listings[id]; save(d); return Promise.resolve();
      },
      uploadPhoto: function (listingId, file) {
        return ECS.shrink(file, 900, 0.72).then(function (r) {
          return new Promise(function (resolve) {
            var fr = new FileReader();
            fr.onload = function () { resolve({ path: 'demo/' + uid(), url: fr.result, w: r.w, h: r.h }); };
            fr.readAsDataURL(r.blob);
          });
        });
      },
      removePhoto: function () { return Promise.resolve(); },
      inquiries: function () {
        var u = me(); if (!u) return fail(t('Please sign in first.'));
        var d = db(), ids = Object.keys(d.listings).filter(function (k) { return d.listings[k].owner_id === u.id; });
        return Promise.resolve(d.inquiries.filter(function (q) { return ids.indexOf(q.listing_id) >= 0; }).map(function (q) { return asKeeper(d, u, q); }));
      },
      replyQuota: function () { var u = me(); return u ? Promise.resolve({ limit: ECS.FREE_REPLIES, used: used(db(), u) }) : fail(t('Please sign in first.')); },
      listingContact: function () { return Promise.resolve(null); },
      sendInquiry: function (q) {
        var d = db();
        q = Object.assign({ id: uid(), created_at: now(), renter_id: me() ? me().id : null }, q);
        d.inquiries.unshift(q);
        mail(d, 'landlord', 'new-inquiry', q);
        if (q.renter_email) mail(d, q.renter_email, 'inquiry-sent', q);
        save(d); return Promise.resolve(q);
      },
      sendContact: function (m) { var d = db(); d.contacts.unshift(Object.assign({ id: uid(), created_at: now() }, m)); save(d); return Promise.resolve(); },
      outbox: function () { return Promise.resolve(db().outbox); },
      myInquiries: function () { var u = me(), d = db(); return Promise.resolve(u ? d.inquiries.filter(function (q) { return q.renter_id === u.id && !q.example; }) : []); },
      // Demo inbox: the person's own conversations, plus two examples (one as Keeper, one as renter) the first time.
      threads: function () {
        var u = me(); if (!u) return fail(t('Please sign in first.'));
        var d = db(); d.messages = d.messages || [];
        if (!d.seeded || !d.seeded[u.id]) {
          var ago = function (h) { return new Date(Date.now() - h * 36e5).toISOString(); };
          var a = uid(), b = uid();
          d.inquiries.push({ id: a, example: true, photo: 'r-a7ecbd80', as_keeper: u.id, listing_ref: 'example', listing_name: "Bajada Ladies' Boarding House (example)", renter_name: 'Maria Santos', renter_mobile: '09171234567', move_in: 'January', message: "Hi! Is the bedspace still available? I'm a nursing student at SPC starting in January.", created_at: ago(27) });
          [['keeper', 'Hi Maria! Yes, one bed is left in the 4-person room. It is \u20b12,800 a month with water and WiFi included.', 26], ['renter', 'Is there a curfew? And can I see the room this Saturday?', 25.5], ['keeper', 'Curfew is 10 PM. Saturday at 2 PM works. I will meet you at the gate.', 24], ['renter', 'Great, see you Saturday. Thank you!', 3]].forEach(function (m) {
            d.messages.push({ id: uid(), inquiry_id: a, sender_role: m[0], body: m[1], created_at: ago(m[2]) });
          });
          d.inquiries.push({ id: b, example: true, photo: 'u-6a9f6d5f', renter_id: u.id, listing_ref: 'example', listing_name: 'Matina Student Rooms (example)', listing_id: 'example', renter_name: u.name || 'You', renter_mobile: '09170000000', move_in: 'December', message: 'Hi! Is the private room still available? I work near SM Ecoland.', created_at: ago(50) });
          [['keeper', 'Hello! Yes, it is free from December 1. \u20b15,500 a month, own CR, you pay your own electric meter.', 49], ['renter', 'How much do I need to move in?', 48], ['keeper', 'One month advance and one month deposit, so \u20b111,000. You can visit any day after 5 PM.', 47]].forEach(function (m) {
            d.messages.push({ id: uid(), inquiry_id: b, sender_role: m[0], body: m[1], created_at: ago(m[2]) });
          });
          // One example reaction from the other side, so the demo shows how they look.
          d.reactions = d.reactions || [];
          var mineMsg = d.messages.filter(function (m) { return m.inquiry_id === a && m.sender_role === 'keeper'; }).pop();
          if (mineMsg) d.reactions.push({ inquiry_id: a, target: mineMsg.id, user_id: 'example-renter', emoji: '👍' });
          d.seeded = d.seeded || {}; d.seeded[u.id] = 1; save(d);
        }
        var mine = Object.keys(d.listings).map(function (k) { return d.listings[k]; }).filter(function (l) { return l.owner_id === u.id; });
        var ids = mine.map(function (l) { return l.id; });
        var inqs = d.inquiries.filter(function (q) { return q.renter_id === u.id || q.as_keeper === u.id || ids.indexOf(q.listing_id) >= 0; });
        var roleOf = function (q, own) { return q.as_keeper === u.id || (own && q.renter_id !== u.id) ? 'keeper' : 'renter'; };
        inqs = inqs.map(function (q) { return roleOf(q, ids.indexOf(q.listing_id) >= 0) === 'keeper' ? asKeeper(d, u, q) : q; });
        var out = ECS.buildThreads(inqs, mine, d.messages, u.id, roleOf, d.reactions || []);
        out.quota = { limit: ECS.FREE_REPLIES, used: used(d, u) };
        return Promise.resolve(out);
      },
      sendReply: function (inquiryId, role, body) {
        var u = me(); if (!u) return fail(t('Please sign in first.'));
        var d = db(); d.messages = d.messages || [];
        var q = d.inquiries.filter(function (x) { return x.id === inquiryId; })[0];
        if (role === 'keeper' && q && !q.example && !answered(d, q) && used(d, u) >= ECS.FREE_REPLIES) return fail(t(ECS.LIMIT_MSG));
        var m = { id: uid(), inquiry_id: inquiryId, sender_id: u.id, sender_role: role, body: String(body).slice(0, 2000), created_at: now() };
        d.messages.push(m); save(d); return Promise.resolve(m);
      },
      // One reaction per person per message; no emoji = take it away.
      react: function (inquiryId, target, emoji) {
        var u = me(); if (!u) return fail(t('Please sign in first.'));
        var d = db(); d.reactions = (d.reactions || []).filter(function (r) { return !(r.inquiry_id === inquiryId && r.target === target && r.user_id === u.id); });
        if (emoji) d.reactions.push({ inquiry_id: inquiryId, target: target, user_id: u.id, emoji: emoji });
        save(d); return Promise.resolve();
      },
      countListing: function () { return Promise.resolve(); },
      // Demo: example numbers for the listings that are live (the same every time for the same listing).
      keeperStats: function () {
        var u = me(); if (!u) return fail(t('Please sign in first.'));
        var d = db(), out = [];
        ownIds(d, u).forEach(function (id) {
          if (d.listings[id].status !== 'live') return;
          var seed = 7; for (var i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 9973;
          for (var k = 29; k >= 0; k--) {
            seed = (seed * 137 + 71) % 9973;
            out.push({ listing_id: id, day: manilaDay(Date.now() - k * 864e5), views: 2 + seed % 8 + (k < 8 ? 3 : 0), saves: seed % 4 === 0 ? 1 : 0 });
          }
        });
        return Promise.resolve(out);
      },
      adminData: function () { return fail(t('The admin workspace works with real accounts only.')); },
      setLead: function () { return fail(t('The admin workspace works with real accounts only.')); },
      setContact: function () { return fail(t('The admin workspace works with real accounts only.')); },
      liveListings: function () { var d = db(); return Promise.resolve(Object.keys(d.listings).map(function (k) { return d.listings[k]; }).filter(function (l) { return l.status === 'live'; })); },
      // Demo: anyone may play the reviewer, so the whole journey can be tried.
      reviewQueue: function () {
        var d = db();
        return Promise.resolve(Object.keys(d.listings).map(function (k) { return d.listings[k]; }).filter(function (l) { return l.status === 'review'; })
          .map(function (l) { var p = d.profiles[l.owner_id] || {}; l.owner = { full_name: p.full_name, email: p.email, mobile: p.mobile }; return l; }));
      },
      setPlan: function () { return fail(t('The admin workspace works with real accounts only.')); },
      review: function (id, status, note) {
        var d = db(), l = d.listings[id];
        if (!l) return fail(t('That listing was not found.'));
        l.status = status; l.review_note = note || null; l.updated_at = now();
        if (status === 'live') l.published_at = now();
        var owner = d.profiles[l.owner_id] || {};
        mail(d, owner.email || '', status === 'live' ? 'listing-live' : 'listing-needs-changes', { listing_name: l.name, review_note: note || '' });
        save(d); return Promise.resolve(l);
      },
    };
  })();

  /* ================= Live backend: Supabase ================= */
  var live = (function () {
    var clientP = null, listeners = [];
    function client() {
      if (!clientP) {
        clientP = import(SUPABASE_JS).then(function (m) {
          var c = m.createClient(C.supabaseUrl, C.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
          c.auth.onAuthStateChange(function (ev, session) { listeners.forEach(function (f) { f(session ? { user: shape(session.user) } : null); }); });
          return c;
        });
      }
      return clientP;
    }
    function shape(u) {
      var m = u.user_metadata || {};
      return { id: u.id, email: u.email, name: m.full_name || m.name || '', avatar: m.avatar_url || m.picture || '' };
    }
    function check(r) { if (r.error) throw new Error(friendly(r.error)); return r.data; }
    function friendly(e) {
      var m = String(e && e.message || e || '');
      if (/reply_limit/.test(m)) return t(ECS.LIMIT_MSG);
      if (/rate limit|too many/i.test(m)) return t('Too many tries. Please wait a minute and try again.');
      if (/expired|invalid.*(otp|token)|token.*(expired|invalid)/i.test(m)) return t('That code is not right or has expired. Ask for a new one.');
      if (/network|fetch/i.test(m)) return t('No connection. Check your internet and try again.');
      return t('Something went wrong. Please try again.');
    }
    function uidNow() { return client().then(function (c) { return c.auth.getUser(); }).then(function (r) { if (!r.data || !r.data.user) throw new Error(t('Please sign in first.')); return r.data.user.id; }); }
    return {
      session: function () { return client().then(function (c) { return c.auth.getSession(); }).then(function (r) { var s = r.data && r.data.session; return s ? { user: shape(s.user) } : null; }); },
      onChange: function (f) { listeners.push(f); client(); },
      google: function (next) {
        return client().then(function (c) {
          return c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: C.siteUrl + '/signin?next=' + encodeURIComponent(next || '/host') } });
        }).then(check);
      },
      sendCode: function (email) {
        return client().then(function (c) { return c.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } }); }).then(check).then(function () { return { sent: true }; });
      },
      verifyCode: function (email, code) {
        return client().then(function (c) { return c.auth.verifyOtp({ email: email, token: String(code).replace(/\D/g, ''), type: 'email' }); })
          .then(check).then(function (d) { return { user: shape(d.user) }; });
      },
      signOut: function () { return client().then(function (c) { return c.auth.signOut(); }); },
      profile: function () {
        return Promise.all([client(), uidNow()]).then(function (a) { return a[0].from('profiles').select('*').eq('id', a[1]).single(); }).then(check);
      },
      saveProfile: function (p) {
        var row = {}; ['full_name', 'mobile', 'contact_pref', 'marketing_ok'].forEach(function (k) { if (k in p) row[k] = p[k]; });
        return Promise.all([client(), uidNow()]).then(function (a) { return a[0].from('profiles').update(row).eq('id', a[1]).select().single(); }).then(check);
      },
      myListings: function () {
        return Promise.all([client(), uidNow()]).then(function (a) { return a[0].from('listings').select('*').eq('owner_id', a[1]).order('updated_at', { ascending: false }); }).then(check);
      },
      listing: function (id) { return client().then(function (c) { return c.from('listings').select('*').eq('id', id).single(); }).then(check); },
      saveListing: function (l) {
        var row = {};
        ['name', 'place_type', 'gender', 'description', 'area', 'address', 'lat', 'lng', 'rooms', 'advance_months', 'deposit_months', 'bills', 'available_from', 'amenities', 'rules', 'photos', 'contact_mobile', 'confirmed']
          .forEach(function (k) { if (k in l) row[k] = l[k]; });
        return Promise.all([client(), uidNow()]).then(function (a) {
          var c = a[0];
          if (l.id) return c.from('listings').update(row).eq('id', l.id).select().single();
          row.owner_id = a[1];
          return c.from('listings').insert(row).select().single();
        }).then(check);
      },
      submitListing: function (id) {
        return client().then(function (c) { return c.from('listings').update({ status: 'review' }).eq('id', id).select().single(); }).then(check);
      },
      setPaused: function (id, paused) {
        return client().then(function (c) { return c.from('listings').update({ status: paused ? 'paused' : 'live' }).eq('id', id).select().single(); }).then(check);
      },
      deleteListing: function (id) {
        return client().then(function (c) { return c.from('listings').delete().eq('id', id).eq('status', 'draft'); }).then(check);
      },
      uploadPhoto: function (listingId, file) {
        return Promise.all([client(), uidNow(), ECS.shrink(file)]).then(function (a) {
          var c = a[0], path = a[1] + '/' + listingId + '/' + uid() + '.jpg';
          return c.storage.from(BUCKET).upload(path, a[2].blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false }).then(check).then(function () {
            return { path: path, url: c.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, w: a[2].w, h: a[2].h };
          });
        });
      },
      removePhoto: function (path) { return client().then(function (c) { return c.storage.from(BUCKET).remove([path]); }).then(check); },
      inquiries: function () {
        return client().then(function (c) { return c.rpc('keeper_inquiries'); }).then(check).then(function (rows) { return (rows || []).slice(0, 50); });
      },
      replyQuota: function () { return client().then(function (c) { return c.rpc('keeper_quota'); }).then(check); },
      // Call and Text on a paid listing: the Keeper's number, for signed-in people only.
      listingContact: function (id) { return client().then(function (c) { return c.rpc('listing_contact', { lid: id }); }).then(check); },
      sendInquiry: function (q) {
        return client().then(function (c) { return c.from('inquiries').insert(q); }).then(check).then(function () { return q; });
      },
      sendContact: function (m) { return client().then(function (c) { return c.from('contact_messages').insert(m); }).then(check); },
      outbox: function () { return Promise.resolve([]); },
      // What the signed-in person sent to Keepers.
      myInquiries: function () {
        return Promise.all([client(), uidNow()]).then(function (a) { return a[0].from('inquiries').select('*').eq('renter_id', a[1]).order('created_at', { ascending: false }).limit(50); }).then(check);
      },
      // The inbox. Row-level security decides what comes back: conversations the person started, ones about
      // their own listings, and (admins) the rest.
      threads: function () {
        return Promise.all([client(), uidNow()]).then(function (a) {
          var c = a[0];
          return Promise.all([
            c.from('inquiries').select('*').order('created_at', { ascending: false }).limit(200).then(check),
            c.from('listings').select('id,name,area,photos,rooms,owner_id').limit(500).then(check),
            c.from('inquiry_messages').select('*').order('created_at', { ascending: true }).limit(3000).then(check),
            // About the person's own listings: the database leaves the renter's number out until they answer.
            c.rpc('keeper_inquiries').then(check).catch(function () { return []; }),
            c.rpc('keeper_quota').then(check).catch(function () { return null; }),
            c.from('message_reactions').select('inquiry_id,target,user_id,emoji').limit(5000).then(check).catch(function () { return []; }),
          ]).then(function (r) {
            var have = {}; r[0].forEach(function (q) { have[q.id] = true; });
            var out = ECS.buildThreads(r[0].concat((r[3] || []).filter(function (q) { return !have[q.id]; })), r[1], r[2], a[1], null, r[5]);
            out.quota = r[4];
            return out;
          });
        });
      },
      sendReply: function (inquiryId, role, body) {
        return client().then(function (c) { return c.from('inquiry_messages').insert({ inquiry_id: inquiryId, sender_role: role, body: String(body).slice(0, 2000) }).select().single(); }).then(check);
      },
      // One reaction per person per message; no emoji = take it away. The database checks the person is in the conversation.
      react: function (inquiryId, target, emoji) {
        return Promise.all([client(), uidNow()]).then(function (a) {
          var c = a[0];
          if (!emoji) return c.from('message_reactions').delete().eq('inquiry_id', inquiryId).eq('target', target).eq('user_id', a[1]);
          return c.from('message_reactions').upsert({ inquiry_id: inquiryId, target: target, user_id: a[1], emoji: emoji }, { onConflict: 'inquiry_id,target,user_id' });
        }).then(check);
      },
      // One more view or save of a live listing (the database skips the Keeper's own visits and the team's).
      countListing: function (id, kind) { return client().then(function (c) { return c.rpc('count_listing', { lid: id, kind: kind }); }).then(function () {}, function () {}); },
      // Views and saves per day, last 30 days, for the signed-in Keeper's listings.
      keeperStats: function () { return client().then(function (c) { return c.rpc('keeper_stats'); }).then(check).then(function (r) { return r || []; }); },
      // Admins: everything, for the admin workspace (row-level security returns nothing to anyone else).
      adminData: function () {
        return client().then(function (c) {
          return Promise.all([
            c.from('inquiries').select('*').order('created_at', { ascending: false }).limit(500).then(check),
            c.from('listings').select('*').order('updated_at', { ascending: false }).limit(500).then(check),
            c.from('profiles').select('*').order('created_at', { ascending: false }).limit(1000).then(check),
            c.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(300).then(check),
          ]);
        }).then(function (r) { return { inquiries: r[0], listings: r[1], profiles: r[2], contacts: r[3] }; });
      },
      setLead: function (id, patch) {
        var row = { updated_at: new Date().toISOString() }; ['status', 'admin_note'].forEach(function (k) { if (k in patch) row[k] = patch[k]; });
        return client().then(function (c) { return c.from('inquiries').update(row).eq('id', id).select().single(); }).then(check);
      },
      setContact: function (id, patch) {
        return client().then(function (c) { return c.from('contact_messages').update({ status: patch.status }).eq('id', id).select().single(); }).then(check);
      },
      liveListings: function () { return client().then(function (c) { return c.from('listings_public').select('*'); }).then(check); },
      reviewQueue: function () {
        return client().then(function (c) {
          return c.from('listings').select('*').eq('status', 'review').order('submitted_at', { ascending: true }).then(check).then(function (ls) {
            var ids = ls.map(function (l) { return l.owner_id; });
            return (ids.length ? c.from('profiles').select('id,full_name,email,mobile').in('id', ids).then(check) : Promise.resolve([])).then(function (ps) {
              var by = {}; ps.forEach(function (p) { by[p.id] = p; });
              return ls.map(function (l) { l.owner = by[l.owner_id] || {}; return l; });
            });
          });
        });
      },
      // A Keeper's paid plan and the day its term ends. The database lets only an admin change these.
      setPlan: function (id, plan, until) {
        return client().then(function (c) { return c.from('listings').update({ plan: plan || null, plan_until: plan ? until : null }).eq('id', id).select().single(); }).then(check);
      },
      review: function (id, status, note) {
        return client().then(function (c) { return c.from('listings').update({ status: status, review_note: note || null }).eq('id', id).select().single(); }).then(check);
      },
    };
  })();

  var off = {
    session: function () { return Promise.resolve(null); },
    onChange: function () {},
  };
  /* Conversations for the inbox: each inquiry with its replies, which side the reader is on, and the room it is
   * about. `waiting` = the last word was the other side's, so it is the reader's turn. */
  ECS.REACTIONS = ['❤️', '😆', '😮', '😢', '😠', '👍'];
  ECS.buildThreads = function (inqs, listings, msgs, me, roleOf, reacts) {
    var L = {}; (listings || []).forEach(function (l) { L[l.id] = l; });
    var R = {}; (reacts || []).forEach(function (r) { var k = r.inquiry_id + '|' + r.target; (R[k] = R[k] || []).push({ emoji: r.emoji, user: r.user_id }); });
    var M = {}; (msgs || []).forEach(function (m) { (M[m.inquiry_id] = M[m.inquiry_id] || []).push(m); });
    return (inqs || []).map(function (q) {
      var own = L[q.listing_id], site = window.H && H.byId ? H.byId(q.listing_ref) : null;
      var role = roleOf ? roleOf(q, own) : q.renter_id === me ? 'renter' : own && own.owner_id === me ? 'keeper' : 'team';
      var cover = own && own.photos && own.photos[0];
      var room = site ? { name: site.name, photo: site.photos && site.photos[0], price: site.price, area: site.area, url: '/room/' + q.listing_ref } :
        own ? { name: q.listing_name || own.name || t('Untitled listing'), photo: cover && (cover.url || cover), price: ECS.priceFrom(own), area: own.area, url: role === 'keeper' ? '/host/edit/' + own.id : null } :
        { name: q.listing_name || t('A room'), photo: q.photo || null, price: 0, area: '', url: null };
      var list = [{ id: q.id + '-0', inquiry_id: q.id, sender_role: 'renter', body: q.message || '', created_at: q.created_at }]
        .concat((M[q.id] || []).slice().sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); }));
      // Reactions sit on each message; the renter's opening message is the target 'first'.
      list = list.map(function (m, i) { return Object.assign({}, m, { target: i === 0 ? 'first' : m.id, reacts: R[q.id + '|' + (i === 0 ? 'first' : m.id)] || [] }); });
      var rsig = list.map(function (m) { return m.reacts.map(function (r) { return r.user + r.emoji; }).join(','); }).join('|');
      return { q: q, role: role, room: room, msgs: list, waiting: list[list.length - 1].sender_role !== role, rsig: rsig };
    }).sort(function (a, b) { return new Date(b.msgs[b.msgs.length - 1].created_at) - new Date(a.msgs[a.msgs.length - 1].created_at); });
  };

  var impl = ECS.mode === 'live' ? live : ECS.mode === 'demo' ? demo : off;
  Object.keys(demo).forEach(function (k) {
    ECS[k] = function () { return impl[k] ? impl[k].apply(null, arguments) : fail(t('Accounts are not switched on yet.')); };
  });

  /* A listing from the service, in the shape the rooms list, map and room page use. The street address and the
   * contact number are never part of it; renters reach the landlord through the inquiry form. */
  var BILL_TXT = { included: 'included', meter: 'own meter', shared: 'shared, split by tenants' };
  var RULE_TXT = { allowed: 'Allowed', daytime: 'Daytime only', none: 'Not allowed', yes: 'Allowed', no: 'Not allowed', outside: 'Outside only' };
  ECS.toSite = function (r) {
    var rooms = (r.rooms || []).filter(function (x) { return x.price; }).sort(function (a, b) { return a.price - b.price; });
    var first = rooms[0] || {}, rules = r.rules || {}, bills = r.bills || {};
    var curfew = rules.curfew ? (rules.curfew === '00:00' ? '12:00 AM' : (parseInt(rules.curfew, 10) - 12) + ':00 PM') : '';
    return {
      id: r.id, dbId: r.id, live: true, plan: r.plan || null, name: r.name, type: first.type || 'Private room', rooms: rooms, gender: r.gender || 'mixed',
      area: r.area || '', street: '', lat: r.lat, lng: r.lng, price: first.price || 0,
      status: 'available', slots: rooms.reduce(function (n, x) { return n + (x.count || 0); }, 0), size: null,
      bath: (r.amenities || []).indexOf('own-cr') >= 0 ? 'own' : 'shared',
      bills: 'Electricity: ' + (BILL_TXT[bills.electric] || 'ask the landlord') + ' · Water: ' + (BILL_TXT[bills.water] || 'ask the landlord'),
      amenities: r.amenities || [], advance: r.advance_months, deposit: r.deposit_months,
      rules: { curfew: curfew, visitors: RULE_TXT[rules.visitors] || '', cooking: RULE_TXT[rules.cooking] || '' },
      desc: r.description || '', host: { name: r.host_name || 'ECStay landlord', since: new Date(r.created_at || Date.now()).getFullYear() },
      photos: (r.photos || []).map(function (p) { return p.url; }).filter(Boolean),
    };
  };
  // A renter opened or saved a real listing: counted for its Keeper, once a day per browser.
  ECS.count = function (l, kind) {
    if (ECS.mode !== 'live' || !l || !l.live || !l.dbId) return;
    var day = manilaDay(), m = H.store.get('ecs-counted', null);
    if (!m || m.day !== day) m = { day: day, ids: {} };
    var k = kind + ':' + l.dbId; if (m.ids[k]) return;
    m.ids[k] = 1; H.store.set('ecs-counted', m);
    ECS.countListing(l.dbId, kind);
  };
  // Live listings join the samples on the rooms list and map.
  if (ECS.mode !== 'off') {
    ECS.listingsReady = ECS.liveListings().then(function (rows) {
      var have = {}; HAVN_LISTINGS.forEach(function (l) { have[l.id] = true; });
      rows.map(ECS.toSite).filter(function (l) { return !have[l.id] && l.photos.length && typeof l.lat === 'number'; }).forEach(function (l) { HAVN_LISTINGS.unshift(l); });
      document.dispatchEvent(new CustomEvent('havn:listings'));
    }).catch(function () {});
  } else ECS.listingsReady = Promise.resolve();

  // The signed-in person, kept current for the header.
  ECS.user = null;
  ECS.onChange(function (s) { ECS.user = s && s.user; if (!ECS.user) H.store.set('ecs-keeper', false); document.dispatchEvent(new CustomEvent('ecs:auth')); });
  function withRole() {
    if (!ECS.user || ECS.mode !== 'live') return;
    ECS.profile().then(function (p) { if (ECS.user && p) { ECS.user.role = p.role; document.dispatchEvent(new CustomEvent('ecs:auth')); } }).catch(function () {});
  }
  ECS.session().then(function (s) { ECS.user = s && s.user; document.dispatchEvent(new CustomEvent('ecs:auth')); withRole(); }).catch(function () {});
  ECS.onChange(function () { setTimeout(withRole, 0); });
})();
