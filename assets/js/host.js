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
  var LIST_PHOTO = '/assets/photos/u-bab0e564-2000.webp';
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
      ? '<a class="btn btn-primary btn-lg" href="/signin?next=/host/new" data-link data-start>' + esc(t('Get started')) + H.icon('arrow-right') + '</a>'
      : '<button type="button" class="btn btn-primary btn-lg" data-ll-open>' + esc(t('Get started')) + H.icon('arrow-right') + '</button>';
    var step = function (n, title, text) { return '<li><span class="lp-n">' + n + '</span><div><h3>' + esc(t(title)) + '</h3><p>' + esc(t(text)) + '</p></div></li>'; };
    host.innerHTML = HV.demoBar() +
      '<div class="lp">' +
        '<section class="lp-hero">' +
          '<div class="lp-copy">' +
            '<p class="lp-kicker">' + esc(t('Become a Keeper')) + '</p>' +
            '<h1>' + esc(t('List your boarding house on ECStay')) + '</h1>' +
            '<p class="lp-lead">' + esc(t('Open your door to students and young workers looking for a room near their school or work. We review every listing before it goes live.')) + '</p>' +
            '<div class="lp-ctas">' + start +
              (ECS.enabled() ? '<a class="btn btn-ghost btn-lg" href="/signin?next=/host" data-link>' + esc(t('Sign in')) + '</a>' : '') + '</div>' +
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
    if (s) ECS.session().then(function (x) { if (x) s.setAttribute('href', '/host/new'); });
  };

  /* Backdrop for the sign-in steps: columns of real room photos drifting slowly up and down behind a soft
   * ivory veil (still when "reduce motion" is on). Decorative only. */
  var BG_PHOTOS = ['r-76fbd04a', 'r-a7ecbd80', 'u-6a9f6d5f', 's-56af3e05', 'r-e2c8eb45', 'u-0d45ed16', 'r-739c2161', 'r-4a0f0f98', 'u-72a75649',
    'r-8f9ec210', 'r-d48d41fc', 's-002abe42', 'r-e9bd5b70', 'u-0eb0c9a3', 'r-69add83d', 'r-62de96e3', 'r-c3f664ea', 'u-bab0e564'];
  function authBg() {
    var cols = [[], [], [], [], [], []];
    BG_PHOTOS.forEach(function (id, i) { cols[i % cols.length].push(id); });
    return '<div class="auth-bg" aria-hidden="true">' + cols.map(function (c, k) {
      var imgs = c.concat(c).concat(c).concat(c).map(function (id, j) { return '<img src="/assets/photos/' + id + '-640.webp" alt="" loading="lazy" class="' + ((j + k) % 3 === 0 ? 'tall' : '') + '">'; }).join('');
      return '<div class="auth-col"><div class="auth-strip">' + imgs + '</div></div>';
    }).join('') + '</div>';
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
        go(!p || !p.full_name || !p.mobile ? '/host/profile?welcome=1&next=' + encodeURIComponent(next) : next);
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

  /* ================= /host: dashboard ================= */
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

  HV.dashboard = function (host) {
    needUser(host, function (user) {
      Promise.all([ECS.profile().catch(function () { return {}; }), ECS.myListings(), ECS.inquiries().catch(function () { return []; }), ECS.outbox().catch(function () { return []; }), ECS.myInquiries().catch(function () { return []; })]).then(function (r) {
        var p = r[0] || {}, ls = r[1] || [], inq = r[2] || [], out = r[3] || [], sent = r[4] || [];
        var first = (p.full_name || user.name || '').split(' ')[0];
        var byId = {}; ls.forEach(function (l) { byId[l.id] = l; });
        // Only messages about your own listings (admins see every lead in the admin workspace instead).
        if (ECS.mode === 'live') inq = inq.filter(function (q) { return byId[q.listing_id]; });
        host.innerHTML = HV.demoBar() +
          '<div class="host-wrap">' +
            '<div class="host-head"><div><p class="host-hi">' + esc(first ? t('Hi, {name}', { name: first }) : t('Welcome')) + '</p><h1>' + esc(t(ls.length ? 'Your listings' : 'Your account')) + '</h1></div>' +
              '<a class="btn btn-primary" href="/host/new" data-link>' + H.icon('plus') + '<span>' + esc(t('Add a listing')) + '</span></a></div>' +
            (!p.mobile ? '<a class="host-nudge" href="/host/profile" data-link>' + H.icon('phone') + '<span>' + esc(t('Add your mobile number so we can reach you about your listings.')) + '</span>' + H.icon('chev-right') + '</a>' : '') +
            (ls.length ? '<ul class="hl-list">' + ls.map(listingRow).join('') + '</ul>' :
              '<a class="host-keeper" href="/host/new" data-link><span>' + H.icon('home') + '</span><div><b>' + esc(t('Have a place to rent out?')) + '</b><small>' + esc(t('Become a Keeper: add your boarding house in about 10 minutes.')) + '</small></div>' + H.icon('chev-right') + '</a>') +
            (ls.length ? '<section class="host-sec"><h2>' + esc(t('Messages from renters')) + '</h2>' +
              (inq.length ? '<ul class="inq-list">' + inq.map(function (q) { return inqRow(q, byId); }).join('') + '</ul>' :
                '<p class="host-muted">' + esc(t('No messages yet. When a renter asks about one of your live listings, it shows here and we email you.')) + '</p>') +
            '</section>' : '') +
            '<section class="host-sec"><h2>' + esc(t('Rooms you asked about')) + '</h2>' +
              (sent.length ? '<ul class="sent-list">' + sent.map(function (q) {
                return '<li><a href="/room/' + esc(q.listing_ref) + '" data-link><b>' + esc(q.listing_name || q.listing_ref) + '</b><span>' + esc([q.move_in ? t('Move-in: {m}', { m: q.move_in }) : '', t('Sent {date}', { date: new Date(q.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) })].filter(Boolean).join(' · ')) + '</span></a></li>';
              }).join('') + '</ul>' : '<p class="host-muted">' + esc(t('When you message a Keeper about a room, it shows here.')) + ' <a href="/rooms" data-link>' + esc(t('Find a room')) + '</a></p>') +
            '</section>' +
            (ECS.mode === 'demo' ? outboxHtml(out) : '') +
            '<section class="host-sec host-links">' + (p.role === 'admin' ? '<a href="/admin" data-link>' + H.icon('grid') + '<span>' + esc(t('Admin')) + '</span></a>' : '') + (p.role === 'admin' || ECS.mode === 'demo' ? '<a href="/host/review" data-link>' + H.icon('check') + '<span>' + esc(t(ECS.mode === 'demo' ? 'Review queue (try the reviewer side)' : 'Review listings')) + '</span></a>' : '') + '<a href="/host/profile" data-link>' + H.icon('user') + '<span>' + esc(t('Your details')) + '</span></a>' +
              '<a href="/listing-standards" data-link>' + H.icon('shield') + '<span>' + esc(t('Keeper standards')) + '</span></a>' +
              '<a href="/help" data-link>' + H.icon('info') + '<span>' + esc(t('Help')) + '</span></a></section>' +
          '</div>';
        bindDashboard(host);
      }).catch(function (x) { host.innerHTML = HV.demoBar() + '<div class="host-wrap"><p class="host-error">' + esc(x.message) + '</p></div>'; });
    });
  };

  function listingRow(l) {
    var st = STATUS[l.status] || STATUS.draft, cover = l.photos && l.photos[0];
    var price = ECS.priceFrom(l);
    var actions = [];
    if (l.status === 'draft' || l.status === 'changes') actions.push('<a class="btn btn-primary btn-sm" href="/host/edit/' + l.id + '" data-link>' + esc(t(l.status === 'draft' ? 'Continue' : 'Update listing')) + '</a>');
    else actions.push('<a class="btn btn-ghost btn-sm" href="/host/edit/' + l.id + '" data-link>' + esc(t('Edit')) + '</a>');
    if (l.status === 'live') actions.push('<button type="button" class="btn btn-ghost btn-sm" data-pause="' + l.id + '">' + esc(t('Pause')) + '</button>');
    if (l.status === 'paused') actions.push('<button type="button" class="btn btn-ghost btn-sm" data-unpause="' + l.id + '">' + esc(t('Show again')) + '</button>');
    if (l.status === 'draft') actions.push('<button type="button" class="btn-link hl-del" data-del="' + l.id + '">' + esc(t('Delete draft')) + '</button>');
    return '<li class="hl">' +
      '<div class="hl-img">' + (cover ? '<img src="' + esc(photoUrl(cover)) + '" alt="" loading="lazy">' : H.icon('home')) + '</div>' +
      '<div class="hl-b">' +
        '<p class="hl-st ' + st.cls + '"><i></i>' + esc(t(st.label)) + '</p>' +
        '<h3>' + esc(l.name || t('Untitled listing')) + '</h3>' +
        '<p class="hl-meta">' + esc([l.area, price ? t('from {p} a month', { p: H.peso(price) }) : ''].filter(Boolean).join(' · ')) + '</p>' +
        '<p class="hl-note">' + esc(statusNote(l)) + '</p>' +
        (l.status === 'draft' ? '<div class="hl-bar" aria-hidden="true"><i style="width:' + Math.round(ECS.stepsDone(l) / 6 * 100) + '%"></i></div>' : '') +
      '</div>' +
      '<div class="hl-act">' + actions.join('') + '</div>' +
    '</li>';
  }

  function inqRow(q, byId) {
    var l = byId[q.listing_id];
    var sms = 'sms:' + (q.renter_mobile || '');
    return '<li class="inq"><div class="inq-top"><b>' + esc(q.renter_name) + '</b><span>' + esc(new Date(q.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })) + '</span></div>' +
      '<p class="inq-meta">' + esc([l ? l.name : q.listing_name, q.move_in ? t('Move-in: {m}', { m: q.move_in }) : ''].filter(Boolean).join(' · ')) + '</p>' +
      (q.message ? '<p class="inq-msg">' + esc(q.message) + '</p>' : '') +
      '<div class="inq-act"><a class="btn btn-primary btn-sm" href="' + esc(sms) + '">' + H.icon('message') + '<span>' + esc(t('Text {m}', { m: ECS.showMobile(q.renter_mobile) })) + '</span></a>' +
      '<a class="btn btn-ghost btn-sm" href="tel:' + esc(q.renter_mobile || '') + '">' + H.icon('phone') + '<span>' + esc(t('Call')) + '</span></a></div></li>';
  }

  /* Demo only: the emails the service would have sent, openable as they would look. */
  function outboxHtml(out) {
    return '<section class="host-sec"><h2>' + esc(t('Emails in this demo')) + '</h2>' +
      (out.length ? '<p class="host-muted">' + esc(t('On the real service these go to the inbox. Here you can open them as they would look.')) + '</p><ul class="outbox">' + out.map(function (m) {
        return '<li><span>' + H.icon('message') + '</span><div><b>' + esc(EMAIL_NAMES[m.template] || m.template) + '</b><small>' + esc(m.to) + ' · ' + esc(new Date(m.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })) + '</small></div>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-email="' + esc(m.id) + '">' + esc(t('Open')) + '</button></li>';
      }).join('') + '</ul>' : '<p class="host-muted">' + esc(t('None yet.')) + '</p>') + '</section>';
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

  function bindDashboard(host) {
    host.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-pause]'))) ECS.setPaused(b.getAttribute('data-pause'), true).then(function () { H.toast(t('Paused. It no longer shows in search.')); HV.dashboard(host); }).catch(function (x) { H.toast(x.message); });
      else if ((b = e.target.closest('[data-unpause]'))) ECS.setPaused(b.getAttribute('data-unpause'), false).then(function () { H.toast(t('Your listing shows in search again.')); HV.dashboard(host); }).catch(function (x) { H.toast(x.message); });
      else if ((b = e.target.closest('[data-del]'))) {
        if (!window.confirm(t('Delete this draft? This cannot be undone.'))) return;
        ECS.deleteListing(b.getAttribute('data-del')).then(function () { H.toast(t('Draft deleted.')); HV.dashboard(host); }).catch(function (x) { H.toast(x.message); });
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
              : '<a class="auth-back" href="/host" data-link>' + H.icon('arrow-left') + '<span>' + esc(t('Your listings')) + '</span></a><h1>' + esc(t('Your details')) + '</h1>') +
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
      }).catch(function (x) { host.innerHTML = HV.demoBar() + '<div class="host-wrap"><p class="host-error">' + esc(x.message) + '</p><a class="btn btn-ghost" href="/host" data-link>' + esc(t('Back to your listings')) + '</a></div>'; });
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
          '<aside class="ed-side"><a class="auth-back" href="/host" data-link>' + H.icon('arrow-left') + '<span>' + esc(t('Your listings')) + '</span></a>' +
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
        return '<h1>' + esc(t('Photos')) + '</h1><p class="ed-help">' + esc(t('Add at least 5 recent photos in daylight: each room type, the bed, the CR, the study area and the outside of the house. The first photo is the cover.')) + '</p>' +
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
          n.textContent = ph.length >= 5 ? t('{n} photos', { n: ph.length }) : t('{n} of at least 5 photos', { n: ph.length });
        }
        paint();
        input.addEventListener('change', function () {
          var files = Array.prototype.slice.call(input.files || []).slice(0, 20 - (l.photos || []).length);
          if (!files.length) return;
          err(e, '');
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
      flush().then(function () {
        if (l.status === 'live' || l.status === 'paused' || l.status === 'review') return l; // the service sends edits back to review
        return ECS.submitListing(l.id);
      }).then(function () {
        H.toast(t('Sent for review. We\'ll email you when it\'s live.'));
        HV.leave(); go('/host');
      }).catch(function (x) { busy(btn, false); var e = $('.ed-form .field-err', host); if (e) err(e, x.message); });
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
          '<h3>' + esc(t('Message sent')) + '</h3><p>' + esc(l.sample ? t('The ECStay team will reply by text or call soon.') : t('The Keeper will reply by text or call. We\'ve also sent it to their email.')) + '</p>' +
          '<p class="fine">' + esc(t('Stay safe: see the room in person before paying anything, and get a receipt.')) + '</p></div>';
        $('.dlg-foot', root).innerHTML = '<button type="button" class="btn btn-ghost btn-block" data-close>' + esc(t('Done')) + '</button>';
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

  /* ================= /host/review: approve listings (admins; anyone in the demo) ================= */
  HV.review = function (host) {
    needUser(host, function () {
      Promise.all([ECS.profile().catch(function () { return {}; }), ECS.reviewQueue()]).then(function (r) {
        var p = r[0] || {}, q = r[1] || [];
        if (ECS.mode === 'live' && p.role !== 'admin') { go('/host'); return; }
        host.innerHTML = HV.demoBar() + '<div class="host-wrap">' +
          '<a class="auth-back" href="/host" data-link>' + H.icon('arrow-left') + '<span>' + esc(t('Your listings')) + '</span></a>' +
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
