/* ECStay — home page (v2, 20 Nov 2026): the evergreen door-panel hero (headline, search, Kapi in the doorway), three facts,
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

  /* The first screen: an evergreen "door" panel (the brand's deep colour, with brass as the accent): the brand line,
   * the keyword headline, one line on what the site does, the search, a few well-known places, and Kapi standing in
   * an arched doorway (the door in the logo). */
  var HERO_PLACES = ['gmall', 'sm-lanang', 'abreeza', 'addu', 'um', 'usep'];
  function top(api) {
    var near = HERO_PLACES.map(function (id) { return H.school(id); }).filter(Boolean);
    return '<section class="top hero" aria-labelledby="top-t"><div class="top-in">' +
      '<div class="top-copy">' +
        '<p class="hero-eyebrow">' + H.esc(t('Explore. Come. Stay.')) + '</p>' +
        '<h1 id="top-t">' + H.esc(t('Boarding houses, bedspaces and rooms for rent in Davao City')) + '</h1></div>' +
      '<p class="hero-sub">' + H.esc(t('Find a place near your school or work, with the walking time, the monthly price and the exact spot on the map.')) + '</p>' +
      '<div class="hero-stage" aria-hidden="true"><span class="hero-arch"></span>' +
        '<div class="capy" data-capy>' +
          '<span class="capy-bubble">' + H.esc(t('Hi! Looking for a room?')) + '</span>' +
          '<img class="capy-still" src="/assets/capy/kapi.webp" width="360" height="360" alt="" fetchpriority="low">' +
        '</div></div>' +
      '<div class="top-search">' + api.searchHtml + '</div>' +
      (near.length ? '<p class="hero-near"><span>' + H.esc(t('Rooms near')) + '</span>' + near.map(function (p) {
        return '<a href="' + api.url({ place: 'school:' + p.id }) + '" data-link>' + H.esc(p.short) + '</a>';
      }).join('') + '</p>' : '') +
    '</div></section>' +
    HV.tabs(api, 'tabs-band');
  }

  /* Three plain facts about how ECStay works (each one true of every listing), in one slim row. */
  function facts() {
    var f = function (icon, title, text) { return '<li>' + ic(icon, 'hf-ic') + '<div><b>' + H.esc(t(title)) + '</b><span>' + H.esc(t(text)) + '</span></div></li>'; };
    return '<ul class="h-facts" aria-label="' + H.esc(t('How ECStay works')) + '">' +
      f('walk', 'Walking time, in minutes', 'Every room shows how far it is on foot from your school, mall or office.') +
      f('pin', 'The exact spot on the map', 'See where the place really is before you go.') +
      f('shield', 'See the room first, then pay', 'ECStay is free for renters. You pay the Keeper directly, only after you see the room.') +
    '</ul>';
  }

  function rowHtml(api, r, idx, list, few) {
    return '<section class="hrow' + (few ? ' few' : '') + '" aria-labelledby="row-' + idx + '">' +
      '<div class="h-head">' + ic(r.icon, 'h-ic') + '<h2 id="row-' + idx + '">' + H.esc(r.title) + '</h2>' +
        '<a class="hrow-all" href="' + api.url(r.s) + '" data-link>' + H.esc(t('See all')) + H.icon('arrow-right') + '</a>' +
      '</div>' +
      '<div class="hrow-body">' +
        '<div class="hrow-nav"><button type="button" class="hrow-btn" data-row-step="-1" aria-label="' + H.esc(t('Previous')) + '">' + H.icon('chev-left') + '</button>' +
        '<button type="button" class="hrow-btn" data-row-step="1" aria-label="' + H.esc(t('Next')) + '">' + H.icon('chev-right') + '</button></div>' +
      '<div class="hrow-track">' + list.map(function (l) { return api.card(l, false, { single: true, school: r.school }); }).join('') + '</div>' +
    '</div></section>';
  }

  /* The rooms. With only a handful listed, one row shows them all once (several rows would repeat the same rooms).
   * With many, themed rows; a row is left out when every room in it was already shown above it. With none yet,
   * a short note instead of an empty page. */
  function rooms(api) {
    var all = api.list({});
    if (!all.length) {
      return '<section class="h-empty">' + ic('home', 'h-ic') + '<div><h2>' + H.esc(t('The first boarding houses are being added')) + '</h2>' +
        '<p>' + H.esc(t('We review every listing before it goes live. Have a place to rent out? You can list it now.')) + '</p></div>' +
        '<a class="btn btn-primary" href="/list" data-link>' + H.esc(t('Become a Keeper')) + '</a></section>';
    }
    if (all.length <= 8) return rowHtml(api, { icon: 'home', title: t('Rooms in Davao City'), s: {} }, 0, all, true);
    var seen = {};
    return rows().map(function (r, i) {
      var list = api.list(r.s);
      if (list.length < 2) return '';
      var shown = list.slice(0, 8), fresh = shown.filter(function (l) { return !seen[l.id]; }).length;
      if (!fresh) return '';
      shown.forEach(function (l) { seen[l.id] = true; });
      return rowHtml(api, r, i, list, false);
    }).join('');
  }

  function kapiStill() {
    return '<img class="capy-still" src="/assets/capy/kapi.webp" width="360" height="360" alt="" loading="lazy">';
  }

  /* The close: one band for Keepers (Kapi at an evergreen door: "Open your door."), then a plain list of
   * "Rooms near ..." links (the pattern rental sites end their home pages with; also crawlable). */
  function closing(api) {
    var places = HAVN_SCHOOLS.concat(window.HAVN_LANDMARKS || []);
    var pt = function (text) { return '<li>' + H.icon('check') + '<span>' + H.esc(t(text)) + '</span></li>'; };
    return '<section class="end" aria-label="' + H.esc(t('For Keepers')) + '">' +
      '<div class="end-door">' +
        '<div class="end-copy"><p class="hero-eyebrow">' + H.esc(t('For Keepers')) + '</p>' +
          '<h2>' + H.esc(t('Have a place to rent out?')) + ' <em>' + H.esc(t('Open your door.')) + '</em></h2>' +
          '<p>' + H.esc(t('Become a Keeper and open your door to students and young workers in Davao.')) + '</p>' +
          '<ul class="end-points">' + pt('Free to list') + pt('About 10 minutes') + pt('We review every listing') + '</ul>' +
          '<a class="btn btn-primary btn-lg" href="/list" data-link>' + H.esc(t('Become a Keeper')) + '</a></div>' +
        '<div class="end-stage" aria-hidden="true"><span class="hero-arch door"></span>' +
          '<div class="capy end-kapi" data-capy="stand">' + kapiStill() + '</div></div>' +
      '</div>' +
      '<nav class="end-links" aria-labelledby="end-links-t"><h2 id="end-links-t">' + H.esc(t('Browse rooms by place')) + '</h2><ul>' +
        places.map(function (p) {
          return '<li><a href="' + api.url({ place: 'school:' + p.id }) + '" data-link>' + H.esc(t('Rooms near {place}', { place: p.short })) + '</a></li>';
        }).join('') + '</ul></nav>' +
    '</section>';
  }

  HV.render = function (host, api) {
    host.innerHTML = '<div class="home">' + top(api) +
      '<div class="home-wrap">' + facts() +
        '<div class="h-rows">' + api.sampleNote + rooms(api) + '</div>' +
      '</div>' +
      closing(api) + api.footScene +
    '</div>';
    bindRows(host);
    startCapy(host);
  };

  /* Kapi the capybara: the painted picture first, then the moving 3D Kapi when the browser can draw it. Since
   * 19 Nov 2026 the 3D Kapi is made from that same picture (Meshy 7, clips Idle / Wave / Talk / Walk), so the two
   * match. The picture stays on data saver, slow connections or without WebGL: it breathes, says hello, and hops
   * when tapped. The one at the top starts when the page is idle; the others when they come near the screen. */
  function startCapy(host) {
    var els = Array.prototype.slice.call(host.querySelectorAll('[data-capy]'));
    if (!els.length) return;
    els.forEach(function (el, i) {
      var hello = function () {
        el.classList.add('talk'); clearTimeout(el.__talkT);
        el.__talkT = setTimeout(function () { el.classList.remove('talk'); }, 2600);
      };
      // The picture's own tap (the 3D Kapi has his own once he is there).
      el.addEventListener('click', function () { if (el.classList.contains('live')) return; el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); hello(); });
      el.addEventListener('animationend', function (e) { if (e.animationName === 'capy-hop') el.classList.remove('hop'); });
      if (i === 0) setTimeout(function () { if (!el.classList.contains('live')) hello(); }, 1200);
    });
    // The 3D model is about 2.5 MB: skip it on data saver or slow connections (the pictures stay).
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
    var rest = els.slice(1);
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
