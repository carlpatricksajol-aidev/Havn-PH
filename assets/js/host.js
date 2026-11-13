/* ECStay — landlord side and the forms that need an account service:
 *   /list            for landlords: what ECStay does for them, how it works, what they need
 *   /signin          Google, or a 6-digit code sent by email (a new email creates the account)
 *   /host            dashboard: their listings and status, inquiries, (demo) the emails that would be sent
 *   /host/new        the listing editor, six steps, saved as they type
 *   /host/edit/:id
 *   /host/profile    name, mobile, how renters reach them, email updates, sign out
 *   HostView.inquire(listing)   the renter's "Contact landlord" form (room page)
 *   HostView.contactForm(el)    the form on /contact
 * Data goes through accounts.js (window.ECS). When accounts are off, these screens point to the older
 * listing form, so nothing here pretends to work.
 */
(function () {
  var HV = (window.HostView = {});
  var editor = null; // the open editor (map + timers), cleaned up when leaving

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return H.esc(s); }
  function go(href) { App.go(href); }
  function nextParam() { var n = new URLSearchParams(location.search).get('next') || '/'; return /^\/(?!\/)/.test(n) && !/^\/signin/.test(n) ? n : '/'; }
  function err(el, msg) { el.textContent = msg || ''; el.hidden = !msg; }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span><span>' + esc(label || t('Please wait')) + '</span>'; }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }
  function chip(type, name, value, label, checked) {
    return '<label class="chip chip-in"><input type="' + type + '" name="' + name + '" value="' + esc(value) + '"' + (checked ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  }
  function photoUrl(p) { return p && (p.url || p); }
  function monthsAhead(n) {
    var out = [], d = new Date(); d.setDate(1);
    for (var i = 0; i < n; i++) {
      out.push({ v: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), l: i === 0 ? t('Now') : d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) });
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }
  var GOOGLE_G = '<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  HV.leave = function () { if (editor) { editor.destroy(); editor = null; } };

  /* ---------- Demo notice ---------- */
  HV.demoBar = function () {
    if (ECS.mode !== 'demo') return '';
    return '<div class="demo-bar" role="note">' + H.icon('info') + '<span>' + esc(t('Demo mode: nothing you enter here is saved online or sent. The sign-in code is {code}.', { code: ECS.DEMO_CODE })) +
      '</span><a href="?demo=0" data-demo-exit>' + esc(t('Leave demo')) + '</a></div>';
  };
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-demo-exit]')) { e.preventDefault(); try { sessionStorage.removeItem('ecs-demo'); } catch (x) {} location.href = location.pathname; }
  });

  /* Pages that need an account: off → the older form; signed out → sign in, then come back. */
  function needUser(host, fn) {
    if (!ECS.enabled()) { go('/list'); return; }
    host.innerHTML = HV.demoBar() + '<div class="host-wrap"><div class="host-loading"><span class="spin"></span></div></div>';
    ECS.session().then(function (s) {
      if (!s) { go('/signin?next=' + encodeURIComponent(location.pathname + location.search)); return; }
      fn(s.user);
    }).catch(function () { host.innerHTML = '<div class="host-wrap"><p class="host-error">' + esc(t('Something went wrong. Please try again.')) + '</p></div>'; });
  }

  /* A real room photo with an optional overlay (the painted house belongs to the home page only). */
  var MAX_PHOTOS = 10;   // per listing; the database holds the same limit
  var LIST_PHOTO ='/assets/photos/u-bab0e564-2000.webp';
  function photoPanel(cls, src, overlay) {
    return '<div class="ph-panel ' + cls + '"><img src="' + src + '" alt="" width="2000" height="1500" decoding="async">' + (overlay || '') + '</div>';
  }
  // What their listing will look like to renters (a preview of the product, not a real listing).
  function listingPreview() {
    return '<div class="ph-card" aria-hidden="true"><span class="ph-card-k">' + esc(t('Your listing')) + '</span>' +
      '<b>' + esc(t('Your boarding house')) + '</b>' +
      '<span class="ph-card-near">' + H.icon('walk') + esc(t('{n} min walk to {school}', { n: 5, school: 'AdDU' })) + '</span>' +
      '<span class="ph-card-row"><strong>' + H.peso(4500) + '</strong> ' + esc(t('/ month')) + '<em><i></i>' + esc(t('Available now')) + '</em></span></div>';
  }

  /* ================= /list: for landlords ================= */
  HV.landing = function (host) {
    var start = ECS.enabled()
      ? '<a class="btn btn-primary btn-lg" href="/signin?next=/host/new" data-link data-start>' + '<span>' + esc(t('List my place for free')) + '</span>' + H.icon('arrow-right') + '</a>'
      : '<button type="button" class="btn btn-primary btn-lg" data-ll-open>' + '<span>' + esc(t('List my place for free')) + '</span>' + H.icon('arrow-right') + '</button>';
    var step = function (n, title, text) { return '<li><span class="lp-n">' + n + '</span><div><h3>' + esc(t(title)) + '</h3><p>' + esc(t(text)) + '</p></div></li>'; };
    host.innerHTML = HV.demoBar() +
      '<div class="lp">' +
        '<section class="lp-hero">' +
          '<div class="lp-copy">' +
            '<p class="lp-kicker">' + esc(t('Become a Keeper')) + '</p>' +
            '<h1>' + esc(t('List your boarding house on ECStay')) + '</h1>' +
            '<p class="lp-lead">' + esc(t('Open your door to students and young workers looking for a room near their school or work. We review every listing before it goes live.')) + '</p>' +
            '<div class="lp-ctas">' + start + '</div>' +
            '<p class="lp-fine">' + esc(t('Free to list. No card needed. About 10 minutes.')) + '</p>' +
          '</div>' +
          photoPanel('lp-photo', LIST_PHOTO, listingPreview()) +
        '</section>' +
        '<ol class="lp-steps">' +
          step(1, 'Create your account', 'Google, or a 6-digit code by email.') +
          step(2, 'Add your place', 'Photos, prices and the exact spot on the map.') +
          step(3, 'We review it, renters reach you', 'Messages come to your email and dashboard.') +
        '</ol>' +
      '</div>';
    var s = $('[data-start]', host);
    if (s) ECS.session().then(function (x) { if (x) s.setAttribute('href', '/host/plans?start=1'); });
  };

  /* Backdrop for the sign-in steps: tilted rows of real room photos, all drifting slowly the same way (bottom left to upper right) behind a soft
   * ivory veil (still when "reduce motion" is on). Decorative only. */
  var BG_PHOTOS = ['r-76fbd04a', 'r-a7ecbd80', 'u-6a9f6d5f', 's-56af3e05', 'r-e2c8eb45', 'u-0d45ed16', 'r-739c2161', 'r-4a0f0f98', 'u-72a75649',
    'r-8f9ec210', 'r-d48d41fc', 's-002abe42', 'r-e9bd5b70', 'u-0eb0c9a3', 'r-69add83d', 'r-62de96e3', 'r-c3f664ea', 'u-bab0e564'];
  function authBg() {
    var rows = [], n = BG_PHOTOS.length;
    for (var k = 0; k < 9; k++) {
      var set = [];
      for (var j = 0; j < 6; j++) set.push(BG_PHOTOS[(k * 2 + j) % n]);
      rows.push('<div class="auth-row"><div class="auth-strip">' + set.concat(set).map(function (id) {
        return '<img src="/assets/photos/' + id + '-640.webp" alt="" loading="lazy">';
      }).join('') + '</div></div>');
    }
    return '<div class="auth-bg" aria-hidden="true"><div class="auth-tilt">' + rows.join('') + '</div></div>';
  }

  /* ================= /signin ================= */
  HV.signin = function (host) {
    if (!ECS.enabled()) { go('/list'); return; }
    var next = nextParam(), email = '', timer = 0;
    host.innerHTML = HV.demoBar() +
      '<div class="auth">' + authBg() +
        '<a href="/" class="auth-logo" data-link data-home aria-label="ECStay, home"><img src="/assets/brand/ecstay-mark.svg" width="54" height="36" alt=""><span class="logo-word">ECStay</span></a>' +
        '<div class="auth-card" aria-live="polite"></div>' +
      '</div>';
    var card = $('.auth-card', host);
    var legal = '<p class="auth-legal">' + t('By continuing, you agree to the {terms} and the {privacy}.', {
      terms: '<a href="/terms" data-link>' + esc(t('Terms of Use')) + '</a>', privacy: '<a href="/privacy" data-link>' + esc(t('Privacy Notice')) + '</a>' }) + '</p>';
    function done() {
      clearInterval(timer);
      // First sign-in: ask for the details renters need, then carry on.
      ECS.profile().then(function (p) {
        var nx = next === '/host/new' ? '/host/plans?start=1' : next;
        go(!p || !p.full_name || !p.mobile ? '/host/profile?welcome=1&next=' + encodeURIComponent(nx) : nx);
      }).catch(function () { go(next); });
    }

    function stepEmail() {
      clearInterval(timer);
      card.innerHTML =
        '<h1>' + esc(t('Log in or sign up')) + '</h1>' +
        (ECS.google_on ? '<button type="button" class="btn btn-google btn-block" data-google>' + GOOGLE_G + '<span>' + esc(t('Continue with Google')) + '</span></button>' +
        '<div class="auth-or"><span>' + esc(t('or')) + '</span></div>' : '') +
        '<form class="auth-form" novalidate>' +
          '<label class="field"><span class="vh">' + esc(t('Email address')) + '</span><input type="email" name="email" autocomplete="email" inputmode="email" placeholder="' + esc(t('Email address')) + '" value="' + esc(email) + '" required></label>' +
          '<p class="field-err" role="alert" hidden></p>' +
          '<button type="submit" class="btn btn-primary btn-block">' + esc(t('Continue with email')) + '</button>' +
        '</form>' + legal;
      var f = $('form', card), e = $('.field-err', card), input = $('input', f);
      if ($('[data-google]', card)) $('[data-google]', card).addEventListener('click', function () {
        var b = this; busy(b, true, t('Opening Google'));
        ECS.google(next).then(function (r) { if (r && r.user) done(r); }).catch(function (x) { busy(b, false); err(e, x.message); });
      });
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = ECS.email(input.value);
        if (!v) { input.setAttribute('aria-invalid', 'true'); err(e, t('Please enter a valid email address.')); input.focus(); return; }
        input.removeAttribute('aria-invalid'); err(e, '');
        var b = $('button[type=submit]', f); busy(b, true, t('Sending'));
        ECS.sendCode(v).then(function () { email = v; stepCode(); }).catch(function (x) { busy(b, false); err(e, x.message); });
      });
      if (window.innerWidth >= 1024) input.focus({ preventScroll: true });
    }

    function stepCode() {
      card.innerHTML =
        '<button type="button" class="auth-back" data-back-email>' + H.icon('arrow-left') + '<span>' + esc(t('Use a different email')) + '</span></button>' +
        '<h1>' + esc(t('Check your email')) + '</h1>' +
        '<p class="auth-sub">' + t('We sent a 6-digit code to {email}. It expires in 10 minutes.', { email: '<b>' + esc(email) + '</b>' }) + '</p>' +
        (ECS.mode === 'demo' ? '<p class="auth-demo">' + esc(t('Demo mode: the code is {code}.', { code: ECS.DEMO_CODE })) + '</p>' : '') +
        '<form class="auth-form" novalidate>' +
          '<fieldset class="otp"><legend class="vh">' + esc(t('6-digit code')) + '</legend>' +
            [0, 1, 2, 3, 4, 5].map(function (i) { return '<input type="text" inputmode="numeric" pattern="[0-9]*" aria-label="' + esc(t('Digit {n}', { n: i + 1 })) + '"' + (i === 0 ? ' autocomplete="one-time-code"' : ' autocomplete="off"') + '>'; }).join('') +
          '</fieldset>' +
          '<p class="field-err" role="alert" hidden></p>' +
          '<button type="submit" class="btn btn-primary btn-block">' + esc(t('Continue')) + '</button>' +
        '</form>' +
        '<p class="auth-resend"><button type="button" class="btn-link" data-resend disabled></button></p>';
      var boxes = $$('.otp input', card), f = $('form', card), e = $('.field-err', card), rs = $('[data-resend]', card);
      var left = 30;
      function tick() { rs.disabled = left > 0; rs.textContent = left > 0 ? t('Send a new code in {n}s', { n: left }) : t('Send a new code'); left--; if (left < -1) clearInterval(timer); }
      clearInterval(timer); timer = setInterval(tick, 1000); tick();
      function code() { return boxes.map(function (b) { return b.value; }).join(''); }
      function fill(s, from) { s = s.replace(/\D/g, ''); for (var i = 0; i < s.length && from + i < 6; i++) boxes[from + i].value = s[i]; var nx = Math.min(5, from + s.length); boxes[nx].focus(); if (code().length === 6) f.requestSubmit(); }
      boxes.forEach(function (b, i) {
        b.addEventListener('input', function () { var v = b.value.replace(/\D/g, ''); if (v.length > 1) { b.value = ''; fill(v, i); return; } b.value = v; if (v && i < 5) boxes[i + 1].focus(); if (code().length === 6) f.requestSubmit(); });
        b.addEventListener('keydown', function (ev) { if (ev.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ''; } });
        b.addEventListener('paste', function (ev) { ev.preventDefault(); fill((ev.clipboardData || window.clipboardData).getData('text'), i); });
      });
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (code().length !== 6) { err(e, t('Enter all 6 digits.')); return; }
        var b = $('button[type=submit]', f); busy(b, true, t('Checking'));
        ECS.verifyCode(email, code()).then(done).catch(function (x) { busy(b, false); err(e, x.message); boxes.forEach(function (bx) { bx.value = ''; }); boxes[0].focus(); });
      });
      rs.addEventListener('click', function () {
        rs.disabled = true;
        ECS.sendCode(email).then(function () { left = 30; clearInterval(timer); timer = setInterval(tick, 1000); tick(); H.toast(t('New code sent.')); }).catch(function (x) { err(e, x.message); rs.disabled = false; });
      });
      $('[data-back-email]', card).addEventListener('click', stepEmail);
      boxes[0].focus();
    }

    ECS.session().then(function (s) { if (s) done(s); else stepEmail(); }).catch(stepEmail);
  };

  /* ================= /host: the Keeper's home =================
   * One page to run a place on ECStay: what needs the Keeper now, every listing with its numbers (views and saves
   * in the last 30 days, renters who wrote), the renters' messages, and the plan. Four tabs, kept in the address
   * (/host?tab=listings). People with no listing (renters) get a short account page instead. */
  var STATUS = {
    draft: { label: 'Draft', cls: 'st-draft' },
    review: { label: 'In review', cls: 'st-review', note: 'We\'re checking your listing and will email you when it\'s live.' },
    changes: { label: 'Needs changes', cls: 'st-changes' },
    live: { label: 'Live', cls: 'st-live', note: 'Renters can find it now.' },
    paused: { label: 'Paused', cls: 'st-paused', note: 'Hidden from search until you turn it back on.' },
    removed: { label: 'Removed', cls: 'st-paused', note: 'This listing was taken down. Contact us if you have questions.' },
  };
  function statusNote(l) {
    if (l.status === 'draft') return t('{n} of 6 steps done', { n: ECS.stepsDone(l) });
    if (l.status === 'changes') return l.review_note || t('Please check your listing and send it again.');
    return STATUS[l.status] && STATUS[l.status].note ? t(STATUS[l.status].note) : '';
  }
  var TABS = ['overview', 'listings', 'messages', 'account'];
  var ORDER = { changes: 0, live: 1, review: 2, paused: 3, removed: 4, draft: 5 };
  var dash = null;

  function shortDate(d) { return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); }
  function ago(d) {
    var m = Math.round((Date.now() - new Date(d).getTime()) / 6e4);
    if (m < 2) return t('Just now');
    if (m < 60) return t('{n} min ago', { n: m });
    if (m < 60 * 24) return t('{n} hr ago', { n: Math.round(m / 60) });
    return shortDate(d);
  }
  function initials(n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join(''); }
  function manilaHour() { return new Date(Date.now() + 8 * 36e5).getUTCHours(); }
  function dayKeys(n) { var out = []; for (var k = n - 1; k >= 0; k--) out.push(new Date(Date.now() + 8 * 36e5 - k * 864e5).toISOString().slice(0, 10)); return out; }
  function num(n) { return Number(n || 0).toLocaleString('en-PH'); }

  /* The way back to the Keeper home (for people with no listing: to their account page), the same on every page
   * that is opened from it. `tab` is the tab to land on. */
  HV.back = function (tab) {
    var keeper = H.store.get('ecs-keeper', false) || (ECS.user && ECS.user.role === 'admin');
    return '<a class="kh-back" href="/host' + (keeper && tab ? '?tab=' + tab : '') + '" data-link>' + H.icon('arrow-left') + '<span>' + esc(t(keeper ? 'Keeper home' : 'Your account')) + '</span></a>';
  };

  HV.dashboard = function (host) {
    needUser(host, function (user) { loadDash(host, user); });
  };

  function loadDash(host, user) {
    return Promise.all([ECS.profile().catch(function () { return {}; }), ECS.myListings(), ECS.threads().catch(function () { return []; }), ECS.outbox().catch(function () { return []; }), ECS.replyQuota().catch(function () { return null; }), ECS.keeperStats().catch(function () { return []; })]).then(function (r) {
      var want = new URLSearchParams(location.search).get('tab');
      var d = { host: host, user: user, p: r[0] || {}, ls: r[1] || [], out: r[3] || [], quota: r[4], tab: TABS.indexOf(want) >= 0 ? want : 'overview', filter: dash && dash.host === host ? dash.filter : 'all' };
      var byId = {}; d.ls.forEach(function (l) { byId[l.id] = l; });
      d.keeper = d.ls.length > 0 || d.p.role === 'admin';
      // Conversations about the Keeper's own listings (admins see the team's leads in the admin workspace instead).
      d.kt = (r[2] || []).filter(function (th) { return th.role === 'keeper' && (ECS.mode !== 'live' || byId[th.q.listing_id]); });
      d.rt = (r[2] || []).filter(function (th) { return th.role === 'renter'; });
      d.waiting = d.kt.filter(function (th) { return th.waiting; });
      // Numbers per listing: views and saves by day (last 30 days), renters who wrote in that time, renters waiting.
      d.days = dayKeys(30); d.series = d.days.map(function () { return 0; }); d.per = {}; d.views = 0; d.saves = 0;
      var at = {}; d.days.forEach(function (k, i) { at[k] = i; });
      d.ls.forEach(function (l) { d.per[l.id] = { views: 0, saves: 0, msgs: 0, waiting: 0 }; });
      (r[5] || []).forEach(function (s) {
        var x = d.per[s.listing_id], i = at[String(s.day).slice(0, 10)];
        if (!x || i == null) return;
        x.views += s.views || 0; x.saves += s.saves || 0; d.views += s.views || 0; d.saves += s.saves || 0; d.series[i] += s.views || 0;
      });
      var since = Date.now() - 30 * 864e5;
      d.kt.forEach(function (th) { var x = d.per[th.q.listing_id]; if (!x) return; if (new Date(th.q.created_at).getTime() >= since) x.msgs++; if (th.waiting) x.waiting++; });
      d.main = d.ls.filter(function (l) { return l.status !== 'draft'; }).sort(function (a, b) { return (ORDER[a.status] - ORDER[b.status]) || (a.updated_at < b.updated_at ? 1 : -1); });
      d.drafts = d.ls.filter(function (l) { return l.status === 'draft'; }).sort(function (a, b) { return (ECS.stepsDone(b) - ECS.stepsDone(a)) || (a.updated_at < b.updated_at ? 1 : -1); });
      d.live = d.ls.filter(function (l) { return l.status === 'live'; });
      d.onFree = d.p.role !== 'admin' && d.quota && d.ls.some(function (l) { return (l.status === 'live' || l.status === 'paused') && !ECS.planOn(l); });
      if (!d.keeper) d.tab = 'overview';
      H.store.set('ecs-keeper', !!d.keeper);
      dash = d;
      paintDash();
    }).catch(function (x) { host.innerHTML = HV.demoBar() + '<div class="host-wrap"><p class="host-error">' + esc(x.message) + '</p></div>'; });
  }

  /* The page: a fixed menu on the left (a strip of tabs on phones) and one quiet column of content. Each thing is
   * said once: what needs the Keeper is on Home, conversations are on Messages, the plan is on its own tab. */
  function paintDash() {
    var d = dash, first = (d.p.full_name || d.user.name || '').split(' ')[0];
    var h = manilaHour(), hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    var title = d.tab === 'listings' ? t('Listings') : d.tab === 'messages' ? t('Messages') : d.tab === 'account' ? t('Plan and account') : first ? t(hello + ', {name}', { name: first }) : t(hello);
    var changes = d.ls.filter(function (l) { return l.status === 'changes'; }).length, review = d.ls.filter(function (l) { return l.status === 'review'; }).length;
    var sum = d.tab !== 'overview' ? '' : !d.keeper ? t('Your messages and your details are here.') :
      d.waiting.length === 1 ? t('1 renter is waiting for your reply.') :
      d.waiting.length ? t('{n} renters are waiting for your reply.', { n: d.waiting.length }) :
      changes ? t('A listing needs a few changes before renters can see it.') :
      d.live.length ? t('Your place is up and every renter has an answer.') :
      review ? t('Your listing is with us. We check it within 1 day and email you.') :
      t('Finish your listing and renters can start to write to you.');
    var item = function (id, icon, label, n, hot) {
      return '<button type="button" role="tab" aria-selected="' + (d.tab === id) + '" data-tab="' + id + '">' + H.icon(icon) + '<span>' + esc(t(label)) + '</span>' +
        (hot ? '<b class="count brass">' + n + '</b>' : n ? '<i class="n">' + n + '</i>' : '') + '</button>';
    };
    var add = '<a class="btn btn-brass kh-add" href="/host/new" data-link>' + H.icon('plus') + '<span>' + esc(t('Add a listing')) + '</span></a>';
    var body = !d.keeper ? renterHome() : d.tab === 'listings' ? tabListings() : d.tab === 'messages' ? tabMessages() : d.tab === 'account' ? tabAccount() : tabOverview();
    d.host.innerHTML = HV.demoBar() +
      '<div class="host-wrap kh' + (d.keeper ? '' : ' kh-solo') + '">' +
        (d.keeper ? '<aside class="kh-nav"><p class="kh-brand">' + esc(t('Keeper home')) + '</p>' +
          '<div class="kh-tabs" role="tablist" aria-label="' + esc(t('Keeper home')) + '">' + item('overview', 'home', 'Home') + item('listings', 'building', 'Listings', d.ls.length) + item('messages', 'message', 'Messages', d.waiting.length, d.waiting.length > 0) + item('account', 'user', 'Plan and account') + '</div>' +
          add + '<p class="kh-nav-foot"><a href="/help?from=keeper" data-link>' + esc(t('Help')) + '</a><span>' + esc(d.user.email || '') + '</span></p></aside>' : '') +
        '<div class="kh-page' + (d.keeper && d.tab === 'messages' ? ' kh-full' : '') + '" role="tabpanel">' +
          '<header class="kh-head"><div><h1>' + esc(title) + '</h1>' + (sum ? '<p class="kh-sum">' + esc(sum) + '</p>' : '') + '</div>' + (d.keeper ? add : '') + '</header>' +
          body +
        '</div>' +
      '</div>';
    bindDash($('.kh', d.host));
    if (d.keeper && d.tab === 'messages' && window.MsgView) { MsgView.render($('.kh-inbox', d.host), d.open || null, true); d.open = null; }
  }

  /* ---- Home: three questions, each in its own card. Who is waiting for me? Where are my listings at?
   * How are they doing? ---- */
  function tabOverview() {
    var d = dash, anyUp = d.ls.some(function (l) { return l.status === 'live' || l.status === 'paused'; });
    var tile = function (icon, n, label, tab, tone, hint) {
      var inner = '<span class="kn-ic ' + (tone || '') + '">' + H.icon(icon) + '</span><span class="kn-b"><b>' + (n == null ? '–' : numf(n)) + '</b><span>' + esc(t(label)) + '</span>' + (hint ? '<small>' + esc(t(hint)) + '</small>' : '') + '</span>';
      return tab ? '<button type="button" class="kn" data-tab="' + tab + '">' + inner + '</button>' : '<div class="kn">' + inner + '</div>';
    };
    // Other things to finish (messages have their own card).
    var q = [], todo = function (icon, title, sub, href, cta) { q.push('<li class="kq"><span class="kq-ic">' + H.icon(icon) + '</span><div><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></div><a class="btn btn-ghost btn-sm" href="' + esc(href) + '" data-link>' + esc(t(cta)) + '</a></li>'); };
    d.ls.filter(function (l) { return l.status === 'changes'; }).forEach(function (l) { todo('pencil', t('{name} needs a few changes', { name: l.name || t('Untitled listing') }), statusNote(l), '/host/edit/' + l.id, 'Update listing'); });
    d.drafts.filter(function (l) { return ECS.ready(l); }).slice(0, 2).forEach(function (l) { todo('check', t('{name} is ready to send', { name: l.name || t('Untitled listing') }), t('All 6 steps are done. Send it for review.'), '/host/edit/' + l.id + '?step=contact', 'Send'); });
    if (!d.p.mobile) todo('phone', t('Add your mobile number'), t('So we can reach you about your listings.'), '/host/profile', 'Add');
    var show = (d.main.length ? d.main : d.drafts).slice(0, 3);
    var wait = d.waiting.slice(0, 4);
    return '<div class="kn-row">' +
        tile('home', d.live.length, 'Live listings', 'listings', 'green') +
        tile('message', d.waiting.length, 'Renters waiting for your reply', 'messages', d.waiting.length ? 'brass' : '') +
        tile('eye', anyUp ? d.views : null, 'Views in the last 30 days', '', '', anyUp ? '' : 'Counts once a listing is live') +
        tile('heart', anyUp ? d.saves : null, 'Saves in the last 30 days', '', '', anyUp ? '' : 'Counts once a listing is live') +
      '</div>' +
      '<div class="kh-cols"><div class="kh-col">' +
        '<section class="kcard"><div class="kcard-h"><h2>' + esc(t('Renters waiting for you')) + (d.waiting.length ? ' <b class="count brass">' + d.waiting.length + '</b>' : '') + '</h2>' +
          (d.kt.length ? '<button type="button" class="kh-more" data-tab="messages">' + esc(t('All messages')) + '</button>' : '') + '</div>' +
          (wait.length ? '<ul class="kw-list">' + wait.map(function (th) {
            var last = th.msgs[th.msgs.length - 1], name = th.q.renter_name || t('Renter');
            return '<li class="kw"><span class="km-av">' + esc(initials(name)) + '</span><div class="kw-b"><p class="kw-top"><b>' + esc(name) + '</b><time>' + esc(ago(last.created_at)) + '</time></p>' +
              '<p class="kw-room">' + esc(th.room.name) + '</p><p class="kw-msg">' + esc(last.body || '') + '</p></div>' +
              '<button type="button" class="btn btn-primary btn-sm" data-thread="' + esc(th.q.id) + '">' + esc(t(th.q.locked ? 'Read' : 'Reply')) + '</button></li>';
          }).join('') + '</ul>' :
          '<div class="kcard-empty">' + H.icon('check') + '<p><b>' + esc(t('No one is waiting.')) + '</b> ' + esc(t(d.kt.length ? 'Every renter has your answer.' : 'When a renter asks about your live listing, the message shows here and we email you.')) + '</p></div>') +
        '</section>' +
        (q.length ? '<section class="kcard"><div class="kcard-h"><h2>' + esc(t('Things to finish')) + '</h2></div><ul class="kq-list">' + q.join('') + '</ul></section>' : '') +
      '</div><div class="kh-col">' +
        '<section class="kcard"><div class="kcard-h"><h2>' + esc(t('Your listings')) + '</h2>' + (d.ls.length > show.length ? '<button type="button" class="kh-more" data-tab="listings">' + esc(t('See all {n}', { n: d.ls.length })) + '</button>' : '') + '</div>' +
          (show.length ? '<ul class="kc-list">' + show.map(homeListing).join('') + '</ul>' : emptyListings()) +
        '</section>' +
      '</div></div>';
  }
  // Where a listing is on its way to renters: Details, Review, Live.
  function steps(l) {
    var s = l.status, at = s === 'draft' ? 0 : s === 'review' || s === 'changes' ? 1 : 2;
    return '<ol class="ks' + (s === 'changes' ? ' bad' : '') + '">' + ['Details', 'Review', 'Live'].map(function (label, i) {
      var cls = i < at || s === 'live' ? 'done' : i === at ? 'on' : '';
      return '<li class="' + cls + '"><i>' + (cls === 'done' ? H.icon('check') : '') + '</i><span>' + esc(t(label)) + '</span></li>';
    }).join('') + '</ol>';
  }
  function homeListing(l) {
    var st = STATUS[l.status] || STATUS.draft, cover = l.photos && l.photos[0], price = ECS.priceFrom(l), x = dash.per[l.id] || {}, name = l.name || t('Untitled listing');
    var main = l.status === 'draft' ? ['Continue', 'btn-primary'] : l.status === 'changes' ? ['Update listing', 'btn-primary'] : ['Edit', 'btn-ghost'];
    return '<li class="kc">' +
      '<a class="kc-img" href="/host/edit/' + l.id + '" data-link tabindex="-1" aria-hidden="true">' + (cover ? '<img src="' + esc(photoUrl(cover)) + '" alt="" loading="lazy">' : H.icon('home')) + '</a>' +
      '<div class="kc-b"><div class="kc-top"><h3>' + esc(name) + '</h3><span class="kc-pill ' + st.cls + '"><i></i>' + esc(t(st.label)) + '</span></div>' +
        '<p class="kc-meta">' + esc([l.area, price ? t('from {p} a month', { p: H.peso(price) }) : ''].filter(Boolean).join(' · ') || t('No details yet')) + '</p>' +
        (l.status === 'paused' || l.status === 'removed' ? '' : steps(l)) +
        (l.status === 'live' ? '<p class="kc-nums"><span>' + H.icon('eye') + '<b>' + numf(x.views) + '</b> ' + esc(t('views')) + '</span><span>' + H.icon('heart') + '<b>' + numf(x.saves) + '</b> ' + esc(t('saves')) + '</span><span>' + H.icon('message') + '<b>' + numf(x.msgs) + '</b> ' + esc(t('renters')) + '</span></p>' :
          statusNote(l) ? '<p class="kc-note">' + esc(statusNote(l)) + '</p>' : '') +
        '<div class="kc-act"><a class="btn ' + main[1] + ' btn-sm" href="/host/edit/' + l.id + '" data-link>' + esc(t(main[0])) + '</a>' +
          (l.status === 'live' ? '<a class="btn btn-ghost btn-sm" href="/room/' + l.id + '" data-link>' + esc(t('See it as a renter')) + '</a>' : '') + '</div>' +
      '</div></li>';
  }
  function numf(n) { return Number(n || 0).toLocaleString('en-PH'); }
  function emptyListings() {
    return '<a class="host-keeper" href="/host/new" data-link><span>' + H.icon('home') + '</span><div><b>' + esc(t('Have a place to rent out?')) + '</b><small>' + esc(t('Become a Keeper: add your boarding house in about 10 minutes.')) + '</small></div>' + H.icon('chev-right') + '</a>';
  }

  /* ---- Listings: a gallery. Each place is a large photo card that says, in one sentence, where it stands and
   * what to do next. ---- */
  function nextStep(l) { var s = ECS.STEPS.filter(function (x) { return !x.done(l); })[0]; return s ? s.label : ''; }
  function say(l) {
    if (l.status === 'draft') return ECS.ready(l) ? t('All 6 steps are done. Send it for review.') : t('Next step: {step}', { step: t(nextStep(l)) });
    if (l.status === 'review') return t('We are checking it now. You will get an email within 1 day.');
    return statusNote(l);
  }
  function galleryCard(l) {
    var st = STATUS[l.status] || STATUS.draft, cover = l.photos && l.photos[0], price = ECS.priceFrom(l), x = dash.per[l.id] || {}, name = l.name || t('Untitled listing'), n = ECS.stepsDone(l);
    var main = l.status === 'draft' ? [ECS.ready(l) ? 'Send for review' : 'Continue', 'btn-primary'] : l.status === 'changes' ? ['Update listing', 'btn-primary'] : l.status === 'paused' ? ['Edit', 'btn-ghost'] : ['Edit', 'btn-ghost'];
    var ic = function (attr, icon, label) { return '<button type="button" class="lc-ic" ' + attr + ' aria-label="' + esc(label + ': ' + name) + '" title="' + esc(label) + '">' + H.icon(icon) + '</button>'; };
    return '<li class="lc ' + st.cls + '">' +
      '<a class="lc-img' + (cover ? '' : ' none') + '" href="/host/edit/' + l.id + '" data-link tabindex="-1" aria-hidden="true">' +
        (cover ? '<img src="' + esc(photoUrl(cover)) + '" alt="" loading="lazy">' : '<span class="lc-ph">' + H.icon('image') + '<small>' + esc(t('No photos yet')) + '</small></span>') +
        '<span class="lc-pill ' + st.cls + '"><i></i>' + esc(t(st.label)) + '</span>' +
        (l.status === 'draft' ? '<span class="lc-ring" style="--p:' + Math.round(n / 6 * 100) + '"><b>' + n + '</b><small>/6</small></span>' : '') +
      '</a>' +
      (l.status === 'draft' ? ic('data-del="' + l.id + '"', 'trash', t('Delete draft')).replace('class="lc-ic"', 'class="lc-ic lc-del"') : '') +
      '<div class="lc-b"><h3>' + esc(name) + '</h3>' +
        '<p class="lc-meta">' + esc([l.area, price ? t('from {p} a month', { p: H.peso(price) }) : ''].filter(Boolean).join(' · ') || t('No details yet')) + '</p>' +
        (l.status === 'paused' || l.status === 'removed' ? '' : steps(l)) +
        (l.status === 'live' ? '<p class="lc-nums"><span><b>' + numf(x.views) + '</b>' + esc(t('views')) + '</span><span><b>' + numf(x.saves) + '</b>' + esc(t('saves')) + '</span><span><b>' + numf(x.msgs) + '</b>' + esc(t('renters')) + '</span></p>' : '') +
        (say(l) ? '<p class="lc-say">' + esc(say(l)) + '</p>' : '') +
        '<div class="lc-act"><a class="btn ' + main[1] + '" href="/host/edit/' + l.id + (l.status === 'draft' && ECS.ready(l) ? '?step=contact' : '') + '" data-link>' + esc(t(main[0])) + '</a>' +
          (l.status === 'live' ? ic('data-go="/room/' + l.id + '"', 'eye', t('See it as a renter')) + ic('data-copy="/room/' + l.id + '"', 'copy', t('Copy link')) + ic('data-pause="' + l.id + '"', 'pause', t('Pause')) : '') +
          (l.status === 'paused' ? '<button type="button" class="btn btn-primary" data-unpause="' + l.id + '">' + esc(t('Show again')) + '</button>' : '') +
        '</div></div></li>';
  }
  function tabListings() {
    var d = dash, F = [['all', 'All'], ['live', 'Live'], ['review', 'In review'], ['changes', 'Needs changes'], ['paused', 'Paused'], ['draft', 'Drafts']];
    var n = function (k) { return k === 'all' ? d.ls.length : d.ls.filter(function (l) { return l.status === k; }).length; };
    if (d.filter !== 'all' && !n(d.filter)) d.filter = 'all';
    if (!d.ls.length) return '<section class="kh-sec">' + emptyListings() + '</section>';
    var chips = F.filter(function (f) { return f[0] === 'all' || n(f[0]); });
    var list = d.main.concat(d.drafts).filter(function (l) { return d.filter === 'all' || l.status === d.filter; });
    return '<section class="kh-sec">' +
      (chips.length > 2 ? '<div class="kh-chips" role="group" aria-label="' + esc(t('Show')) + '">' + chips.map(function (f) { return '<button type="button" aria-pressed="' + (d.filter === f[0]) + '" data-filter="' + f[0] + '">' + esc(t(f[1])) + ' <span>' + n(f[0]) + '</span></button>'; }).join('') + '</div>' : '') +
      '<ul class="lc-grid">' + list.map(galleryCard).join('') +
        '<li class="lc lc-new"><a href="/host/new" data-link><span>' + H.icon('plus') + '</span><b>' + esc(t('Add a listing')) + '</b><small>' + esc(t('About 10 minutes. Only you see it until you send it.')) + '</small></a></li></ul>' +
      (d.live.length ? '<p class="kh-muted small">' + esc(t('Views, saves and renters are for the last 30 days.')) + '</p>' : '') + '</section>';
  }

  /* ---- Messages: the whole inbox, right here (list, conversation, reply) ---- */
  function tabMessages() { return '<div class="kh-inbox"></div>'; }

  function msgRow(th) {
    var last = th.msgs[th.msgs.length - 1], mine = last.sender_role === th.role, keeper = th.role === 'keeper';
    var name = keeper ? (th.q.renter_name || t('Renter')) : th.room.name;
    var sub = keeper ? th.room.name : th.q.move_in ? t('Move-in: {m}', { m: th.q.move_in }) : t('You asked');
    var tag = keeper && th.waiting ? (th.q.locked ? '<span class="km-tag off">' + esc(t('Locked')) + '</span>' : '<span class="km-tag">' + esc(t('Your turn')) + '</span>') : !keeper && th.waiting ? '<span class="km-tag">' + esc(t('New reply')) + '</span>' : '';
    return '<li><a class="km' + (th.waiting ? ' wait' : '') + '" href="/messages/' + esc(th.q.id) + '" data-link>' +
      '<span class="km-av">' + (keeper ? esc(initials(name)) : H.icon('home')) + '</span>' +
      '<span class="km-b"><span class="km-top"><b>' + esc(name) + '</b><span class="km-room">' + esc(sub) + '</span></span>' +
        '<span class="km-snip">' + esc((mine ? t('You') + ': ' : '') + (last.body || '')) + '</span></span>' + tag + '<time>' + esc(ago(last.created_at)) + '</time></a></li>';
  }

  /* ---- Plan and account ---- */
  function planBlock() {
    var d = dash, paid = d.ls.filter(function (l) { return ECS.planOn(l); });
    var used = d.onFree ? Math.min(d.quota.used, d.quota.limit) : 0;
    return '<section class="kh-sec kp"><h2>' + esc(t('Your plan')) + '</h2>' +
      paid.map(function (l) { return '<p class="kp-row"><b>' + esc(l.name || t('Untitled listing')) + '</b><small>' + esc(t('{plan} plan until {date}', { plan: l.plan.charAt(0).toUpperCase() + l.plan.slice(1), date: new Date(l.plan_until + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) })) + '</small></p>'; }).join('') +
      (d.onFree ? '<p class="kp-name">' + esc(t('Free plan')) + '</p>' +
        '<div class="kp-bar" role="img" aria-label="' + esc(t('{n} of {max} new renters answered this month', { n: used, max: d.quota.limit })) + '"><i style="width:' + Math.round(used / d.quota.limit * 100) + '%"></i></div>' +
        '<p class="kh-muted small">' + esc(t('{n} of {max} new renters answered this month', { n: used, max: d.quota.limit })) + '. ' + esc(t('Starts again on {date}.', { date: ECS.quotaResets() })) + '</p>' :
        paid.length ? '' : '<p class="kh-muted">' + esc(t('Plans add the Verified mark, a higher place in search and no limit on answers.')) + '</p>') +
      '<a class="btn btn-ghost btn-sm" href="/host/plans" data-link>' + esc(t('See plans')) + '</a></section>';
  }
  function linkRows(keeper) {
    var d = dash, r = function (href, label, sub) { return '<li><a href="' + esc(href) + '" data-link><div><b>' + esc(t(label)) + '</b>' + (sub ? '<small>' + esc(t(sub)) + '</small>' : '') + '</div>' + H.icon('chev-right') + '</a></li>'; };
    return '<ul class="kh-links">' +
      r('/host/profile', 'Your details', 'Name, mobile number, how renters reach you') +
      (keeper ? '' : r('/messages', 'Messages', 'Every conversation in one inbox')) +
      (keeper ? r('/listing-standards?from=keeper', 'Keeper standards', 'What we check before a listing goes live') : '') +
      r('/help?from=keeper', 'Help', 'Answers and how to reach us') +
      (d.p.role === 'admin' && App.desk() ? r(App.desk(), 'Admin') : '') +
      (d.p.role === 'admin' || ECS.mode === 'demo' ? r('/host/review', ECS.mode === 'demo' ? 'Review queue (try the reviewer side)' : 'Review listings') : '') +
      '</ul>';
  }
  function tabAccount() {
    return '<div class="kh-narrow">' + planBlock() + '<section class="kh-sec"><h2>' + esc(t('Your account')) + '</h2>' + linkRows(true) + '</section>' + (ECS.mode === 'demo' ? outboxHtml(dash.out) : '') + '</div>';
  }

  /* ---- People with no listing: a short account page ---- */
  function renterHome() {
    var d = dash;
    return '<div class="kh-narrow"><section class="kh-sec"><h2>' + esc(t('Rooms you asked about')) + '</h2>' +
      (d.rt.length ? '<ul class="km-list">' + d.rt.map(msgRow).join('') + '</ul>' : '<p class="kh-muted">' + esc(t('When you message a Keeper about a room, it shows here.')) + ' <a href="/rooms" data-link>' + esc(t('Find a room')) + '</a></p>') + '</section>' +
      '<section class="kh-sec"><h2>' + esc(t('Your account')) + '</h2>' + linkRows(false) + '</section>' +
      '<section class="kh-sec">' + emptyListings() + '</section>' +
      (ECS.mode === 'demo' ? outboxHtml(d.out) : '') + '</div>';
  }

  /* Demo only: the emails the service would have sent, openable as they would look. */
  function outboxHtml(out) {
    return '<section class="kh-sec"><h2>' + esc(t('Emails in this demo')) + '</h2>' +
      (out.length ? '<p class="kh-muted">' + esc(t('On the real service these go to the inbox. Here you can open them as they would look.')) + '</p><ul class="outbox">' + out.map(function (m) {
        return '<li><span>' + H.icon('message') + '</span><div><b>' + esc(EMAIL_NAMES[m.template] || m.template) + '</b><small>' + esc(m.to) + ' · ' + esc(new Date(m.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })) + '</small></div>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-email="' + esc(m.id) + '">' + esc(t('Open')) + '</button></li>';
      }).join('') + '</ul>' : '<p class="kh-muted">' + esc(t('None yet.')) + '</p>') + '</section>';
  }
  var EMAIL_NAMES = { 'welcome': 'Welcome to ECStay', 'listing-submitted': 'We got your listing', 'listing-live': 'Your listing is live', 'listing-needs-changes': 'A few changes needed', 'new-inquiry': 'New inquiry for your listing', 'inquiry-sent': 'Your message was sent (to the renter)', 'finish-your-listing': 'Finish your listing', 'sign-in-code': 'Your sign-in code' };

  // Fill a template from /emails/dist with sample-shaped data and open it in a new tab.
  HV.openEmail = function (m) {
    var win = window.open('', '_blank');
    fetch('/emails/dist/' + m.template).then(function (r) { if (!r.ok) throw new Error(); return r.text(); }).then(function (html) {
      var d = Object.assign({ site_url: location.origin, name: (ECS.user && ECS.user.name) || 'there', unsubscribe_url: location.origin + '/host/profile' }, m.data || {});
      d.listing_url = d.listing_url || location.origin + '/host'; d.edit_url = d.edit_url || location.origin + '/host';
      html = html.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, function (_, k) { return H.esc(d[k] != null ? d[k] : ''); });
      if (win) { win.document.open(); win.document.write(html); win.document.close(); }
    }).catch(function () { if (win) win.close(); H.toast(t('That email preview is not available.')); });
  };

  function bindDash(wrap) {
    var d = dash, again = function () { loadDash(d.host, d.user); };
    // The menu stays in view under the site header.
    var hdr = document.querySelector('.site-header'); if (hdr) wrap.style.setProperty('--kh-top', hdr.offsetHeight + 'px');
    wrap.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-thread]'))) {
        d.tab = 'messages'; d.open = b.getAttribute('data-thread');
        history.replaceState(history.state, '', '/host?tab=messages'); paintDash(); window.scrollTo(0, 0);
      }
      else if ((b = e.target.closest('[data-tab]'))) {
        d.tab = b.getAttribute('data-tab');
        history.replaceState(history.state, '', '/host' + (d.tab === 'overview' ? '' : '?tab=' + d.tab));
        paintDash();
        window.scrollTo(0, 0);
        var on = $('.kh-tabs [aria-selected="true"]', d.host); if (on && b.closest('.kh-tabs')) on.focus();
      }
      else if ((b = e.target.closest('[data-filter]'))) { d.filter = b.getAttribute('data-filter'); paintDash(); var f = $('.kh-chips [aria-pressed="true"]', d.host); if (f) f.focus(); }
      else if ((b = e.target.closest('[data-go]'))) go(b.getAttribute('data-go'));
      else if ((b = e.target.closest('[data-copy]'))) {
        var url = location.origin + b.getAttribute('data-copy');
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { H.toast(t('Link copied')); }).catch(function () { window.prompt(t('Copy link'), url); });
      }
      else if ((b = e.target.closest('[data-pause]'))) ECS.setPaused(b.getAttribute('data-pause'), true).then(function () { H.toast(t('Paused. It no longer shows in search.')); again(); }).catch(function (x) { H.toast(x.message); });
      else if ((b = e.target.closest('[data-unpause]'))) ECS.setPaused(b.getAttribute('data-unpause'), false).then(function () { H.toast(t('Your listing shows in search again.')); again(); }).catch(function (x) { H.toast(x.message); });
      else if ((b = e.target.closest('[data-del]'))) {
        if (!window.confirm(t('Delete this draft? This cannot be undone.'))) return;
        ECS.deleteListing(b.getAttribute('data-del')).then(function () { H.toast(t('Draft deleted.')); again(); }).catch(function (x) { H.toast(x.message); });
      } else if ((b = e.target.closest('[data-email]'))) {
        var id = b.getAttribute('data-email');
        ECS.outbox().then(function (o) { var m = o.filter(function (x) { return x.id === id; })[0]; if (m) HV.openEmail(m); });
      }
    });
  }

  /* ================= /host/profile ================= */
  HV.profile = function (host) {
    needUser(host, function (user) {
      var welcome = /[?&]welcome=1/.test(location.search), next = nextParam();
      ECS.profile().then(function (p) {
        p = p || {};
        host.innerHTML = HV.demoBar() +
          (welcome ? '<div class="auth">' + authBg() + '<a href="/" class="auth-logo" data-link data-home aria-label="ECStay, home"><img src="/assets/brand/ecstay-mark.svg" width="54" height="36" alt=""><span class="logo-word">ECStay</span></a>' + '<div class="auth-card auth-details">' : '<div class="host-wrap host-narrow">') +
            (welcome ? '<h1>' + esc(t('A few details first')) + '</h1><p class="auth-sub">' + esc(t('So Keepers and our team can reach you. Your mobile number is never shown publicly.')) + '</p>'
              : HV.back('account') + '<h1>' + esc(t('Your details')) + '</h1>') +
            '<form class="host-form" novalidate>' +
              '<label class="field"><span>' + esc(t('Your name')) + '</span><input name="full_name" autocomplete="name" value="' + esc(p.full_name || user.name || '') + '" required></label>' +
              (welcome ? '' : '<label class="field"><span>' + esc(t('Email')) + '</span><input value="' + esc(p.email || user.email || '') + '" disabled></label>') +
              '<label class="field"><span>' + esc(t('Mobile number')) + '</span><input name="mobile" type="tel" inputmode="tel" autocomplete="tel" placeholder="0917 123 4567" value="' + esc(ECS.showMobile(p.mobile || '')) + '" required></label>' +
              '<fieldset class="field"><legend>' + esc(t('How should renters and our team reach you?')) + '</legend><div class="chip-wrap">' +
                chip('radio', 'contact_pref', 'text', t('Text me'), p.contact_pref === 'text') + chip('radio', 'contact_pref', 'call', t('Call me'), p.contact_pref === 'call') + chip('radio', 'contact_pref', 'either', t('Either'), !p.contact_pref || p.contact_pref === 'either') +
              '</div></fieldset>' +
              '<label class="check"><input type="checkbox" name="marketing_ok"' + (p.marketing_ok !== false ? ' checked' : '') + '><span>' + esc(t('Send me tips and reminders about my listings by email. I can turn this off anytime.')) + '</span></label>' +
              '<p class="field-err" role="alert" hidden></p>' +
              '<button type="submit" class="btn btn-primary ' + (welcome ? 'btn-block' : 'btn-lg') + '">' + esc(t(welcome ? 'Continue' : 'Save')) + '</button>' +
            '</form>' +
            (welcome ? '<p class="auth-legal">' + esc(t('Signed in as {email}', { email: p.email || user.email || '' })) + '</p></div>' : '') +
            (welcome ? '' : '<section class="host-sec"><h2>' + esc(t('Account')) + '</h2>' +
              '<button type="button" class="btn btn-ghost" data-signout>' + esc(t('Sign out')) + '</button>' +
              '<p class="host-muted">' + t('To delete your account and listings, {link}. We\'ll confirm by email.', { link: '<a href="/contact?topic=privacy" data-link>' + esc(t('send us a request')) + '</a>' }) + '</p></section>') +
          '</div>';
        var f = $('form', host), e = $('.field-err', f);
        f.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var name = f.full_name.value.trim(), mob = ECS.mobile(f.mobile.value);
          if (name.length < 2) { err(e, t('Please enter your name.')); f.full_name.focus(); return; }
          if (!mob) { err(e, t('Please enter a mobile number like 0917 123 4567.')); f.mobile.focus(); return; }
          err(e, '');
          var b = $('button[type=submit]', f); busy(b, true, t('Saving'));
          ECS.saveProfile({ full_name: name, mobile: mob, contact_pref: (f.querySelector('[name=contact_pref]:checked') || {}).value || 'either', marketing_ok: f.marketing_ok.checked })
            .then(function () { if (welcome) go(next); else { busy(b, false); H.toast(t('Saved')); } })
            .catch(function (x) { busy(b, false); err(e, x.message); });
        });
        var so = $('[data-signout]', host);
        if (so) so.addEventListener('click', function () { ECS.signOut().then(function () { H.toast(t('Signed out')); go('/'); }); });
      });
    });
  };

  /* ================= /host/new, /host/edit/:id: the listing editor ================= */
  var PLACE_TYPES = ['Boarding house', 'Dormitory', 'Apartment', 'House'];
  var GENDERS = [['female', 'Female only'], ['male', 'Male only'], ['mixed', 'Mixed']];
  var BILLS = [['included', 'Included in rent'], ['meter', 'Own meter'], ['shared', 'Shared, split by tenants']];
  var CURFEW = ['', '21:00', '22:00', '23:00', '00:00'];
  var VISITORS = [['allowed', 'Allowed'], ['daytime', 'Daytime only'], ['none', 'Not allowed']];
  var YESNO = [['yes', 'Allowed'], ['no', 'Not allowed']];

  HV.editor = function (host, id) {
    HV.leave();
    needUser(host, function () {
      var p = id ? ECS.listing(id) : ECS.saveListing({ rooms: [], amenities: [], photos: [], rules: {} });
      Promise.all([p, ECS.profile().catch(function () { return {}; })]).then(function (r) {
        var l = r[0], prof = r[1] || {};
        if (!id) { history.replaceState(null, '', '/host/edit/' + l.id); }
        // The profile mobile is this listing's contact number unless they change it (saved, not just shown).
        openEditor(host, l, !l.contact_mobile && prof.mobile ? { contact_mobile: prof.mobile } : null);
      }).catch(function (x) { host.innerHTML = HV.demoBar() + '<div class="host-wrap"><p class="host-error">' + esc(x.message) + '</p>' + HV.back('listings') + '</div>'; });
    });
  };

  function openEditor(host, l, prefill) {
    var steps = ECS.STEPS, cur = 0, saveT = 0, pending = {}, picker = null, saving = null;
    var want = new URLSearchParams(location.search).get('step');
    steps.forEach(function (s, i) { if (s.id === want) cur = i; });
    if (!want) { for (var i = 0; i < steps.length; i++) { if (!steps[i].done(l)) { cur = i; break; } } }
    editor = { destroy: function () { clearTimeout(saveT); if (picker) picker.destroy(); flush(); } };

    function flush() {
      clearTimeout(saveT);
      var patch = pending; pending = {};
      if (!Object.keys(patch).length) return saving || Promise.resolve(l);
      patch.id = l.id;
      setSaved('saving');
      saving = ECS.saveListing(patch).then(function (x) {
        Object.keys(x).forEach(function (k) { if (!(k in pending)) l[k] = x[k]; });
        setSaved('saved'); paintNav(); return l;
      }).catch(function (x) { setSaved('error', x.message); throw x; });
      return saving;
    }
    function set(k, v) { l[k] = v; pending[k] = v; clearTimeout(saveT); saveT = setTimeout(flush, 700); setSaved('dirty'); paintNav(); }
    function setSaved(state, msg) {
      var el = $('.ed-saved', host); if (!el) return;
      el.className = 'ed-saved is-' + state;
      el.textContent = state === 'saving' ? t('Saving…') : state === 'saved' ? t('Saved') : state === 'error' ? (msg || t('Not saved. Check your connection.')) : '';
    }

    function shell() {
      host.innerHTML = HV.demoBar() +
        '<div class="ed">' +
          '<aside class="ed-side">' + HV.back('listings') +
            '<p class="ed-title">' + esc(l.name || t('New listing')) + '</p><ol class="ed-nav"></ol></aside>' +
          '<div class="ed-main"><div class="ed-prog" aria-hidden="true"><i></i></div><form class="ed-form" novalidate></form>' +
            '<div class="ed-bar"><button type="button" class="btn btn-ghost" data-prev>' + esc(t('Back')) + '</button><span class="ed-saved" aria-live="polite"></span>' +
            '<button type="button" class="btn btn-primary" data-next></button></div></div>' +
        '</div>';
      $('.ed-nav', host).addEventListener('click', function (e) { var b = e.target.closest('[data-step]'); if (b) show(+b.getAttribute('data-step')); });
      $('[data-prev]', host).addEventListener('click', function () { if (cur > 0) show(cur - 1); else go('/host'); });
      $('[data-next]', host).addEventListener('click', function () {
        if (cur < steps.length - 1) { if (!validate(true)) return; show(cur + 1); }
        else submit(this);
      });
    }
    function paintNav() {
      var nav = $('.ed-nav', host); if (!nav) return;
      nav.innerHTML = steps.map(function (s, i) {
        return '<li><button type="button" data-step="' + i + '"' + (i === cur ? ' aria-current="step"' : '') + ' class="' + (s.done(l) ? 'is-done' : '') + '">' +
          '<span class="ed-n">' + (s.done(l) ? H.icon('check') : i + 1) + '</span><span>' + esc(t(s.label)) + '</span></button></li>';
      }).join('');
      $('.ed-title', host).textContent = l.name || t('New listing');
      $('.ed-prog i', host).style.width = Math.round(ECS.stepsDone(l) / steps.length * 100) + '%';
      var nx = $('[data-next]', host);
      nx.textContent = cur < steps.length - 1 ? t('Save and continue') : (l.status === 'live' || l.status === 'paused' || l.status === 'review' ? t('Save changes') : t('Send for review'));
      nx.disabled = cur === steps.length - 1 && !ECS.ready(l);
      $('[data-prev]', host).textContent = cur > 0 ? t('Back') : t('Close');
    }
    function show(i) {
      if (picker) { picker.destroy(); picker = null; }
      cur = i;
      history.replaceState(null, '', '/host/edit/' + l.id + '?step=' + steps[i].id);
      // A fresh form per step, so one step's listeners never act on another step's fields.
      var old = $('.ed-form', host), f = old.cloneNode(false);
      old.parentNode.replaceChild(f, old);
      f.innerHTML = '<p class="ed-step">' + esc(t('Step {n} of {m}', { n: i + 1, m: steps.length })) + '</p>' + FORMS[steps[i].id]();
      f.onsubmit = function (e) { e.preventDefault(); };
      BIND[steps[i].id] && BIND[steps[i].id](f);
      paintNav();
      window.scrollTo(0, 0);
      var first = f.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea'); if (first && window.innerWidth >= 1024) first.focus({ preventScroll: true });
    }
    function validate(show) {
      var s = steps[cur]; if (s.done(l)) return true;
      if (show) { var e = $('.ed-form .field-err', host); if (e) err(e, t(HINT[s.id])); }
      return false;
    }
    var HINT = {
      place: 'Add a name, the type of place, who can stay, and a description of at least 40 characters.',
      location: 'Add the area and street, then tap the map to place the pin on the house.',
      rooms: 'Add at least one room type with its monthly price and how many are available, plus the advance and deposit.',
      amenities: 'Pick at least one amenity and say whether visitors are allowed.',
      photos: 'Add at least 5 photos.',
      contact: 'Add a mobile number and tick the box to confirm.',
    };

    /* ---- Step forms ---- */
    function radios(name, opts, val) { return '<div class="chip-wrap">' + opts.map(function (o) { return chip('radio', name, o[0], t(o[1]), val === o[0]); }).join('') + '</div>'; }
    var FORMS = {
      place: function () {
        return '<h1>' + esc(t('Tell us about your place')) + '</h1>' +
          '<label class="field"><span>' + esc(t('Listing name')) + ' <small>' + esc(t('what renters see first, e.g. Bajada Ladies\' Boarding House')) + '</small></span><input name="name" maxlength="70" value="' + esc(l.name || '') + '"></label>' +
          '<fieldset class="field"><legend>' + esc(t('Type of place')) + '</legend>' + radios('place_type', PLACE_TYPES.map(function (x) { return [x, x]; }), l.place_type) + '</fieldset>' +
          '<fieldset class="field"><legend>' + esc(t('Who can stay')) + '</legend>' + radios('gender', GENDERS, l.gender) + '</fieldset>' +
          '<label class="field"><span>' + esc(t('Description')) + ' <small>' + esc(t('40 to 800 characters. What is it like to live here? What is nearby?')) + '</small></span><textarea name="description" maxlength="800" rows="6">' + esc(l.description || '') + '</textarea><small class="ed-count"></small></label>' +
          '<p class="field-err" role="alert" hidden></p>';
      },
      location: function () {
        return '<h1>' + esc(t('Where is it?')) + '</h1>' +
          '<label class="field"><span>' + esc(t('Area or barangay')) + '</span><input name="area" list="ed-areas" value="' + esc(l.area || '') + '" placeholder="' + esc(t('e.g. Bajada')) + '"><datalist id="ed-areas">' + HAVN_AREAS.map(function (a) { return '<option value="' + esc(a) + '">'; }).join('') + '</datalist></label>' +
          '<label class="field"><span>' + esc(t('Street address')) + ' <small>' + esc(t('shown to renters only after they contact you')) + '</small></span><input name="address" value="' + esc(l.address || '') + '" placeholder="' + esc(t('House number, street, barangay')) + '"></label>' +
          '<div class="field"><span>' + esc(t('Pin the exact spot')) + ' <small>' + esc(t('tap the map on your house, or drag the pin')) + '</small></span>' +
            '<div class="ed-map"><div class="map-loading"></div></div>' +
            '<button type="button" class="btn btn-ghost btn-sm ed-locate">' + H.icon('pin') + '<span>' + esc(t('Use my current location')) + '</span></button>' +
            '<p class="ed-near"></p></div>' +
          '<p class="field-err" role="alert" hidden></p>';
      },
      rooms: function () {
        var by = {}; (l.rooms || []).forEach(function (r) { by[r.type] = r; });
        return '<h1>' + esc(t('Rooms and prices')) + '</h1><p class="ed-help">' + esc(t('Turn on each kind of room you rent out. Prices are per person per month for bedspaces, per room for the rest.')) + '</p>' +
          '<div class="ed-rooms">' + HAVN_ROOM_TYPES.map(function (type) {
            var r = by[type];
            return '<div class="ed-room' + (r ? ' on' : '') + '" data-type="' + esc(type) + '">' +
              '<label class="check"><input type="checkbox" data-room-on' + (r ? ' checked' : '') + '><span><b>' + esc(t(type)) + '</b></span></label>' +
              '<div class="ed-room-f"><label class="field"><span>' + esc(t('Monthly price (₱)')) + '</span><input type="number" inputmode="numeric" min="500" step="100" data-room-price value="' + (r && r.price || '') + '"></label>' +
              '<label class="field"><span>' + esc(t(type === 'Bedspace' ? 'Beds available' : 'Rooms available')) + '</span><input type="number" inputmode="numeric" min="1" max="200" data-room-count value="' + (r && r.count || '') + '"></label></div></div>';
          }).join('') + '</div>' +
          '<div class="ed-grid">' +
            '<label class="field"><span>' + esc(t('Advance')) + '</span><select name="advance_months">' + [['', 'Choose'], [0, 'None'], [1, '1 month'], [2, '2 months'], [3, '3 months']].map(function (o) { return '<option value="' + o[0] + '"' + (String(l.advance_months) === String(o[0]) && o[0] !== '' ? ' selected' : '') + '>' + esc(t(o[1])) + '</option>'; }).join('') + '</select></label>' +
            '<label class="field"><span>' + esc(t('Deposit')) + '</span><select name="deposit_months">' + [['', 'Choose'], [0, 'None'], [1, '1 month'], [2, '2 months'], [3, '3 months']].map(function (o) { return '<option value="' + o[0] + '"' + (String(l.deposit_months) === String(o[0]) && o[0] !== '' ? ' selected' : '') + '>' + esc(t(o[1])) + '</option>'; }).join('') + '</select></label>' +
            '<label class="field"><span>' + esc(t('Electricity')) + '</span><select name="bill_electric">' + BILLS.map(function (o) { return '<option value="' + o[0] + '"' + ((l.bills || {}).electric === o[0] ? ' selected' : '') + '>' + esc(t(o[1])) + '</option>'; }).join('') + '</select></label>' +
            '<label class="field"><span>' + esc(t('Water')) + '</span><select name="bill_water">' + BILLS.map(function (o) { return '<option value="' + o[0] + '"' + ((l.bills || {}).water === o[0] ? ' selected' : '') + '>' + esc(t(o[1])) + '</option>'; }).join('') + '</select></label>' +
            '<label class="field"><span>' + esc(t('Available from')) + '</span><select name="available_from">' + monthsAhead(7).map(function (m) { return '<option value="' + m.v + '"' + (l.available_from === m.v ? ' selected' : '') + '>' + esc(m.l) + '</option>'; }).join('') + '</select></label>' +
          '</div><p class="field-err" role="alert" hidden></p>';
      },
      amenities: function () {
        var rules = l.rules || {}, am = l.amenities || [];
        return '<h1>' + esc(t('Amenities and house rules')) + '</h1>' +
          '<fieldset class="field"><legend>' + esc(t('What renters get')) + '</legend><div class="chip-wrap">' +
            Object.keys(HAVN_AMENITIES).map(function (k) { return chip('checkbox', 'amenities', k, t(HAVN_AMENITIES[k].label), am.indexOf(k) >= 0); }).join('') + '</div></fieldset>' +
          '<div class="ed-grid">' +
            '<label class="field"><span>' + esc(t('Curfew')) + '</span><select name="curfew">' + CURFEW.map(function (c) { return '<option value="' + c + '"' + ((rules.curfew || '') === c ? ' selected' : '') + '>' + esc(c ? t('Gate closes at {time}', { time: c === '00:00' ? '12:00 AM' : (parseInt(c, 10) - 12) + ':00 PM' }) : t('No curfew')) + '</option>'; }).join('') + '</select></label>' +
          '</div>' +
          '<fieldset class="field"><legend>' + esc(t('Visitors')) + '</legend>' + radios('visitors', VISITORS, rules.visitors) + '</fieldset>' +
          '<fieldset class="field"><legend>' + esc(t('Cooking in the room')) + '</legend>' + radios('cooking', YESNO, rules.cooking) + '</fieldset>' +
          '<fieldset class="field"><legend>' + esc(t('Pets')) + '</legend>' + radios('pets', YESNO, rules.pets) + '</fieldset>' +
          '<fieldset class="field"><legend>' + esc(t('Smoking')) + '</legend>' + radios('smoking', [['no', 'Not allowed'], ['outside', 'Outside only']], rules.smoking) + '</fieldset>' +
          '<label class="field"><span>' + esc(t('Other rules')) + ' <small>' + esc(t('optional')) + '</small></span><textarea name="rules_other" rows="3" maxlength="400">' + esc(rules.other || '') + '</textarea></label>' +
          '<p class="field-err" role="alert" hidden></p>';
      },
      photos: function () {
        return '<h1>' + esc(t('Photos')) + '</h1><p class="ed-help">' + esc(t('Add 5 to 10 recent photos in daylight: each room type, the bed, the CR, the study area and the outside of the house. The first photo is the cover.')) + '</p>' +
          '<label class="ed-drop"><input type="file" accept="image/*" multiple hidden>' + H.icon('plus') + '<span>' + esc(t('Add photos')) + '</span><small>' + esc(t('JPG or PNG, we resize them for you')) + '</small></label>' +
          '<ul class="ed-photos"></ul><p class="ed-photo-n"></p><p class="field-err" role="alert" hidden></p>';
      },
      contact: function () {
        var price = ECS.priceFrom(l), cover = l.photos && l.photos[0];
        return '<h1>' + esc(t('Contact and review')) + '</h1>' +
          '<label class="field"><span>' + esc(t('Mobile number for this listing')) + ' <small>' + esc(t('we send renters\' messages here by email too; it is not shown on the listing')) + '</small></span><input name="contact_mobile" type="tel" inputmode="tel" value="' + esc(ECS.showMobile(l.contact_mobile || '')) + '" placeholder="0917 123 4567"></label>' +
          '<div class="ed-preview"><p class="ed-help">' + esc(t('How it will look')) + '</p>' +
            '<article class="card ed-card"><div class="card-media">' + (cover ? '<img src="' + esc(photoUrl(cover)) + '" alt="">' : '<span class="ed-noimg">' + H.icon('image') + '</span>') + '</div>' +
              '<div class="card-body"><h2 class="card-title"><span>' + esc(l.name || t('Untitled listing')) + '</span></h2>' +
              '<p class="card-near">' + H.icon('pin') + '<span>' + esc(l.area || t('Area not set')) + '</span></p>' +
              '<p class="card-meta">' + esc([(l.rooms || []).map(function (r) { return t(r.type); }).join(', '), l.gender ? H.genderLabel(l.gender) : ''].filter(Boolean).join(' · ')) + '</p>' +
              '<p class="card-price">' + (price ? '<b>' + H.peso(price) + '</b> ' + esc(t('/ month')) : '') + '</p></div></article></div>' +
          '<ul class="ed-check">' + ECS.STEPS.slice(0, 5).map(function (s, i) { return '<li class="' + (s.done(l) ? 'ok' : '') + '">' + H.icon(s.done(l) ? 'check' : 'info') + '<span>' + esc(t(s.label)) + '</span>' + (s.done(l) ? '' : '<button type="button" class="btn-link" data-step-go="' + i + '">' + esc(t('Finish')) + '</button>') + '</li>'; }).join('') + '</ul>' +
          '<label class="check ed-confirm"><input type="checkbox" name="confirmed"' + (l.confirmed ? ' checked' : '') + '><span>' + t('These details are true, the photos are of this place, and I have the right to rent it out. I have read the {link}.', { link: '<a href="/listing-standards" target="_blank">' + esc(t('Keeper standards')) + '</a>' }) + '</span></label>' +
          (l.status === 'changes' && l.review_note ? '<p class="ed-note">' + H.icon('info') + '<span><b>' + esc(t('Our note:')) + '</b> ' + esc(l.review_note) + '</span></p>' : '') +
          (l.status === 'live' || l.status === 'paused' ? '<p class="ed-help">' + esc(t('Changes to a live listing are checked again before they show.')) + '</p>' : '') +
          '<p class="field-err" role="alert" hidden></p>';
      },
    };

    var BIND = {
      place: function (f) {
        var cnt = $('.ed-count', f), ta = f.description;
        var count = function () { cnt.textContent = t('{n} characters', { n: ta.value.trim().length }); };
        count();
        f.addEventListener('input', function (e) {
          var n = e.target.name;
          if (n === 'name') set('name', e.target.value);
          if (n === 'description') { set('description', e.target.value); count(); }
        });
        f.addEventListener('change', function (e) { if (e.target.name === 'place_type' || e.target.name === 'gender') set(e.target.name, e.target.value); });
      },
      location: function (f) {
        var near = $('.ed-near', f);
        var paintNear = function () {
          if (typeof l.lat !== 'number') { near.textContent = ''; return; }
          var list = HAVN_SCHOOLS.concat(HAVN_LANDMARKS || []).map(function (s) { return { s: s, km: H.km(l, s) }; }).filter(function (x) { return x.km <= 3; }).sort(function (a, b) { return a.km - b.km; }).slice(0, 3);
          near.innerHTML = list.length ? H.icon('walk') + '<span>' + esc(t('Near {places}', { places: list.map(function (x) { return x.s.short + ' (' + t('{n} min walk', { n: H.walkMin(x.km) }) + ')'; }).join(', ') })) + '</span>' : '';
        };
        paintNear();
        f.addEventListener('input', function (e) { if (e.target.name === 'area' || e.target.name === 'address') set(e.target.name, e.target.value); });
        HavnMap.pick($('.ed-map', f), l, function (lat, lng) { set('lat', lat); set('lng', lng); paintNear(); })
          .then(function (pk) { picker = pk; $('.ed-map .map-loading', f) && $('.ed-map .map-loading', f).remove(); })
          .catch(function () { $('.ed-map', f).innerHTML = '<p class="map-fail">' + esc(t('The map could not load. Check your connection and open this step again.')) + '</p>'; });
        $('.ed-locate', f).addEventListener('click', function () {
          if (!navigator.geolocation) { H.toast(t('Your browser cannot share your location.')); return; }
          navigator.geolocation.getCurrentPosition(function (pos) { if (picker) picker.set(+pos.coords.latitude.toFixed(6), +pos.coords.longitude.toFixed(6)); },
            function () { H.toast(t('Location not shared. Tap the map instead.')); }, { enableHighAccuracy: true, timeout: 10000 });
        });
      },
      rooms: function (f) {
        function read() {
          var rooms = $$('.ed-room', f).filter(function (r) { return $('[data-room-on]', r).checked; }).map(function (r) {
            return { type: r.getAttribute('data-type'), price: parseInt($('[data-room-price]', r).value, 10) || 0, count: parseInt($('[data-room-count]', r).value, 10) || 0 };
          });
          set('rooms', rooms);
        }
        f.addEventListener('input', function (e) { if (e.target.closest('.ed-room')) read(); });
        f.addEventListener('change', function (e) {
          var room = e.target.closest('.ed-room');
          if (room && e.target.hasAttribute('data-room-on')) { room.classList.toggle('on', e.target.checked); read(); if (e.target.checked) $('[data-room-price]', room).focus(); return; }
          var n = e.target.name;
          if (n === 'advance_months' || n === 'deposit_months') set(n, e.target.value === '' ? null : +e.target.value);
          if (n === 'available_from') set(n, e.target.value);
          if (n === 'bill_electric' || n === 'bill_water') set('bills', { electric: f.bill_electric.value, water: f.bill_water.value });
        });
        if (!l.bills) set('bills', { electric: f.bill_electric.value, water: f.bill_water.value });
        if (!l.available_from) set('available_from', f.available_from.value);
      },
      amenities: function (f) {
        function rules() { var r = Object.assign({}, l.rules || {}); ['visitors', 'cooking', 'pets', 'smoking'].forEach(function (k) { var c = f.querySelector('[name=' + k + ']:checked'); if (c) r[k] = c.value; }); r.curfew = f.curfew.value; r.other = f.rules_other.value; return r; }
        f.addEventListener('change', function (e) {
          if (e.target.name === 'amenities') set('amenities', $$('[name=amenities]:checked', f).map(function (x) { return x.value; }));
          else set('rules', rules());
        });
        f.addEventListener('input', function (e) { if (e.target.name === 'rules_other') set('rules', rules()); });
      },
      photos: function (f) {
        var list = $('.ed-photos', f), input = $('input[type=file]', f), n = $('.ed-photo-n', f), e = $('.field-err', f);
        function paint() {
          var ph = l.photos || [];
          list.innerHTML = ph.map(function (p, i) {
            return '<li><img src="' + esc(photoUrl(p)) + '" alt="">' + (i === 0 ? '<span class="ed-cover">' + esc(t('Cover')) + '</span>' : '') +
              '<div class="ed-ph-act">' + (i > 0 ? '<button type="button" data-cover="' + i + '">' + esc(t('Make cover')) + '</button>' : '') +
              '<button type="button" data-remove="' + i + '" aria-label="' + esc(t('Remove photo')) + '">' + H.icon('x') + '</button></div></li>';
          }).join('');
          n.textContent = ph.length >= 5 ? t('{n} of {max} photos', { n: ph.length, max: MAX_PHOTOS }) : t('{n} of at least 5 photos', { n: ph.length });
          $('.ed-drop', f).hidden = ph.length >= MAX_PHOTOS;
        }
        paint();
        input.addEventListener('change', function () {
          var picked = Array.prototype.slice.call(input.files || []), files = picked.slice(0, Math.max(0, MAX_PHOTOS - (l.photos || []).length));
          if (!files.length) return;
          err(e, picked.length > files.length ? t('A listing holds up to {max} photos, so only the first {n} were added.', { max: MAX_PHOTOS, n: files.length }) : '');
          var holder = files.map(function () { var li = document.createElement('li'); li.className = 'is-up'; li.innerHTML = '<span class="spin"></span>'; list.appendChild(li); return li; });
          files.reduce(function (pr, file, i) {
            return pr.then(function () {
              return ECS.uploadPhoto(l.id, file).then(function (ph) { set('photos', (l.photos || []).concat([ph])); }).catch(function (x) { err(e, x.message); }).then(function () { holder[i].remove(); });
            });
          }, Promise.resolve()).then(function () { paint(); flush(); input.value = ''; });
        });
        list.addEventListener('click', function (ev) {
          var b, ph = (l.photos || []).slice();
          if ((b = ev.target.closest('[data-cover]'))) { var k = +b.getAttribute('data-cover'); ph.unshift(ph.splice(k, 1)[0]); set('photos', ph); paint(); }
          else if ((b = ev.target.closest('[data-remove]'))) { var j = +b.getAttribute('data-remove'), gone = ph.splice(j, 1)[0]; set('photos', ph); paint(); if (gone && gone.path) ECS.removePhoto(gone.path).catch(function () {}); }
        });
      },
      contact: function (f) {
        f.addEventListener('input', function (e) { if (e.target.name === 'contact_mobile') set('contact_mobile', ECS.mobile(e.target.value) || e.target.value.trim()); });
        f.addEventListener('change', function (e) { if (e.target.name === 'confirmed') set('confirmed', e.target.checked); });
        f.addEventListener('click', function (e) { var b = e.target.closest('[data-step-go]'); if (b) show(+b.getAttribute('data-step-go')); });
      },
    };

    function submit(btn) {
      if (!ECS.ready(l)) { validate(true); return; }
      busy(btn, true, t('Sending'));
      var fresh = !(l.status === 'live' || l.status === 'paused' || l.status === 'review');
      flush().then(function () {
        if (!fresh) return l; // the service sends edits back to review
        return ECS.submitListing(l.id);
      }).then(function () {
        HV.leave();
        if (!fresh) { H.toast(t('Sent for review. We\'ll email you when it\'s live.')); go('/host'); return; }
        busy(btn, false);
        thanks();
      }).catch(function (x) { busy(btn, false); var e = $('.ed-form .field-err', host); if (e) err(e, x.message); });
    }

    // A new listing was sent: thank the Keeper on the same page, say when to expect our email and how to reach us.
    function thanks() {
      var C = window.HAVN_CONFIG || {}, tel = (C.phone || '').replace(/[^\d+]/g, '');
      var mail = (ECS.user && ECS.user.email) || '';
      var ways =
        (tel ? '<a class="btn" href="tel:' + esc(tel) + '">' + H.icon('phone') + '<span>' + esc(t('Call')) + ' ' + esc(C.phone) + '</span></a>' +
               '<a class="btn" href="sms:' + esc(tel) + '">' + H.icon('message') + '<span>' + esc(t('Text us')) + '</span></a>' : '') +
        (C.email ? '<a class="btn" href="mailto:' + esc(C.email) + '">' + H.icon('message') + '<span>' + esc(C.email) + '</span></a>' : '') +
        (!tel && !C.email ? '<a class="btn" href="/contact" data-link data-close>' + H.icon('message') + '<span>' + esc(t('Contact us')) + '</span></a>' : '');
      var stops = [];
      var dlg = H.dialog({
        className: 'cele',
        title: t('Listing sent'),
        body: '<div class="cele-body">' +
          '<div class="cele-coin" aria-hidden="true"><span class="cele-coin-still">' + H.icon('check') + '</span></div>' +
          '<h3>' + esc(t('Thank you. Your listing is with us.')) + '</h3>' +
          '<p>' + esc(t('We check every listing ourselves before renters see it. This takes up to 1 day.')) + '</p>' +
          '<p>' + (mail ? t('We will email you at {email} as soon as it is live, or if we need a change.', { email: '<b>' + esc(mail) + '</b>' }) : esc(t('We will email you as soon as it is live, or if we need a change.'))) + '</p>' +
          '<div class="cele-ask"><p>' + esc(t('Any question while you wait?')) + '</p><div class="cele-ways">' + ways + '</div></div></div>',
        foot: '<button type="button" class="btn btn-brass btn-block" data-close>' + esc(t('Go to my listings')) + '</button>',
        focus: '.dlg-foot button',
        onClose: function () { stops.forEach(function (f) { try { f(); } catch (e) {} }); go('/host'); },
      });
      // The 3D medallion and the confetti load on their own; if they cannot, the plain mark stays.
      import('/assets/js/celebrate.js').then(function (m) {
        var coin = dlg.el.querySelector('.cele-coin'); if (!coin || !document.body.contains(coin)) return;
        stops.push(m.medallion(coin));
        var r = coin.getBoundingClientRect(), w = dlg.el.getBoundingClientRect();
        setTimeout(function () { if (document.body.contains(dlg.el)) stops.push(m.confetti(dlg.el, { x: r.left + r.width / 2 - w.left, y: r.top + r.height / 2 - w.top })); }, 650);
      }).catch(function () {});
    }

    shell();
    if (prefill) Object.keys(prefill).forEach(function (k) { set(k, prefill[k]); });
    show(cur);
  }

  /* ================= Renter inquiry (room page) ================= */
  HV.inquire = function (l) {
    var ms = monthsAhead(6).slice(1).map(function (m) { return m.l; });
    var dlg = H.dialog({
      title: t('Ask about {name}', { name: l.name }),
      className: 'sheet contact inquire',
      body:
        (l.sample ? '<p class="note-box">' + H.icon('info') + '<span>' + esc(t('This is a sample listing. Your message goes to the ECStay team, who can point you to real rooms like it.')) + '</span></p>' : '') +
        '<form class="inq-form" novalidate>' +
          '<label class="field"><span>' + esc(t('Your name')) + '</span><input name="renter_name" autocomplete="name" maxlength="80" required></label>' +
          '<label class="field"><span>' + esc(t('Mobile number')) + '</span><input name="renter_mobile" type="tel" inputmode="tel" autocomplete="tel" placeholder="0917 123 4567" required></label>' +
          '<label class="field"><span>' + esc(t('Email')) + ' <small>' + esc(t('optional, for a copy of your message')) + '</small></span><input name="renter_email" type="email" autocomplete="email" inputmode="email"></label>' +
          '<label class="field"><span>' + esc(t('Move-in month')) + '</span><select name="move_in">' + ms.map(function (m, i) { return '<option' + (i === 0 ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '<option value="">' + esc(t('Not sure yet')) + '</option></select></label>' +
          '<label class="field"><span>' + esc(t('Your message')) + '</span><textarea name="message" rows="4" maxlength="1000">' + esc(t('Hi! Is this still available? I\'d like to see the room.')) + '</textarea></label>' +
          '<p class="field-err" role="alert" hidden></p>' +
          '<p class="fine">' + t('The Keeper gets your name, mobile and message. See our {privacy}. Never pay before you\'ve seen the room.', { privacy: '<a href="/privacy" target="_blank">' + esc(t('Privacy Notice')) + '</a>' }) + '</p>' +
        '</form>',
      foot: '<button type="button" class="btn btn-primary btn-block" data-inq-send>' + H.icon('message') + '<span>' + esc(t('Send message')) + '</span></button>',
      focus: '[name=renter_name]',
    });
    var root = dlg.el, f = $('form', root), e = $('.field-err', root), btn = $('[data-inq-send]', root);
    function send() {
      var name = f.renter_name.value.trim(), mob = ECS.mobile(f.renter_mobile.value), mail = f.renter_email.value.trim();
      if (name.length < 2) { err(e, t('Please enter your name.')); f.renter_name.focus(); return; }
      if (!mob) { err(e, t('Please enter a mobile number like 0917 123 4567.')); f.renter_mobile.focus(); return; }
      if (mail && !ECS.email(mail)) { err(e, t('Please enter a valid email address, or leave it empty.')); f.renter_email.focus(); return; }
      err(e, ''); busy(btn, true, t('Sending'));
      ECS.sendInquiry({
        listing_ref: l.id, listing_id: l.dbId || null, listing_name: l.name,
        renter_name: name, renter_mobile: mob, renter_email: ECS.email(mail) || null,
        move_in: f.move_in.value || null, message: f.message.value.trim().slice(0, 1000),
      }).then(function () {
        $('.dlg-body', root).innerHTML = '<div class="inq-done"><img src="/assets/capy/kapi.webp" width="120" height="120" alt="">' +
          '<h3>' + esc(t('Message sent')) + '</h3><p>' + esc(l.sample ? t('The ECStay team will reply here in Messages, or by text.') : t('The Keeper can reply here in Messages, or by text or call.')) + '</p>' +
          '<p class="fine">' + esc(t('Stay safe: see the room in person before paying anything, and get a receipt.')) + '</p></div>';
        $('.dlg-foot', root).innerHTML = (ECS.user ? '<a class="btn btn-primary btn-block" href="/messages" data-link data-close>' + esc(t('See the conversation')) + '</a>' : '') + '<button type="button" class="btn btn-ghost btn-block" data-close>' + esc(t('Done')) + '</button>';
      }).catch(function (x) { busy(btn, false); err(e, x.message); });
    }
    btn.addEventListener('click', send);
    f.addEventListener('submit', function (ev) { ev.preventDefault(); send(); });
  };

  /* ================= /contact form ================= */
  var TOPICS = [['question', 'A question'], ['report', 'Report a listing'], ['privacy', 'A privacy request'], ['partner', 'Partnership'], ['other', 'Something else']];
  HV.contactForm = function (el) {
    if (!ECS.enabled()) {
      el.innerHTML = '<p class="doc-note">' + esc(t('Our contact form opens soon. For now, message us on Messenger.')) + '</p>' +
        '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://m.me/' + esc(HAVN_CONFIG.messenger) + '">' + H.icon('message') + '<span>' + esc(t('Message us')) + '</span></a>';
      return;
    }
    var topic = new URLSearchParams(location.search).get('topic') || 'question';
    el.innerHTML = '<form class="contact-form" novalidate>' +
      '<label class="field"><span>' + esc(t('Your name')) + '</span><input name="name" autocomplete="name" maxlength="80"></label>' +
      '<label class="field"><span>' + esc(t('Email')) + ' <small>' + esc(t('we reply here')) + '</small></span><input name="email" type="email" autocomplete="email" inputmode="email" value="' + esc((ECS.user && ECS.user.email) || '') + '"></label>' +
      '<label class="field"><span>' + esc(t('What is it about?')) + '</span><select name="topic">' + TOPICS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === topic ? ' selected' : '') + '>' + esc(t(o[1])) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>' + esc(t('Message')) + '</span><textarea name="message" rows="6" maxlength="3000"></textarea></label>' +
      '<p class="field-err" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-primary btn-lg">' + esc(t('Send')) + '</button></form>';
    var f = $('form', el), e = $('.field-err', el);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = f.name.value.trim(), mail = ECS.email(f.email.value), msg = f.message.value.trim();
      if (name.length < 2) { err(e, t('Please enter your name.')); f.name.focus(); return; }
      if (!mail) { err(e, t('Please enter a valid email address.')); f.email.focus(); return; }
      if (msg.length < 5) { err(e, t('Please write your message.')); f.message.focus(); return; }
      err(e, ''); var b = $('button', f); busy(b, true, t('Sending'));
      ECS.sendContact({ name: name, email: mail, topic: f.topic.value, message: msg }).then(function () {
        el.innerHTML = '<div class="inq-done"><img src="/assets/capy/kapi.webp" width="120" height="120" alt=""><h3>' + esc(t('Thanks, we got your message')) + '</h3><p>' + esc(t('We\'ll reply to {email}.', { email: mail })) + '</p></div>';
      }).catch(function (x) { busy(b, false); err(e, x.message); });
    });
  };

  /* ================= /host/plans: what the paid plans cost. For Keepers (and people starting a listing); renters are never sent here. ================= */
  var PLAN_PRICES = { basic: { 3: 1350, 6: 2400, 12: 4200 }, verified: { 3: 2160, 6: 3840, 12: 6720 }, premium: { 3: 3240, 6: 5760, 12: 10080 } };
  var PLAN_CARDS = [
    { id: 'basic', name: 'Basic', line: 'Never leave a renter unanswered.', cta: 'Answer every renter', above: 'Everything in Free, plus',
      points: ['Unlimited replies to renters', 'Call and Text buttons on your listing', 'Shown above free listings'] },
    { id: 'verified', name: 'Verified', line: 'Show renters your place is the real thing.', cta: 'Get the Verified mark', above: 'Everything in Basic, plus', flag: 'Recommended',
      points: ['The Verified Keeper mark on your listing', 'Shown above Basic listings', '1 video of your place', 'Views and saves for each room'] },
    { id: 'premium', name: 'Premium', line: 'Be the first place renters see.', cta: 'Put my place on top', above: 'Everything in Verified, plus',
      points: ['Featured rooms: on top of every search', 'A brass pin on the map', 'Featured in ECStay ads and Facebook posts', 'An ECStay visit every 3 months'] },
  ];
  HV.plans = function (host) {
    var start = /[?&]start=1/.test(location.search);
    needUser(host, function (user) {
      Promise.all([ECS.profile().catch(function () { return {}; }), ECS.myListings().catch(function () { return []; })]).then(function (r) {
        var p = r[0] || {}, ls = r[1] || [], term = 6;
        if (!start && !ls.length && p.role !== 'admin') { go('/host'); return; }
        var CHECK = H.icon('check');
        var Y = '<span class="pl-yes">' + esc(t('Yes')) + '</span>', N = '<span class="pl-no">' + esc(t('No')) + '</span>';
        var row = function (label, cells) { return '<tr><th scope="row">' + esc(t(label)) + '</th>' + cells.map(function (c) { return '<td>' + (c === true ? Y : c === false ? N : esc(t(c))) + '</td>'; }).join('') + '</tr>'; };
        var group = function (label) { return '<tr class="pl-group"><th colspan="5">' + esc(t(label)) + '</th></tr>'; };
        var head = function (cols) { return '<thead><tr>' + cols.map(function (c) { return '<th>' + esc(t(c)) + '</th>'; }).join('') + '</tr></thead>'; };
        var card = function (c) {
          return '<article class="pp-card pp-' + c.id + (c.flag ? ' pp-pick' : '') + '">' +
            (c.flag ? '<span class="pp-flag">' + esc(t(c.flag)) + '</span>' : '') +
            '<h2>' + esc(t(c.name)) + '</h2><p class="pp-line">' + esc(t(c.line)) + '</p>' +
            '<p class="pp-price"><b data-price="' + c.id + '"></b><span>' + esc(t('a month')) + '</span></p>' +
            '<p class="pp-total" data-total="' + c.id + '"></p>' +
            '<button type="button" class="btn ' + (c.flag ? 'btn-brass' : 'btn-primary') + ' btn-block" data-choose="' + c.id + '"><span>' + esc(t(c.cta)) + '</span>' + H.icon('arrow-right') + '</button>' +
            '<p class="pp-above">' + esc(t(c.above)) + '</p>' +
            '<ul class="pp-points">' + c.points.map(function (x) { return '<li>' + CHECK + '<span>' + esc(t(x)) + '</span></li>'; }).join('') + '</ul>' +
          '</article>';
        };
        var faq = function (q, a) { return '<details class="pp-q"><summary>' + esc(t(q)) + H.icon('chev-right') + '</summary><p>' + esc(t(a)) + '</p></details>'; };
        var rank = function (n, cls, title, text, plan) {
          return '<li class="pp-rank-' + cls + '"><i>' + n + '</i><div><b>' + esc(t(title)) + '</b><small>' + esc(t(text)) + '</small></div><em>' + esc(t(plan)) + '</em></li>';
        };

        host.innerHTML = HV.demoBar() +
          '<div class="pp">' +
            '<header class="pp-top">' +
              (start ? '<ol class="pp-steps"><li class="done">' + CHECK + '<span>' + esc(t('Your details')) + '</span></li><li class="on"><i>2</i><span>' + esc(t('Choose a plan')) + '</span></li><li><i>3</i><span>' + esc(t('Add your place')) + '</span></li></ol>'
                     : HV.back('account')) +
              '<h1>' + esc(t('Listing is free. Pay only to be seen first.')) + '</h1>' +
              '<p class="pp-lede">' + esc(t('Start free today. Move up any time to answer every renter and show higher in search.')) + '</p>' +
            '</header>' +

            '<div class="pp-pick-term"><span>' + esc(t('Pay for')) + '</span>' +
              '<div class="pp-term" role="group" aria-label="' + esc(t('How long')) + '">' +
                [[3, '3 months', ''], [6, '6 months', 'Save 11%'], [12, '12 months', 'Save 22%']].map(function (o) {
                  return '<button type="button" data-term="' + o[0] + '" aria-pressed="' + (o[0] === term) + '">' + esc(t(o[1])) + (o[2] ? '<em>' + esc(t(o[2])) + '</em>' : '') + '</button>';
                }).join('') + '</div></div>' +

            '<div class="pp-cards">' + PLAN_CARDS.map(card).join('') + '</div>' +

            '<div class="pp-free"><div><h2>' + esc(t('Free')) + ' <span>' + H.peso(0) + ' ' + esc(t('always')) + '</span></h2>' +
              '<p>' + esc(t('Your place listed and searchable, up to 10 photos, and replies to 5 new renters a month. No payment, no time limit.')) + '</p></div>' +
              '<button type="button" class="btn btn-ghost" data-choose="free"><span>' + esc(start ? t('Start free') : t('Stay on Free')) + '</span>' + H.icon('arrow-right') + '</button></div>' +

            '<p class="pp-soon">' + H.icon('info') + '<span>' + esc(t('Paid plans open soon. Choosing one now costs nothing: we will message you before any payment. Prices are per location, for up to 3 rooms, paid once by GCash or Maya.')) + '</span></p>' +

            '<section class="pp-sec"><h2>' + esc(t('Where renters see you')) + '</h2>' +
            '<p class="pp-sub">' + esc(t('Search results show rooms in this order, top to bottom.')) + '</p>' +
            '<ol class="pp-rank">' +
              rank(1, 'premium', 'Featured rooms', 'On top of every search, with a brass pin on the map', 'Premium') +
              rank(2, 'verified', 'Verified Keepers', 'Next in line, with the Verified Keeper mark', 'Verified') +
              rank(3, 'basic', 'Basic listings', 'Above every free listing', 'Basic') +
              rank(4, 'free', 'Free listings', 'Listed and searchable, after the paid plans', 'Free') +
            '</ol></section>' +

            '<section class="pp-sec"><h2>' + esc(t('Extras')) + '</h2>' +
            '<p class="pp-sub">' + esc(t('One-time add-ons, on any plan.')) + '</p>' +
            '<div class="pp-extras">' +
              [['Photo shoot', 500, 'one time', 'We photograph up to 5 rooms and the shared areas. ₱100 for each extra room. Davao City only.'],
               ['Photo and video shoot', 1000, 'one time', 'The photos, plus a short walk-through video. ₱150 for each extra room. The video shows on Verified and Premium.'],
               ['Full-house renewal', 450, 'for 3 months', 'For when all your rooms are taken at the end of a term. Your listing stays up marked "Full" and keeps its place in search.']].map(function (x) {
                return '<article class="pp-extra"><div><h3>' + esc(t(x[0])) + '</h3><p>' + esc(t(x[3])) + '</p></div><p class="pp-xprice"><b>' + H.peso(x[1]) + '</b><span>' + esc(t(x[2])) + '</span></p></article>';
              }).join('') + '</div></section>' +

            '<section class="pp-sec"><details class="pp-compare"><summary><span>' + esc(t('Compare every feature')) + '</span>' + H.icon('chev-right') + '</summary>' +
            '<div class="tbl-wrap"><table class="tbl pl-tbl">' + head(['', 'Free', 'Basic', 'Verified', 'Premium']) + '<tbody>' +
              group('Talking to renters') +
              row('Replies to new renters', ['5 a month', 'Unlimited', 'Unlimited', 'Unlimited']) +
              row('Call and Text buttons on your listing', [false, true, true, true]) +
              group('Where your listing shows') +
              row('Place in search', ['Normal', 'Above free listings', 'Above Basic', 'Featured rooms, on top of every search']) +
              row('Verified Keeper mark', [false, false, 'After an ID and permit check', true]) +
              row('Brass pin on the map', [false, false, false, true]) +
              row('Featured in ECStay ads and Facebook posts', [false, false, false, true]) +
              row('ECStay visit every 3 months', [false, false, false, 'With an "Availability checked" date on your listing']) +
              group('What your listing can hold') +
              row('Photos', ['Up to 10', 'Up to 10', 'Up to 10', 'Up to 10']) +
              row('Videos', ['None', 'None', '1 per location', 'Unlimited']) +
              group('What you see') +
              row('How long each renter plans to stay', [true, true, true, true]) +
              row('Views and saves for each room', [false, false, true, true]) +
            '</tbody></table></div></details></section>' +

            '<section class="pp-sec pp-faq"><h2>' + esc(t('Questions Keepers ask')) + '</h2>' +
              faq('Is listing really free?', 'Yes. The Free plan has no payment and no time limit. Your place stays listed whether or not you ever buy a plan.') +
              faq('How do I pay?', 'Once, at the start of your term, by GCash or Maya. After you choose a plan we message you the details. Nothing is charged automatically.') +
              faq('What happens when my term ends?', 'Your listing goes back to the Free plan and stays on ECStay. You can start a new term whenever you like.') +
              faq('I have more than 3 rooms. What do I pay?', 'Each room after the third adds ₱100 for every month of your term. A second location is a separate plan.') +
            '</section>' +
          '</div>';

        var paint = function () {
          $$('[data-term]', host).forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-term') === term)); });
          Object.keys(PLAN_PRICES).forEach(function (id) {
            var total = PLAN_PRICES[id][term];
            $('[data-price="' + id + '"]', host).textContent = H.peso(total / term);
            $('[data-total="' + id + '"]', host).textContent = t('{amt} for {n} months, paid once', { amt: H.peso(total), n: term });
          });
        };
        paint();
        host.addEventListener('click', function (e) {
          var b = e.target.closest('[data-term]');
          if (b) { term = +b.getAttribute('data-term'); paint(); return; }
          b = e.target.closest('[data-choose]'); if (!b) return;
          var id = b.getAttribute('data-choose');
          if (id === 'free') { go(start ? '/host/new' : '/host'); return; }
          var name = id.charAt(0).toUpperCase() + id.slice(1);
          b.disabled = true;
          ECS.sendContact({ name: (p.full_name || user.name || 'Keeper').slice(0, 80), email: user.email, topic: 'partner',
            message: 'Plan request: ' + name + ', ' + term + ' months (' + H.peso(PLAN_PRICES[id][term]) + '). Sent from the plans page' + (p.mobile ? '. Mobile: ' + p.mobile : '') + '.' })
            .then(function () {
              H.toast(t('Got it. We will message you about the {plan} plan.', { plan: t(name) }));
              if (start) go('/host/new'); else { b.textContent = t('Request sent'); }
            }).catch(function (x) { b.disabled = false; H.toast(x.message || t('Something went wrong. Please try again.')); });
        });
      }).catch(function () { host.innerHTML = '<div class="host-wrap"><p class="host-error">' + esc(t('Something went wrong. Please try again.')) + '</p></div>'; });
    });
  };
  var STAR = '<svg class="star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.6l2.8 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2 6.2 20.4l1.3-6.5L2.6 9.4l6.6-.8z"/></svg>';

  /* ================= /host/review: approve listings (admins; anyone in the demo) ================= */
  HV.review = function (host) {
    needUser(host, function () {
      Promise.all([ECS.profile().catch(function () { return {}; }), ECS.reviewQueue()]).then(function (r) {
        var p = r[0] || {}, q = r[1] || [];
        if (ECS.mode === 'live' && p.role !== 'admin') { go('/host'); return; }
        host.innerHTML = HV.demoBar() + '<div class="host-wrap">' +
          HV.back('account') +
          '<h1>' + esc(t('Review listings')) + '</h1><p class="host-muted">' + esc(t('Check the photos, price and pin against the Keeper standards. Approve it, or ask for changes with a short note; the Keeper gets an email either way.')) + '</p>' +
          (q.length ? '<ul class="rv-list">' + q.map(function (l) {
            var o = l.owner || {}, rules = l.rules || {};
            return '<li class="rv" data-id="' + esc(l.id) + '">' +
              '<div class="rv-photos">' + (l.photos || []).slice(0, 6).map(function (ph) { return '<img src="' + esc(photoUrl(ph)) + '" alt="" loading="lazy">'; }).join('') + '</div>' +
              '<div class="rv-b"><h2>' + esc(l.name) + '</h2>' +
                '<p class="hl-meta">' + esc([l.place_type, l.gender ? H.genderLabel(l.gender) : '', l.area].filter(Boolean).join(' · ')) + '</p>' +
                '<p class="rv-rooms">' + esc((l.rooms || []).map(function (x) { return t(x.type) + ': ' + H.peso(x.price) + ' × ' + x.count; }).join(' · ')) + '</p>' +
                '<p class="rv-desc">' + esc(l.description || '') + '</p>' +
                '<dl class="rv-dl"><div><dt>' + esc(t('Address')) + '</dt><dd>' + esc(l.address || '') + ' <a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=' + l.lat + '&mlon=' + l.lng + '#map=18/' + l.lat + '/' + l.lng + '">' + esc(t('Check the pin')) + '</a></dd></div>' +
                  '<div><dt>' + esc(t('Keeper')) + '</dt><dd>' + esc([o.full_name, o.email, ECS.showMobile(l.contact_mobile || o.mobile || '')].filter(Boolean).join(' · ')) + '</dd></div>' +
                  '<div><dt>' + esc(t('Rules')) + '</dt><dd>' + esc(['visitors', 'cooking', 'pets', 'smoking'].map(function (k) { return rules[k] ? k + ': ' + rules[k] : ''; }).filter(Boolean).join(', ') + (rules.curfew ? ', curfew ' + rules.curfew : '')) + '</dd></div></dl>' +
                '<label class="field"><span>' + esc(t('Note to the Keeper')) + ' <small>' + esc(t('needed when asking for changes')) + '</small></span><textarea rows="2" maxlength="500" data-note></textarea></label>' +
                '<div class="rv-act"><button type="button" class="btn btn-primary" data-approve>' + esc(t('Approve and publish')) + '</button>' +
                '<button type="button" class="btn btn-ghost" data-changes>' + esc(t('Ask for changes')) + '</button></div>' +
              '</div></li>';
          }).join('') + '</ul>' : '<p class="host-empty-line">' + esc(t('Nothing to review right now.')) + '</p>') +
        '</div>';
        Array.prototype.forEach.call(host.querySelectorAll('.rv'), function (li) {
          var id = li.getAttribute('data-id'), note = li.querySelector('[data-note]');
          li.addEventListener('click', function (e) {
            var a = e.target.closest('[data-approve]'), c = e.target.closest('[data-changes]');
            if (!a && !c) return;
            if (c && note.value.trim().length < 5) { note.focus(); H.toast(t('Write a short note so the Keeper knows what to change.')); return; }
            busy(a || c, true);
            ECS.review(id, a ? 'live' : 'changes', c ? note.value.trim() : null).then(function () {
              H.toast(a ? t('Published. The Keeper has been emailed.') : t('Sent back with your note.'));
              HV.review(host);
            }).catch(function (x) { busy(a || c, false); H.toast(x.message); });
          });
        });
      }).catch(function (x) { host.innerHTML = '<div class="host-wrap"><p class="host-error">' + esc(x.message) + '</p></div>'; });
    });
  };

  document.addEventListener('ecs:changed', function () { if (/^\/host\/?$/.test(location.pathname)) HV.dashboard(document.getElementById('view-page')); });
})();
