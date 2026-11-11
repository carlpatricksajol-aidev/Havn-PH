/* ECStay — room page: gallery, details, exact-location map, contact. */
(function () {
  var R = (window.RoomView = {});
  var roomMap = null, io = null;

  function $(sel, root) { return (root || document).querySelector(sel); }

  R.destroy = function () {
    if (io) { io.disconnect(); io = null; }
    if (roomMap) { roomMap.destroy(); roomMap = null; }
    var r = document.querySelector('meta[name="robots"]'); if (r) r.setAttribute('content', 'index, follow');
    var c = document.querySelector('link[rel="canonical"]'); if (c) c.setAttribute('href', HAVN_CONFIG.siteUrl + '/');
  };

  function setMeta(title, desc, path, noindex) {
    document.title = title;
    var r = document.querySelector('meta[name="robots"]');
    if (noindex && !r) { r = document.createElement('meta'); r.name = 'robots'; document.head.appendChild(r); }
    if (r) r.setAttribute('content', noindex ? 'noindex' : 'index, follow');
    var m = document.querySelector('meta[name="description"]'); if (m) m.setAttribute('content', desc);
    var c = document.querySelector('link[rel="canonical"]'); if (c) c.setAttribute('href', HAVN_CONFIG.siteUrl + path);
  }

  R.render = function (host, l) {
    R.destroy();
    if (!l) {
      host.innerHTML = '<div class="room-missing">' +
        '<h1>' + H.esc(t('Room not found')) + '</h1><p>' + H.esc(t('This room may have been removed.')) + '</p>' +
        '<a class="btn btn-primary" href="/rooms" data-link data-home>' + H.esc(t('Back to all rooms')) + '</a></div>';
      setMeta(t('Room not found') + ' · ECStay', '', '/');
      return;
    }
    var near = H.schoolsByDistance(l);
    var adv = l.advance == null ? 1 : l.advance, dep = l.deposit == null ? 1 : l.deposit;
    var saved = H.saved.has(l.id);
    var bath = l.bath === 'own' ? t('Own CR') : t('Shared CR');
    var gmaps = 'https://www.google.com/maps/search/?api=1&query=' + l.lat + '%2C' + l.lng;
    var sameArea = HAVN_LISTINGS.filter(function (x) { return x.id !== l.id; })
      .sort(function (a, b) {
        var fa = a.status === 'full' ? 1 : 0, fb = b.status === 'full' ? 1 : 0;
        return (fa - fb) || (H.km(a, l) - H.km(b, l));
      }).slice(0, 3);

    var photos = l.photos.map(function (p, i) {
      return '<button type="button" class="g-item" data-photo="' + i + '" aria-label="' + H.esc(t('Photo {i} of {n}', { i: i + 1, n: l.photos.length })) + '">' +
        '<img src="' + H.photo(p, i === 0 ? 1200 : 640) + '" srcset="' + H.photo(p, 640) + ' 640w, ' + H.photo(p, 1200) + ' 1200w" sizes="' + (i === 0 ? '(min-width: 1024px) 50vw, 100vw' : '(min-width: 1024px) 25vw, 100vw') + '" width="640" height="480" alt="" ' +
        (i === 0 ? 'fetchpriority="high"' : 'loading="lazy"') + ' decoding="async"></button>';
    }).join('');

    var amen = l.amenities.map(function (k) {
      var a = HAVN_AMENITIES[k]; if (!a) return '';
      return '<li>' + H.icon(a.icon) + '<span>' + H.esc(t(a.label)) + '</span></li>';
    }).join('');

    var dist = near.slice(0, 3).map(function (d) {
      var min = H.walkMin(d.km);
      return '<li>' + H.icon('cap') + '<span><b>' + H.esc(d.school.short) + '</b> <small>' + H.esc(d.school.name) + '</small></span>' +
        '<em>' + (min <= 25 ? H.esc(t('{n} min walk', { n: min })) : d.km.toFixed(1) + ' km') + '</em></li>';
    }).join('');

    host.innerHTML =
      '<article class="room">' +
        (window.HavnBackLink ? window.HavnBackLink() : '') +
        '<div class="room-head">' +
          '<div><h1>' + H.esc(l.name) + (l.sample ? ' <span class="tag">' + H.esc(t('Sample')) + '</span>' : '') + '</h1>' +
          '<p class="room-sub">' + H.icon('pin') + '<span>' + H.esc([l.street, l.area, 'Davao City'].filter(Boolean).join(', ')) + '</span></p></div>' +
          '<div class="room-actions">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-share>' + H.icon('share') + '<span>' + H.esc(t('Share')) + '</span></button>' +
            '<button type="button" class="btn btn-ghost btn-sm save-btn" data-save="' + l.id + '" aria-pressed="' + saved + '">' + H.icon('heart') + '<span data-save-label>' + H.esc(saved ? t('Saved') : t('Save')) + '</span></button>' +
          '</div>' +
        '</div>' +
        '<div class="gallery" data-slides data-n="' + Math.min(l.photos.length, 3) + '">' +
          '<div class="slides">' + photos + '</div>' +
          '<span class="g-count" data-count aria-hidden="true">1 / ' + l.photos.length + '</span>' +
          '<button type="button" class="btn btn-ghost btn-sm g-all" data-photo="0"><span>' + H.esc(t('See all {n} photos', { n: l.photos.length })) + '</span></button>' +
        '</div>' +
        '<div class="room-cols">' +
          '<div class="room-main">' +
            '<section class="room-intro">' +
              '<h2>' + H.esc(t('{type} in {area}', { type: t(l.type), area: l.area })) + '</h2>' +
              '<p class="room-specs">' + H.esc([l.size ? l.size + ' m²' : '', bath, H.genderLabel(l.gender)].filter(Boolean).join(' · ')) + '</p>' +
              '<ul class="badges">' +
                '<li class="b-school">' + H.icon('walk') + H.esc(H.nearText(l, App.placeSchoolId())) + '</li>' +
                '<li class="b-status s-' + l.status + '"><i aria-hidden="true"></i>' + H.esc(H.statusLabel(l)) + '</li>' +
              '</ul>' +
            '</section>' +
            '<section class="room-sec"><h2>' + H.esc(t('About this room')) + '</h2><p class="room-desc">' + H.esc(l.desc) + '</p></section>' +
            '<section class="room-sec"><h2>' + H.esc(t('What\'s included')) + '</h2><ul class="amenities">' + amen + '</ul></section>' +
            '<section class="room-sec"><h2>' + H.esc(t('House rules')) + '</h2><dl class="rules">' +
              '<div>' + H.icon('clock') + '<dt>' + H.esc(t('Curfew')) + '</dt><dd>' + H.esc(l.rules.curfew || t('No curfew')) + '</dd></div>' +
              '<div>' + H.icon('door') + '<dt>' + H.esc(t('Visitors')) + '</dt><dd>' + H.esc(l.rules.visitors) + '</dd></div>' +
              '<div>' + H.icon('utensils') + '<dt>' + H.esc(t('Cooking')) + '</dt><dd>' + H.esc(l.rules.cooking) + '</dd></div>' +
              '<div>' + H.icon('user') + '<dt>' + H.esc(t('Who can stay')) + '</dt><dd>' + H.esc(H.genderLabel(l.gender)) + '</dd></div>' +
            '</dl></section>' +
            '<section class="room-sec" id="where"><h2>' + H.esc(t('Where you will live')) + '</h2>' +
              '<p class="room-addr">' + H.esc([l.street, l.area, 'Davao City'].filter(Boolean).join(', ')) + '</p>' +
              '<div class="room-map map" id="rmap"><div class="map-loading"></div></div>' +
              '<a class="ext-link" href="' + gmaps + '" target="_blank" rel="noopener">' + H.icon('external') + H.esc(t('Open in Google Maps')) + '</a>' +
              '<h3>' + H.esc(t('Distance to schools')) + '</h3><ul class="dist">' + dist + '</ul>' +
            '</section>' +
            '<section class="room-sec host"><span class="avatar" aria-hidden="true">' + H.esc(initials(l.host.name)) + '</span>' +
              '<div><b>' + H.esc(t('Keeper')) + ': ' + H.esc(l.host.name) + '</b><span>' + H.esc(t('Renting out since {year}', { year: l.host.since })) + '</span></div></section>' +
          '</div>' +
          '<aside class="room-side"><div class="price-card">' +
            '<p class="pc-price"><b>' + H.peso(l.price) + '</b> ' + H.esc(t('/ month')) + '</p>' +
            '<p class="pc-status s-' + l.status + '"><i aria-hidden="true"></i>' + H.esc(H.statusLabel(l)) + '</p>' +
            '<dl class="pc-costs">' +
              '<div><dt>' + H.esc(t('Monthly rent')) + '</dt><dd>' + H.peso(l.price) + '</dd></div>' +
              (adv ? '<div><dt>' + H.esc(t('1 month advance')) + '</dt><dd>' + H.peso(l.price * adv) + '</dd></div>' : '') +
              (dep ? '<div><dt>' + H.esc(t('1 month deposit')) + '</dt><dd>' + H.peso(l.price * dep) + '</dd></div>' : '') +
              '<div class="total"><dt>' + H.esc(t('Move-in total')) + '</dt><dd>' + H.peso(l.price * (adv + dep)) + '</dd></div>' +
            '</dl>' +
            '<p class="pc-bills">' + H.icon('zap') + '<span><b>' + H.esc(t('Bills')) + ':</b> ' + H.esc(l.bills) + '</span></p>' +
            '<button type="button" class="btn btn-primary btn-block" data-contact>' + H.icon('message') + '<span>' + H.esc(t('Contact Keeper')) + '</span></button>' +
            '<p class="pc-note">' + H.esc(t('ECStay is free for renters. You pay the Keeper directly, only after you see the room.')) + '</p>' +
          '</div></aside>' +
        '</div>' +
        '<section class="similar"><h2>' + H.esc(t('Similar rooms nearby')) + '</h2><div class="grid">' +
          sameArea.map(function (x) { return App.cardHtml(x, false); }).join('') + '</div></section>' +
        '<div class="contact-bar">' +
          '<div><b>' + H.peso(l.price) + '</b> ' + H.esc(t('/ month')) + '<span class="cb-status s-' + l.status + '">' + H.esc(H.statusLabel(l)) + '</span></div>' +
          '<button type="button" class="btn btn-primary" data-contact>' + H.esc(t('Contact Keeper')) + '</button>' +
        '</div>' +
      '</article>';

    H.bindSlides(host);
    host.onclick = function (e) {
      var ph = e.target.closest('[data-photo]');
      if (ph) { openViewer(l, +ph.getAttribute('data-photo')); return; }
      if (e.target.closest('[data-share]')) { H.share(location.href, l.name + ' · ECStay'); return; }
      if (e.target.closest('[data-contact]')) { openContact(l); }
    };

    var mapEl = $('#rmap', host);
    var start = function () {
      HavnMap.room(mapEl, l).then(function (m) {
        roomMap = m;
        var ld = $('.map-loading', mapEl); if (ld) ld.remove();
      }).catch(function () {
        mapEl.innerHTML = '<div class="map-error">' + H.icon('map') + '<p>Map could not load. Check your connection.</p></div>';
      });
    };
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { io.disconnect(); io = null; start(); }
      }, { rootMargin: '400px 0px' });
      io.observe(mapEl);
    } else start();

    var nearName = near[0].school.short;
    setMeta(l.name + ' · ' + t(l.type) + ' near ' + nearName + ' · ECStay',
      t(l.type) + ' in ' + l.area + ', Davao City. ' + H.peso(l.price) + ' a month. ' + l.desc,
      '/room/' + l.id, !!l.sample);
  };

  function initials(name) {
    var w = name.replace(/^(Tita|Tito|Ate|Kuya|Nanay|Nay|Sir|Ms\.|Mr\.|Engr\.|Arch\.|Doc)\s+/i, '').split(/\s+/);
    return (w[0] || '?').charAt(0).toUpperCase();
  }

  /* ---------- Full-screen photo viewer ---------- */
  function openViewer(l, start) {
    var opener = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'viewer';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', l.name);
    wrap.innerHTML =
      '<div class="viewer-top"><span class="viewer-count" aria-live="polite"></span>' +
      '<button type="button" class="icon-btn icon-btn-dark" data-x aria-label="' + H.esc(t('Close')) + '">' + H.icon('x') + '</button></div>' +
      '<div class="viewer-track">' + l.photos.map(function (p) {
        return '<figure><img src="' + H.photo(p, 1200) + '" width="1200" height="900" alt="" loading="lazy" decoding="async"></figure>';
      }).join('') + '</div>' +
      '<button type="button" class="viewer-nav prev icon-btn icon-btn-dark" data-v="-1" aria-label="' + H.esc(t('Previous photo')) + '">' + H.icon('chev-left') + '</button>' +
      '<button type="button" class="viewer-nav next icon-btn icon-btn-dark" data-v="1" aria-label="' + H.esc(t('Next photo')) + '">' + H.icon('chev-right') + '</button>';
    document.body.appendChild(wrap);
    H.lockScroll(true);
    var track = $('.viewer-track', wrap), count = $('.viewer-count', wrap), n = l.photos.length;
    var idx = function () { return Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); };
    var paint = function () { count.textContent = t('Photo {i} of {n}', { i: idx() + 1, n: n }); };
    var go = function (i, smooth) { track.scrollTo({ left: Math.max(0, Math.min(n - 1, i)) * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' }); };
    requestAnimationFrame(function () { go(start, false); paint(); wrap.classList.add('open'); });
    track.addEventListener('scroll', function () { requestAnimationFrame(paint); }, { passive: true });
    function close() {
      document.removeEventListener('keydown', key);
      H.lockScroll(false);
      wrap.remove();
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    }
    function key(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(idx() + 1, true);
      else if (e.key === 'ArrowLeft') go(idx() - 1, true);
      else if (e.key === 'Tab') H.trap(e, wrap);
    }
    document.addEventListener('keydown', key);
    wrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-x]')) close();
      var v = e.target.closest('[data-v]'); if (v) go(idx() + Number(v.getAttribute('data-v')), true);
    });
    $('[data-x]', wrap).focus();
  }

  /* ---------- Contact Landlord ---------- */
  function months() {
    var out = [], d = new Date();
    d.setDate(1);
    for (var i = 0; i < 5; i++) {
      out.push(d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }));
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }

  function openContact(l) {
    if (window.ECS && ECS.enabled() && window.HostView) { HostView.inquire(l); return; }
    var ms = months();
    var near = H.nearName(l);
    var msg = function (m) {
      return t('Hi ECStay! I\'m interested in {name} ({type}, {price}/month) near {near}. Move-in: {month}. Is it still available?',
        { name: l.name, type: t(l.type), price: H.peso(l.price), near: near, month: m }) + '\n' + HAVN_CONFIG.siteUrl + '/room/' + l.id;
    };
    var first = ms[1];
    var dlg = H.dialog({
      title: t('Ask about {name}', { name: l.name }),
      className: 'sheet contact',
      body:
        (l.sample ? '<p class="note-box">' + H.icon('info') + '<span>' + H.esc(t('This is a sample listing. Your message goes to the ECStay team, who can point you to real rooms like it.')) + '</span></p>' : '') +
        '<label class="field"><span>' + H.esc(t('Move-in month')) + '</span><select id="c-month">' +
          ms.map(function (m, i) { return '<option' + (i === 1 ? ' selected' : '') + '>' + H.esc(m) + '</option>'; }).join('') +
          '<option value="">' + H.esc(t('Not sure yet')) + '</option></select></label>' +
        '<label class="field"><span>' + H.esc(t('Your message')) + '</span><textarea id="c-msg" rows="5">' + H.esc(msg(first)) + '</textarea></label>' +
        '<p class="fine">' + H.esc(t('This opens Messenger with your message copied. Nothing is sent until you press send there.')) + '</p>',
      foot:
        '<button type="button" class="btn btn-ghost" data-c-copy aria-label="' + H.esc(t('Copy message')) + '">' + H.icon('copy') + '<span class="copy-lbl">' + H.esc(t('Copy message')) + '</span></button>' +
        '<a class="btn btn-primary" data-c-send target="_blank" rel="noopener" href="' + H.esc(H.messengerUrl(msg(first))) + '">' + H.icon('message') + '<span>' + H.esc(t('Send on Messenger')) + '</span></a>',
      focus: '#c-month',
    });
    var root = dlg.el, ta = $('#c-msg', root), send = $('[data-c-send]', root), edited = false;
    var sync = function () { send.href = H.messengerUrl(ta.value); };
    ta.addEventListener('input', function () { edited = true; sync(); });
    $('#c-month', root).addEventListener('change', function (e) {
      if (!edited) { ta.value = msg(e.target.value || t('Not sure yet')); sync(); }
    });
    $('[data-c-copy]', root).addEventListener('click', function () {
      H.copy(ta.value).then(function () { H.toast(t('Message copied. Paste it in Messenger.')); });
    });
    send.addEventListener('click', function () {
      H.copy(ta.value).then(function () { H.toast(t('Message copied. Paste it in Messenger.')); });
    });
  }
})();
