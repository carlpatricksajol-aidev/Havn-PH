/* Havn PH — home page: room-type tabs + search (with Kapi the capybara), popular places,
 * rows of rooms, landlord band. 3D icons: Microsoft Fluent Emoji (MIT, /assets/3d/LICENSE). */
(function () {
  var HV = (window.HomeView = {});

  function i3(name, size, eager) {
    return '<img class="i3" src="/assets/3d/' + name + '.webp" width="' + (size || 48) + '" height="' + (size || 48) + '" alt=""' +
      (eager ? '' : ' loading="lazy"') + ' decoding="async">';
  }
  HV.i3 = i3;

  var TINTS = ['#EAF2FF', '#FFF1E6', '#E9F8EF', '#F2EDFF', '#FFF6D6', '#FDEAF1'];
  var KIND_ICON = { mall: 'bags', hospital: 'hospital', work: 'office' };

  // Room types as tabs (header on computers, under the search on phones).
  var TABS = [
    { icon: 'houses', label: 'All rooms', type: '' },
    { icon: 'bed', label: 'Bedspace', type: 'Bedspace' },
    { icon: 'couch', label: 'Shared room', type: 'Shared room' },
    { icon: 'door', label: 'Private room', type: 'Private room' },
    { icon: 'house', label: 'Studio', type: 'Studio' },
  ];
  HV.tabs = function (api, cls) {
    return '<nav class="tabs ' + (cls || '') + '" aria-label="' + H.esc(t('Room type')) + '">' + TABS.map(function (x) {
      var on = !x.type;
      return '<a class="tab' + (on ? ' on' : '') + '" href="' + (x.type ? api.url({ types: [x.type] }) : '/') + '" data-link' + (on ? ' aria-current="page"' : '') + '>' +
        i3(x.icon, 40, true) + '<span>' + H.esc(t(x.label)) + '</span></a>';
    }).join('') + '</nav>';
  };

  // The places shown on the home page (all landmarks can be searched).
  var POPULAR = ['gmall', 'sm-lanang', 'abreeza', 'nccc-vp', 'felcris', 'spmc', 'ddh', 'cybergate'];

  function rows() {
    var near = function (id) { var p = H.school(id); return { icon: p.kind ? KIND_ICON[p.kind] : 'cap', title: t('Rooms near {place}', { place: p.short }), s: { place: 'school:' + id }, school: id }; };
    return [
      near('gmall'),
      { icon: 'sparkles', title: t('Available now'), s: { avail: true } },
      near('nccc-vp'),
      { icon: 'coin', title: t('{p} a month and below', { p: H.peso(5000) }), s: { max: 5000, sort: 'low' } },
      near('addu'),
      { icon: 'bathtub', title: t('With their own CR'), s: { amen: ['own-cr'] } },
    ];
  }

  function nearbyText(n) { return !n ? t('No rooms nearby yet') : n === 1 ? t('1 room nearby') : t('{n} rooms nearby', { n: n }); }

  function top(api) {
    return '<section class="top" aria-labelledby="top-t"><div class="top-in">' +
      '<div class="top-greet"><h1 id="top-t">' + H.esc(t('Find a room in Davao City')) + '</h1>' +
        '<p>' + H.esc(t('Boarding houses, bedspaces and rooms near malls, offices and schools.')) + '</p></div>' +
      '<div class="top-search">' + api.searchHtml + '</div>' +
      HV.tabs(api, 'tabs-band') +
      '<div class="capy" data-capy aria-hidden="true">' +
        '<span class="capy-bubble">' + H.esc(t('Hi! Looking for a room?')) + '</span>' +
        '<img class="capy-still" src="/assets/capy/kapi.webp" width="360" height="360" alt="" fetchpriority="low">' +
      '</div>' +
    '</div></section>';
  }

  function places(api) {
    return '<section class="h-sec" aria-labelledby="places-t"><div class="h-head"><h2 id="places-t">' + H.esc(t('Near popular places')) + '</h2></div>' +
      '<div class="places">' + POPULAR.map(function (id, i) {
        var p = H.school(id), n = api.count({ place: 'school:' + id });
        return '<a class="place-card" href="' + api.url({ place: 'school:' + id }) + '" data-link style="--tint:' + TINTS[i % TINTS.length] + '">' +
          i3(KIND_ICON[p.kind], 64) + '<span><b>' + H.esc(p.short) + '</b><small>' + H.esc(p.name) + '</small><em>' + H.esc(nearbyText(n)) + '</em></span></a>';
      }).join('') + '</div></section>';
  }

  function row(api, r, idx) {
    var list = api.list(r.s);
    if (list.length < 2) return '';
    return '<section class="hrow" aria-labelledby="row-' + idx + '">' +
      '<div class="h-head">' + i3(r.icon, 36) + '<h2 id="row-' + idx + '">' + H.esc(r.title) + '</h2>' +
        '<a class="hrow-all" href="' + api.url(r.s) + '" data-link>' + H.esc(t('See all')) + H.icon('arrow-right') + '</a>' +
        '<div class="hrow-nav"><button type="button" class="hrow-btn" data-row-step="-1" aria-label="' + H.esc(t('Previous')) + '">' + H.icon('chev-left') + '</button>' +
        '<button type="button" class="hrow-btn" data-row-step="1" aria-label="' + H.esc(t('Next')) + '">' + H.icon('chev-right') + '</button></div>' +
      '</div>' +
      '<div class="hrow-track">' + list.map(function (l) { return api.card(l, false, { single: true, school: r.school }); }).join('') + '</div>' +
    '</section>';
  }

  function kapiStill() {
    return '<img class="capy-still" src="/assets/capy/kapi.webp" width="360" height="360" alt="" loading="lazy">';
  }

  /* A note from Kapi, with Kapi leaning in from the edge of the screen. */
  function kapiNote() {
    return '<section class="kapi-note" aria-labelledby="note-t"><div class="note-in">' +
        '<div class="note-card">' +
          '<h2 id="note-t" class="note-hi">' + H.esc(t('Hi, I\'m Kapi!')) + '</h2>' +
          '<p class="note-text">' + H.esc(t('Tell me where you study, work or shop, and I\'ll show you rooms nearby, with photos, the price and the exact spot on the map.')) + '</p>' +
          '<p class="note-sign">— Kapi</p>' +
        '</div>' +
        '<button type="button" class="btn btn-primary btn-lg" data-find>' + H.icon('search') + '<span>' + H.esc(t('Start searching')) + '</span></button>' +
      '</div>' +
      '<div class="capy capy-peek" data-capy="peek" aria-hidden="true">' + kapiStill() + '</div>' +
    '</section>';
  }

  /* The closing scene: Davao hills with Kapi's friends painted in (tarsier on the tree, carabao reading,
   * kitten behind the bush, eagle chick on a branch) and Kapi cheering on the grass. */
  function scene() {
    return '<section class="scene" aria-labelledby="scene-t">' +
      '<div class="scene-art" aria-hidden="true">' +
        '<img class="scene-bg" src="/assets/scene/davao-friends-1280.webp" srcset="/assets/scene/davao-friends-1280.webp 1280w, /assets/scene/davao-friends-2400.webp 2400w" sizes="(max-width: 1023px) 200vw, 100vw" width="2400" height="1029" alt="" loading="lazy" decoding="async">' +
        '<div class="capy capy-jump" data-capy="jump">' + kapiStill() + '</div>' +
      '</div>' +
      '<div class="scene-copy">' +
        '<h2 id="scene-t">' + H.esc(t('Find a home you\'ll love in Davao.')) + '</h2>' +
        '<div class="scene-btns">' +
          '<a class="btn btn-primary btn-lg" href="/rooms" data-link>' + H.esc(t('Find a room')) + '</a>' +
          '<a class="btn btn-light btn-lg" href="/list" data-ll-open>' + H.esc(t('List your place')) + '</a>' +
        '</div>' +
        '<p class="scene-sub">' + H.esc(t('Own a boarding house? List it on Havn so people nearby can find it.')) + '</p>' +
      '</div>' +
    '</section>';
  }

  HV.render = function (host, api) {
    host.innerHTML = '<div class="home">' + top(api) +
      '<div class="home-wrap">' +
        places(api) +
        '<div class="h-rows">' + api.sampleNote + rows().map(function (r, i) { return row(api, r, i); }).join('') + '</div>' +
      '</div>' +
      kapiNote() + scene() + api.footScene +
    '</div>';
    bindRows(host);
    startCapy(host);
    bindParallax(host);
  };

  /* Parallax: the landscape rises into place more slowly than the page scrolls, and the headline
   * drifts the other way, so the note above flows into the sky with no hard edge. */
  function bindParallax(host) {
    var sc = host.querySelector('.scene');
    if (!sc || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var art = sc.querySelector('.scene-art'), copy = sc.querySelector('.scene-copy'), queued = false;
    function update() {
      queued = false;
      if (!sc.isConnected) { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); return; }
      var r = sc.getBoundingClientRect(), vh = window.innerHeight;
      if (r.bottom < -50 || r.top > vh + 50) return;
      // 1 while the scene is still entering from below, 0 once its bottom reaches the bottom of the screen.
      var left = Math.max(0, Math.min(1, (r.bottom - vh) / r.height));
      var lift = Math.min(220, r.height * (window.innerWidth < 1024 ? 0.14 : 0.32));
      art.style.transform = 'translate3d(0,' + (left * lift).toFixed(1) + 'px,0)';
      copy.style.transform = 'translate3d(0,' + (-left * lift * 0.25).toFixed(1) + 'px,0)';
    }
    function onScroll() { if (!queued) { queued = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* Kapi the capybara: still pictures first, then the moving 3D Kapi when the browser can draw it.
   * The one at the top starts when the page is idle; the others when they come near the screen. */
  function startCapy(host) {
    var els = host.querySelectorAll('[data-capy]');
    if (!els.length) return;
    // The 3D model is about 1 MB: skip it on data saver or slow connections (the pictures stay).
    var net = navigator.connection;
    if (net && (net.saveData || /(^|-)2g|3g/.test(net.effectiveType || ''))) return;
    var c = document.createElement('canvas');
    var ok = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    if (!ok) return;
    var mod = null;
    var mount = function (el) {
      mod = mod || import('/assets/js/capy.js');
      mod.then(function (m) { m.mount(el); }).catch(function () { /* the still picture stays */ });
    };
    var first = els[0];
    if ('requestIdleCallback' in window) requestIdleCallback(function () { mount(first); }, { timeout: 1500 }); else setTimeout(function () { mount(first); }, 400);
    var rest = Array.prototype.slice.call(els, 1);
    if (!window.IntersectionObserver) { rest.forEach(mount); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); mount(e.target); } });
    }, { rootMargin: '400px 0px' });
    rest.forEach(function (el) { io.observe(el); });
  }

  /* Row arrows: scroll a page of cards; disabled at either end, hidden when everything fits. */
  function bindRows(host) {
    Array.prototype.forEach.call(host.querySelectorAll('.hrow'), function (sec) {
      var track = sec.querySelector('.hrow-track'), nav = sec.querySelector('.hrow-nav');
      var prev = sec.querySelector('[data-row-step="-1"]'), next = sec.querySelector('[data-row-step="1"]');
      function paint() {
        var max = track.scrollWidth - track.clientWidth;
        nav.hidden = max < 4;
        prev.disabled = track.scrollLeft < 4;
        next.disabled = track.scrollLeft > max - 4;
      }
      sec.addEventListener('click', function (e) {
        var b = e.target.closest('[data-row-step]'); if (!b) return;
        track.scrollBy({ left: +b.getAttribute('data-row-step') * track.clientWidth * 0.9, behavior: 'smooth' });
      });
      track.addEventListener('scroll', paint, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(paint).observe(track);
      paint();
    });
  }
})();
