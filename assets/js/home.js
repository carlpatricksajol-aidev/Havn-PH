/* Havn PH — home page: hero search, kinds of rooms, schools, rows of rooms, how it works.
 * 3D icons: Microsoft Fluent Emoji (MIT, see /assets/3d/LICENSE). */
(function () {
  var HV = (window.HomeView = {});

  function i3(name, size, eager) {
    return '<img class="i3" src="/assets/3d/' + name + '.webp" width="' + (size || 48) + '" height="' + (size || 48) + '" alt=""' +
      (eager ? '' : ' loading="lazy"') + ' decoding="async">';
  }
  HV.i3 = i3;

  var TINTS = ['#EAF2FF', '#FFF1E6', '#E9F8EF', '#F2EDFF', '#FFF6D6', '#FDEAF1'];

  // Kinds of room → the filter they open on /rooms.
  var KINDS = [
    { icon: 'houses', label: 'All rooms', s: {} },
    { icon: 'bed', label: 'Bedspace', s: { types: ['Bedspace'] } },
    { icon: 'couch', label: 'Shared room', s: { types: ['Shared room'] } },
    { icon: 'door', label: 'Private room', s: { types: ['Private room'] } },
    { icon: 'house', label: 'Studio', s: { types: ['Studio'] } },
    { icon: 'sparkles', label: 'Available now', s: { avail: true } },
    { icon: 'woman', label: 'Female only', s: { gender: 'female' } },
    { icon: 'man', label: 'Male only', s: { gender: 'male' } },
    { icon: 'snowflake', label: 'Aircon', s: { amen: ['aircon'] } },
    { icon: 'bathtub', label: 'Own CR', s: { amen: ['own-cr'] } },
    { icon: 'laptop', label: 'Wi-Fi', s: { amen: ['wifi'] } },
  ];

  function rows() {
    return [
      { icon: 'cap', title: t('Rooms near {place}', { place: 'AdDU' }), s: { place: 'school:addu' }, school: 'addu' },
      { icon: 'sparkles', title: t('Available now'), s: { avail: true } },
      { icon: 'backpack', title: t('Rooms near {place}', { place: 'UM' }), s: { place: 'school:um' }, school: 'um' },
      { icon: 'coin', title: t('{p} a month and below', { p: H.peso(5000) }), s: { max: 5000, sort: 'low' } },
      { icon: 'bathtub', title: t('With their own CR'), s: { amen: ['own-cr'] } },
      { icon: 'books', title: t('Rooms near {place}', { place: 'USeP' }), s: { place: 'school:usep' }, school: 'usep' },
    ];
  }

  function roomsText(n) { return n === 1 ? t('1 room') : t('{n} rooms', { n: n }); }
  function nearbyText(n) { return !n ? t('No rooms nearby yet') : n === 1 ? t('1 room nearby') : t('{n} rooms nearby', { n: n }); }

  function hero(api) {
    var pop = ['addu', 'um', 'usep', 'spc', 'hcdc'].map(function (id) {
      var s = H.school(id);
      return '<a href="' + api.url({ place: 'school:' + id }) + '" data-link>' + H.esc(s.short) + '</a>';
    }).join('');
    // Each art piece: [icon, left %, top %, width %, tilt, float delay]
    var art = [
      ['house-garden', 25, 22, 50, 0, 0], ['cat', 4, 60, 19, -6, 1.2], ['dog', 76, 56, 21, 6, .4],
      ['backpack', 8, 14, 14, -12, 2], ['books', 78, 12, 14, 8, 1.6], ['pushpin', 45, 0, 10, 0, .8],
      ['heart', 64, 38, 9, 10, 2.4], ['paw', 30, 82, 11, -8, 1], ['plant', 58, 80, 13, 0, 1.8],
    ].map(function (a) {
      return '<span class="ha" style="left:' + a[1] + '%;top:' + a[2] + '%;width:' + a[3] + '%;--r:' + a[4] + 'deg;animation-delay:-' + a[5] + 's">' + i3(a[0], 192, true) + '</span>';
    }).join('');
    return '<section class="hero" aria-labelledby="hero-t"><div class="hero-in">' +
      '<div class="hero-copy">' +
        '<p class="hero-hi">' + i3('wave', 24, true) + '<span>' + H.esc(t('Hi! Looking for a room in Davao?')) + '</span></p>' +
        '<h1 id="hero-t">' + H.esc(t('Find a home')) + ' <em>' + H.esc(t('near your school')) + '</em></h1>' +
        '<p class="hero-sub">' + H.esc(t('Boarding houses, bedspaces and rooms in Davao City, with photos, the monthly price and the exact spot on the map.')) + '</p>' +
        '<div class="hero-search">' + api.searchHtml + '</div>' +
        '<p class="hero-pop"><span>' + H.esc(t('Popular:')) + '</span>' + pop + '</p>' +
      '</div>' +
      '<div class="hero-art" aria-hidden="true"><span class="hero-blob"></span>' + art + '</div>' +
    '</div></section>';
  }

  function kinds(api) {
    return '<section class="h-sec" aria-labelledby="kinds-t"><div class="h-head"><h2 id="kinds-t">' + H.esc(t('What kind of room?')) + '</h2></div>' +
      '<div class="kinds">' + KINDS.map(function (k, i) {
        return '<a class="kind" href="' + api.url(k.s) + '" data-link style="--tint:' + TINTS[i % TINTS.length] + '">' +
          i3(k.icon, 52) + '<b>' + H.esc(t(k.label)) + '</b><small>' + H.esc(roomsText(api.count(k.s))) + '</small></a>';
      }).join('') + '</div></section>';
  }

  function schools(api) {
    var list = HAVN_SCHOOLS.map(function (s) { return { s: s, n: api.count({ place: 'school:' + s.id }) }; })
      .sort(function (a, b) { return b.n - a.n; });
    return '<section class="h-sec" aria-labelledby="schools-t"><div class="h-head">' + i3('school', 36) + '<h2 id="schools-t">' + H.esc(t('Near your school')) + '</h2></div>' +
      '<div class="schools">' + list.map(function (x) {
        return '<a class="school-card" href="' + api.url({ place: 'school:' + x.s.id }) + '" data-link>' + i3('school', 48) +
          '<span><b>' + H.esc(x.s.short) + '</b><small>' + H.esc(x.s.name) + '</small><em>' + H.esc(nearbyText(x.n)) + '</em></span></a>';
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

  function steps() {
    var s = [
      ['magnifier', 'Search near your school', 'Pick your school or area and your budget.'],
      ['pushpin', 'See the exact spot', 'Every room shows photos, the monthly price and where it is on the map.'],
      ['chat', 'Message the landlord', 'Ask about the room and visit before you move in.'],
    ];
    return '<section class="h-sec" aria-labelledby="how-t"><div class="h-head"><h2 id="how-t">' + H.esc(t('How Havn works')) + '</h2></div>' +
      '<ol class="steps">' + s.map(function (x, i) {
        return '<li class="step" style="--tint:' + TINTS[i] + '">' + i3(x[0], 64) + '<div><span class="step-n">' + (i + 1) + '</span>' +
          '<h3>' + H.esc(t(x[1])) + '</h3><p>' + H.esc(t(x[2])) + '</p></div></li>';
      }).join('') + '</ol></section>';
  }

  function landlordBand() {
    return '<section class="ll-band" aria-labelledby="llb-t"><div class="ll-band-copy">' +
        '<h2 id="llb-t">' + H.esc(t('Own a boarding house?')) + '</h2>' +
        '<p>' + H.esc(t('List it on Havn so students and young workers nearby can find it.')) + '</p>' +
        '<a class="btn btn-primary" href="/list" data-ll-open><span>' + H.esc(t('List your place')) + '</span>' + H.icon('arrow-right') + '</a>' +
      '</div><div class="ll-band-art" aria-hidden="true">' +
        '<span class="ha" style="left:22%;top:6%;width:52%">' + i3('house-garden', 192) + '</span>' +
        '<span class="ha" style="left:2%;top:52%;width:26%;--r:-18deg;animation-delay:-1s">' + i3('key', 192) + '</span>' +
        '<span class="ha" style="left:72%;top:50%;width:24%;animation-delay:-2s">' + i3('dog', 192) + '</span>' +
      '</div></section>';
  }

  HV.render = function (host, api) {
    host.innerHTML = '<div class="home">' + hero(api) +
      '<div class="home-wrap">' +
        kinds(api) + schools(api) +
        '<div class="h-rows">' + api.sampleNote + rows().map(function (r, i) { return row(api, r, i); }).join('') + '</div>' +
        steps() + landlordBand() + api.foot +
      '</div></div>';
    bindRows(host);
  };

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
