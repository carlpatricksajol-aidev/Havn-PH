/* ECStay — home page: room-type tabs + search (with Kapi the capybara), popular places,
 * rows of rooms, and the closing cards + place links (the questions live in llms.txt). Line icons from the sprite in index.html. */
(function () {
  var HV = (window.HomeView = {});

  // A line icon in a round badge.
  function ic(name, cls) { return '<span class="' + cls + '" aria-hidden="true">' + H.icon(name) + '</span>'; }

  var KIND_ICON = { mall: 'bag', hospital: 'hospital', work: 'briefcase' };

  // Room types as tabs (header on computers, under the search on phones).
  var TABS = [
    { icon: 'grid', label: 'All rooms', type: '' },
    { icon: 'bed', label: 'Bedspace', type: 'Bedspace' },
    { icon: 'users', label: 'Shared room', type: 'Shared room' },
    { icon: 'door', label: 'Private room', type: 'Private room' },
    { icon: 'sofa', label: 'Studio', type: 'Studio' },
  ];
  HV.tabs = function (api, cls) {
    return '<nav class="tabs ' + (cls || '') + '" aria-label="' + H.esc(t('Room type')) + '">' + TABS.map(function (x) {
      var on = !x.type;
      return '<a class="tab' + (on ? ' on' : '') + '" href="' + (x.type ? api.url({ types: [x.type] }) : '/') + '" data-link' + (on ? ' aria-current="page"' : '') + '>' +
        H.icon(x.icon) + '<span>' + H.esc(t(x.label)) + '</span></a>';
    }).join('') + '</nav>';
  };

  function rows() {
    var near = function (id) { var p = H.school(id); return { icon: p.kind ? KIND_ICON[p.kind] : 'cap', title: t('Rooms near {place}', { place: p.short }), s: { place: 'school:' + id }, school: id }; };
    return [
      near('gmall'),
      { icon: 'sparkle', title: t('Available now'), s: { avail: true } },
      near('nccc-vp'),
      { icon: 'wallet', title: t('{p} a month and below', { p: H.peso(5000) }), s: { max: 5000, sort: 'low' } },
      near('addu'),
      { icon: 'bath', title: t('With their own CR'), s: { amen: ['own-cr'] } },
    ];
  }

  function top(api) {
    return '<section class="top" aria-labelledby="top-t"><div class="top-in">' +
      '<div class="top-greet">' +
        '<h1 id="top-t">' + H.esc(t('Boarding houses, bedspaces and rooms for rent in Davao City')) + '</h1></div>' +
      '<div class="top-search">' + api.searchHtml + '</div>' +
      HV.tabs(api, 'tabs-band') +
      '<div class="capy" data-capy aria-hidden="true">' +
        '<span class="capy-bubble">' + H.esc(t('Hi! Looking for a room?')) + '</span>' +
        '<img class="capy-still" src="/assets/capy/kapi.webp" width="360" height="360" alt="" fetchpriority="low">' +
      '</div>' +
    '</div></section>';
  }

  function row(api, r, idx) {
    var list = api.list(r.s);
    if (list.length < 2) return '';
    return '<section class="hrow" aria-labelledby="row-' + idx + '">' +
      '<div class="h-head">' + ic(r.icon, 'h-ic') + '<h2 id="row-' + idx + '">' + H.esc(r.title) + '</h2>' +
        '<a class="hrow-all" href="' + api.url(r.s) + '" data-link>' + H.esc(t('See all')) + H.icon('arrow-right') + '</a>' +
      '</div>' +
      '<div class="hrow-body">' +
        '<div class="hrow-nav"><button type="button" class="hrow-btn" data-row-step="-1" aria-label="' + H.esc(t('Previous')) + '">' + H.icon('chev-left') + '</button>' +
        '<button type="button" class="hrow-btn" data-row-step="1" aria-label="' + H.esc(t('Next')) + '">' + H.icon('chev-right') + '</button></div>' +
      '<div class="hrow-track">' + list.map(function (l) { return api.card(l, false, { single: true, school: r.school }); }).join('') + '</div>' +
    '</div></section>';
  }

  function kapiStill() {
    return '<img class="capy-still" src="/assets/capy/kapi.webp" width="360" height="360" alt="" loading="lazy">';
  }

  /* Closing section, in brand colors only: one card for renters (with Kapi), one for Keepers, then a plain
   * list of "Rooms near ..." links (the pattern rental sites end their home pages with; also crawlable). */
  function closing(api) {
    var places = HAVN_SCHOOLS.concat(window.HAVN_LANDMARKS || []);
    return '<section class="end" aria-label="' + H.esc(t('Get started')) + '">' +
      '<div class="end-cards">' +
        '<div class="end-card end-rent">' +
          '<div class="end-copy"><h2>' + H.esc(t('Looking for a room?')) + '</h2>' +
            '<p>' + H.esc(t('Search near your school or work, compare prices, and see the exact spot on the map.')) + '</p>' +
            '<a class="btn btn-primary btn-lg" href="/rooms" data-link>' + H.esc(t('Find a room')) + '</a></div>' +
          '<div class="capy end-kapi" data-capy="stand" aria-hidden="true">' + kapiStill() + '</div>' +
        '</div>' +
        '<div class="end-card end-keep">' +
          '<div class="end-copy"><h2>' + H.esc(t('Have a place to rent out?')) + '</h2>' +
            '<p>' + H.esc(t('Become a Keeper and open your door to students and young workers in Davao.')) + '</p>' +
            '<a class="btn btn-light btn-lg" href="/list" data-link>' + H.esc(t('Become a Keeper')) + '</a></div>' +
        '</div>' +
      '</div>' +
      '<nav class="end-links" aria-labelledby="end-links-t"><h2 id="end-links-t">' + H.esc(t('Browse rooms by place')) + '</h2><ul>' +
        places.map(function (p) {
          return '<li><a href="' + api.url({ place: 'school:' + p.id }) + '" data-link>' + H.esc(t('Rooms near {place}', { place: p.short })) + '</a></li>';
        }).join('') + '</ul></nav>' +
    '</section>';
  }

  HV.render = function (host, api) {
    host.innerHTML = '<div class="home">' + top(api) +
      '<div class="home-wrap">' +
        '<div class="h-rows">' + api.sampleNote + rows().map(function (r, i) { return row(api, r, i); }).join('') + '</div>' +
      '</div>' +
      closing(api) + api.footScene +
    '</div>';
    bindRows(host);
    startCapy(host);
  };

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
        // the arrows sit at the middle of the photos, on the left and right edges
        var media = sec.querySelector('.card-media'), body = sec.querySelector('.hrow-body');
        if (media && body) body.style.setProperty('--mid', (media.getBoundingClientRect().top - body.getBoundingClientRect().top + media.offsetHeight / 2) + 'px');
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
