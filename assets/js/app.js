/* ECStay — app shell: header, home, browse (rooms + map), filters, routing. */
(function () {
  var A = (window.App = {});
  // bbox = the map area [west, south, east, north] once someone moves the map themselves.
  var DEFAULTS = { place: '', q: '', min: 0, max: 0, types: [], gender: '', amen: [], avail: false, saved: false, sort: 'rec', bbox: null };
  var PRICE_MIN = 1000, PRICE_MAX = 15000, PRICE_STEP = 500;
  var BUDGETS = [4000, 6000, 8000, 12000];
  var NEAR_KM = 2.0;
  var desktop = window.matchMedia('(min-width: 1024px)');

  var S = clone(DEFAULTS);
  var mode = 'list';            // phones/tablets: 'list' | 'map'
  var view = '';                // 'home' | 'browse' | 'room'
  var bmap = null, bmapP = null;
  var browseScroll = 0, homeScroll = 0;
  var findObs = null;
  var lastBrowseUrl = '/';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------------- URL <-> filter state ---------------- */
  function readUrl() {
    var p = new URLSearchParams(location.search);
    S = clone(DEFAULTS);
    if (p.get('near') && H.school(p.get('near'))) S.place = 'school:' + p.get('near');
    if (p.get('area') && HAVN_AREAS.indexOf(p.get('area')) !== -1) S.place = 'area:' + p.get('area');
    S.q = (p.get('q') || '').slice(0, 60);
    S.min = Math.max(0, parseInt(p.get('min'), 10) || 0);
    S.max = Math.max(0, parseInt(p.get('max'), 10) || 0);
    S.types = (p.get('type') || '').split(',').filter(function (x) { return HAVN_ROOM_TYPES.indexOf(x) !== -1; });
    S.gender = ['female', 'male', 'mixed'].indexOf(p.get('gender')) !== -1 ? p.get('gender') : '';
    S.amen = (p.get('amen') || '').split(',').filter(function (x) { return HAVN_AMENITIES[x]; });
    S.avail = p.get('avail') === '1';
    S.saved = p.get('saved') === '1';
    S.sort = ['rec', 'low', 'high', 'near'].indexOf(p.get('sort')) !== -1 ? p.get('sort') : 'rec';
    var bb = (p.get('bbox') || '').split(',').map(Number);
    if (bb.length === 4 && bb.every(function (v) { return isFinite(v); }) && bb[0] < bb[2] && bb[1] < bb[3] && bb[1] >= -90 && bb[3] <= 90) S.bbox = bb;
  }
  function urlFor(s) {
    var p = new URLSearchParams();
    if (s.place.indexOf('school:') === 0) p.set('near', s.place.slice(7));
    if (s.place.indexOf('area:') === 0) p.set('area', s.place.slice(5));
    if (s.q) p.set('q', s.q);
    if (boxOn(s)) p.set('bbox', s.bbox.map(function (v) { return v.toFixed(5); }).join(','));
    if (s.min) p.set('min', s.min);
    if (s.max) p.set('max', s.max);
    if (s.types.length) p.set('type', s.types.join(','));
    if (s.gender) p.set('gender', s.gender);
    if (s.amen.length) p.set('amen', s.amen.join(','));
    if (s.avail) p.set('avail', '1');
    if (s.saved) p.set('saved', '1');
    if (s.sort !== 'rec') p.set('sort', s.sort);
    var q = p.toString();
    return '/rooms' + (q ? '?' + q.replace(/%2C/g, ',') : '');
  }
  // A browse URL for a few settings on top of the defaults (home page links).
  function stateWith(p) { var o = clone(DEFAULTS); Object.keys(p || {}).forEach(function (k) { o[k] = p[k]; }); return o; }

  /* ---------------- Filtering ---------------- */
  function placeSchool(s) { return s.place.indexOf('school:') === 0 ? H.school(s.place.slice(7)) : null; }
  function placeArea(s) { return s.place.indexOf('area:') === 0 ? s.place.slice(5) : ''; }

  // The saved list always shows every saved room, wherever the map is.
  function boxOn(s) { return !!(s.bbox && !s.saved); }
  function inBox(l, b) { return l.lng >= b[0] && l.lat >= b[1] && l.lng <= b[2] && l.lat <= b[3]; }
  function boxCenter(b) { return { lat: (b[1] + b[3]) / 2, lng: (b[0] + b[2]) / 2 }; }
  function areaMode(s) { return boxOn(s) && !s.place && !s.q; }

  // anyArea: ignore the map area (map pins show every match, so you can pan toward them).
  function matches(l, s, anyArea) {
    if (!anyArea && boxOn(s) && !inBox(l, s.bbox)) return false;
    var sc = placeSchool(s), area = placeArea(s);
    if (sc && H.km(l, sc) > NEAR_KM) return false;
    if (area && l.area !== area) return false;
    if (s.q) {
      var hay = [l.name, l.area, l.street, l.type, l.landmark || '', H.schoolsByDistance(l)[0].school.short, H.schoolsByDistance(l)[0].school.name].join(' ').toLowerCase();
      if (s.q.toLowerCase().split(/\s+/).some(function (w) { return w && hay.indexOf(w) === -1; })) return false;
    }
    if (s.min && l.price < s.min) return false;
    if (s.max && s.max < PRICE_MAX && l.price > s.max) return false;
    if (s.types.length && s.types.indexOf(l.type) === -1) return false;
    if (s.gender && l.gender !== s.gender) return false;
    if (s.amen.some(function (a) { return l.amenities.indexOf(a) === -1; })) return false;
    if (s.avail && l.status === 'full') return false;
    if (s.saved && !H.saved.has(l.id)) return false;
    return true;
  }

  function results(s, anyArea) {
    var sc = placeSchool(s);
    var list = HAVN_LISTINGS.filter(function (l) { return matches(l, s, anyArea); });
    var order = HAVN_LISTINGS.map(function (l) { return l.id; });
    var dist = function (l) { return sc ? H.km(l, sc) : H.schoolsByDistance(l)[0].km; };
    list.sort(function (a, b) {
      var fa = a.status === 'full' ? 1 : 0, fb = b.status === 'full' ? 1 : 0;
      if (s.sort === 'low') return a.price - b.price;
      if (s.sort === 'high') return b.price - a.price;
      if (s.sort === 'near') return dist(a) - dist(b);
      if (fa !== fb) return fa - fb;
      if (sc) return dist(a) - dist(b);
      return order.indexOf(a.id) - order.indexOf(b.id);
    });
    return list;
  }

  function activeCount(s) {
    return (s.place ? 1 : 0) + (s.min || s.max ? 1 : 0) + (s.types.length ? 1 : 0) + (s.gender ? 1 : 0) + s.amen.length + (s.avail ? 1 : 0) + (s.q ? 1 : 0);
  }

  function placeLabel(s) {
    var sc = placeSchool(s);
    if (sc) return sc.short;
    return placeArea(s);
  }

  /* ---------------- Header ---------------- */
  function langButtons(cls) {
    return '<div class="lang ' + (cls || '') + '" role="group" aria-label="' + H.esc(t('Language')) + '">' +
      HAVN_I18N.langs.map(function (x) {
        return '<button type="button" data-lang="' + x[0] + '" aria-pressed="' + (HAVN_I18N.get() === x[0]) + '">' + x[1] + '</button>';
      }).join('') + '</div>';
  }

  function budgetOptions() {
    var opts = '<option value="0">' + H.esc(t('Any budget')) + '</option>';
    var list = BUDGETS.slice();
    if (S.max && list.indexOf(S.max) === -1 && S.max < PRICE_MAX) list.push(S.max), list.sort(function (a, b) { return a - b; });
    list.forEach(function (b) {
      opts += '<option value="' + b + '"' + (S.max === b && !S.min ? ' selected' : '') + '>' + H.esc(t('Up to {p}', { p: H.peso(b) })) + '</option>';
    });
    if (S.min) opts += '<option value="custom" selected>' + H.peso(S.min) + '–' + (S.max ? H.peso(S.max) : H.peso(PRICE_MAX) + '+') + '</option>';
    return opts;
  }
  function typeOptions() {
    var o = '<option value="">' + H.esc(t('Any room')) + '</option>';
    HAVN_ROOM_TYPES.forEach(function (x) {
      o += '<option value="' + x + '"' + (S.types.length === 1 && S.types[0] === x ? ' selected' : '') + '>' + H.esc(t(x)) + '</option>';
    });
    if (S.types.length > 1) o += '<option value="multi" selected>' + H.esc(S.types.map(function (x) { return t(x); }).join(', ')) + '</option>';
    return o;
  }

  function renderHeader() {
    var hdr = $('#site-header');
    var n = activeCount(S);
    var savedN = H.saved.count();
    hdr.className = 'site-header' + (view === 'room' ? ' is-room' : '') + (view === 'home' ? ' is-home' : '');
    var middle;
    if (view === 'room') {
      middle = '<a class="back-link" href="' + H.esc(lastBrowseUrl) + '" data-link data-back>' + H.icon('arrow-left') + '<span>' + H.esc(lastBrowseUrl === '/' ? t('Back') : t('Back to results')) + '</span></a>';
    } else if (view === 'home') {
      // Appears once the big search on the home page scrolls out of view.
      middle = HomeView.tabs(homeApi(), 'tabs-hdr') +
        '<button type="button" class="hdr-find" data-find>' + H.icon('search') + '<span>' + H.esc(t('Search a mall, school or area')) + '</span></button>';
    } else {
      middle = searchHtml() +
        '<button type="button" class="filter-btn filter-btn-top" data-open-filters aria-label="' + H.esc(t('Filters')) + '">' + H.icon('sliders') + (n ? '<b class="count">' + n + '</b>' : '') + '</button>';
    }
    hdr.innerHTML =
      '<div class="hdr">' +
        '<a href="/" class="logo" data-link data-home aria-label="ECStay, home"><img class="logo-icon" src="/assets/brand/ecstay-mark.svg" width="40" height="40" alt=""><span class="logo-word">ECStay</span></a>' +
        middle +
        '<div class="hdr-actions">' +
          '<a class="hdr-link saved-link' + (S.saved && view === 'browse' ? ' on' : '') + '" href="/rooms?saved=1" data-link>' + H.icon('heart') + '<span>' + H.esc(t('Saved')) + '</span>' + (savedN ? '<b class="count">' + savedN + '</b>' : '') + '</a>' +
          '<a class="hdr-link list-link" href="/list" data-ll-open>' + H.esc(t('List your place')) + '</a>' +
          langButtons() +
        '</div>' +
      '</div>' +
      (view === 'browse' ? renderChips(n) : '');
    bindHeader();
  }

  function searchHtml() {
    var qVal = S.place ? placeLabel(S) : S.q;
    var mapArea = areaMode(S);
    return '<form class="search" id="search" role="search" autocomplete="off">' +
              '<div class="sf sf-where">' +
                '<label class="sf-label" for="q">' + H.esc(t('Where')) + '</label>' +
                '<div class="sf-input' + (mapArea ? ' is-area' : '') + '">' + H.icon(mapArea ? 'map' : 'search', 'sf-icon') +
                  '<input id="q" name="q" type="text" inputmode="search" enterkeyhint="search" placeholder="' + H.esc(mapArea ? t('Map area') : t('Search a mall, school or area')) + '" value="' + H.esc(qVal) + '" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="q-list">' +
                  '<button type="button" class="sf-clear" aria-label="' + H.esc(t('Clear all')) + '"' + (qVal || mapArea ? '' : ' hidden') + '>' + H.icon('x') + '</button>' +
                '</div>' +
                '<ul id="q-list" class="suggest" role="listbox" hidden></ul>' +
              '</div>' +
              '<div class="sf sf-select"><label class="sf-label" for="budget">' + H.esc(t('Budget')) + '</label><select id="budget">' + budgetOptions() + '</select></div>' +
              '<div class="sf sf-select"><label class="sf-label" for="rtype">' + H.esc(t('Room type')) + '</label><select id="rtype">' + typeOptions() + '</select></div>' +
              '<button class="sf-go" type="submit">' + H.icon('search') + '<span>' + H.esc(t('Search')) + '</span></button>' +
            '</form>';
  }

  function chip(label, on, attrs) {
    return '<button type="button" class="chip' + (on ? ' on' : '') + '" aria-pressed="' + !!on + '" ' + attrs + '>' + H.esc(label) + '</button>';
  }
  function renderChips(n) {
    var c = chip(t('All rooms'), !S.types.length, 'data-type=""');
    HAVN_ROOM_TYPES.forEach(function (x) { c += chip(t(x), S.types.indexOf(x) !== -1, 'data-type="' + x + '"'); });
    c += '<span class="chip-sep" aria-hidden="true"></span>';
    c += chip(t('Available now'), S.avail, 'data-toggle="avail"');
    c += chip(t('Female only'), S.gender === 'female', 'data-gender="female"');
    c += chip(t('Male only'), S.gender === 'male', 'data-gender="male"');
    c += chip(t('Aircon'), S.amen.indexOf('aircon') !== -1, 'data-amen="aircon"');
    c += chip(t('Own CR'), S.amen.indexOf('own-cr') !== -1, 'data-amen="own-cr"');
    c += chip(t('Wi-Fi'), S.amen.indexOf('wifi') !== -1, 'data-amen="wifi"');
    return '<div class="chips-row"><div class="chips" role="group" aria-label="' + H.esc(t('Filters')) + '">' + c + '</div>' +
      '<button type="button" class="filter-btn filter-btn-row" data-open-filters>' + H.icon('sliders') + '<span>' + H.esc(t('Filters')) + '</span>' + (n ? '<b class="count">' + n + '</b>' : '') + '</button></div>';
  }

  function bindHeader() {
    var hdr = $('#site-header');
    var form = $('#search', hdr);
    if (form) bindSearch(form);
    bindChips(hdr);
  }

  // On the home page a search opens /rooms; on /rooms it filters in place.
  function commit() {
    if (view === 'home') { mode = 'list'; A.go(urlFor(S)); return; }
    apply(true);
  }

  function bindSearch(form) {
    {
      var input = $('#q', form), list = $('#q-list', form), clear = $('.sf-clear', form);
      var active = -1, items = [];
      var paintActive = function () {
        $$('li', list).forEach(function (li, i) { li.setAttribute('aria-selected', i === active); });
        input.setAttribute('aria-activedescendant', active >= 0 ? 'sg-' + active : '');
      };
      var close = function () { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
      var open = function () {
        items = suggestions(input.value);
        if (!items.length) return close();
        list.innerHTML = items.map(function (it, i) {
          return '<li id="sg-' + i + '" role="option" data-i="' + i + '">' + H.icon(it.icon) + '<span><b>' + H.esc(it.title) + '</b>' + (it.sub ? '<small>' + H.esc(it.sub) + '</small>' : '') + '</span></li>';
        }).join('');
        list.hidden = false; input.setAttribute('aria-expanded', 'true'); active = -1;
      };
      var pick = function (it) {
        close();
        if (it.room) { A.go('/room/' + it.room); return; }
        S.place = it.place; S.q = ''; S.bbox = null;
        commit();
      };
      input.addEventListener('focus', open);
      input.addEventListener('input', function () { clear.hidden = !input.value && !areaMode(S); open(); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' && !list.hidden) { e.preventDefault(); active = Math.min(items.length - 1, active + 1); paintActive(); }
        else if (e.key === 'ArrowUp' && !list.hidden) { e.preventDefault(); active = Math.max(0, active - 1); paintActive(); }
        else if (e.key === 'Escape') { close(); }
        else if (e.key === 'Enter' && active >= 0 && items[active]) { e.preventDefault(); pick(items[active]); }
      });
      list.addEventListener('mousedown', function (e) { e.preventDefault(); });
      list.addEventListener('click', function (e) {
        var li = e.target.closest('li'); if (li) pick(items[+li.getAttribute('data-i')]);
      });
      input.addEventListener('blur', function () { setTimeout(close, 120); });
      clear.addEventListener('click', function () {
        S.place = ''; S.q = ''; S.bbox = null;
        if (view === 'home') { input.value = ''; clear.hidden = true; input.focus(); return; }
        apply(true); $('#q').focus();
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = input.value.trim();
        var sug = suggestions(v);
        if (v && sug.length && !sug[0].room && sug[0].exact) { pick(sug[0]); return; }
        if (S.place && v === placeLabel(S)) { close(); commit(); return; }
        S.place = ''; S.q = v; if (v) S.bbox = null; close(); input.blur(); commit();
      });
      $('#budget', form).addEventListener('change', function (e) {
        var v = e.target.value; if (v === 'custom') return;
        S.min = 0; S.max = +v; if (view !== 'home') apply(true);
      });
      $('#rtype', form).addEventListener('change', function (e) {
        var v = e.target.value; if (v === 'multi') return;
        S.types = v ? [v] : []; if (view !== 'home') apply(true);
      });
    }
  }

  function bindChips(hdr) {
    $$('.chip', hdr).forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.hasAttribute('data-type')) {
          var x = b.getAttribute('data-type');
          if (!x) S.types = [];
          else if (S.types.indexOf(x) === -1) S.types.push(x);
          else S.types.splice(S.types.indexOf(x), 1);
        } else if (b.hasAttribute('data-toggle')) {
          S.avail = !S.avail;
        } else if (b.hasAttribute('data-gender')) {
          var g = b.getAttribute('data-gender'); S.gender = S.gender === g ? '' : g;
        } else if (b.hasAttribute('data-amen')) {
          var a = b.getAttribute('data-amen'), i = S.amen.indexOf(a);
          if (i === -1) S.amen.push(a); else S.amen.splice(i, 1);
        }
        apply(true);
      });
    });
    var chipsEl = $('.chips', hdr);
    if (chipsEl) {
      var on = $('.chip.on:not([data-type=""])', chipsEl);
      if (on && on.offsetLeft > chipsEl.clientWidth - 60) chipsEl.scrollLeft = on.offsetLeft - 16;
    }
  }

  function suggestions(v) {
    var q = (v || '').trim().toLowerCase();
    var out = [];
    // Schools and everyday places (malls, hospitals, offices); with nothing typed, a mix of both.
    var places = HAVN_SCHOOLS.concat(HAVN_LANDMARKS);
    if (!q) places = HAVN_LANDMARKS.slice(0, 5).concat(HAVN_SCHOOLS.slice(0, 5));
    places.forEach(function (s) {
      var hit = !q || s.short.toLowerCase().indexOf(q) === 0 || s.name.toLowerCase().indexOf(q) !== -1;
      if (hit) out.push({ icon: s.kind ? HavnMap.placeIcon(s.kind) : 'cap', title: s.short, sub: s.name, place: 'school:' + s.id, exact: q && (s.short.toLowerCase() === q || s.name.toLowerCase() === q || out.length === 0) });
    });
    HAVN_AREAS.forEach(function (a) {
      if (!q || a.toLowerCase().indexOf(q) === 0) out.push({ icon: 'pin', title: a, sub: 'Davao City', place: 'area:' + a, exact: q && (a.toLowerCase() === q || out.length === 0) });
    });
    if (q.length >= 2) {
      HAVN_LISTINGS.forEach(function (l) {
        if (l.name.toLowerCase().indexOf(q) !== -1) out.push({ icon: 'home', title: l.name, sub: t(l.type) + ' · ' + H.peso(l.price), room: l.id });
      });
    }
    return out.slice(0, q ? 8 : 12);
  }

  /* ---------------- Bottom nav (phones/tablets) ---------------- */
  function renderNav() {
    var nav = $('#bottom-nav');
    var savedN = H.saved.count();
    var tab = view === 'home' ? 'home' : view === 'browse' ? (S.saved ? 'saved' : mode) : '';
    nav.hidden = view === 'room';
    nav.innerHTML =
      '<button type="button" data-tab="home" aria-pressed="' + (tab === 'home') + '">' + H.icon('home') + '<span>' + H.esc(t('Home')) + '</span></button>' +
      '<button type="button" data-tab="list" aria-pressed="' + (tab === 'list') + '">' + H.icon('list') + '<span>' + H.esc(t('Rooms')) + '</span></button>' +
      '<button type="button" data-tab="map" aria-pressed="' + (tab === 'map') + '">' + H.icon('map') + '<span>' + H.esc(t('Map')) + '</span></button>' +
      '<button type="button" data-tab="saved" aria-pressed="' + (tab === 'saved') + '">' + H.icon('heart') + '<span>' + H.esc(t('Saved')) + '</span>' + (savedN ? '<b class="count">' + savedN + '</b>' : '') + '</button>';
  }

  $('#bottom-nav').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    var tab = b.getAttribute('data-tab');
    if (tab === 'home') { if (view !== 'home') A.go('/'); else window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (view === 'home') {
      mode = tab === 'map' ? 'map' : 'list';
      A.go(tab === 'saved' ? '/rooms?saved=1' : '/rooms');
      return;
    }
    if (tab === 'saved') { S.saved = !S.saved || mode === 'map' ? true : false; S.bbox = null; setMode('list'); apply(false); window.scrollTo(0, 0); return; }
    if (S.saved) { S.saved = false; apply(false); }
    setMode(tab);
  });

  function setMode(m) {
    mode = m;
    var b = $('.browse');
    if (b) { b.classList.toggle('mode-map', m === 'map'); b.classList.toggle('mode-list', m !== 'map'); }
    document.body.classList.toggle('map-open', m === 'map' && !desktop.matches);
    renderNav();
    if (m === 'map') { window.scrollTo(0, 0); ensureMap(); if (bmap) setTimeout(function () { bmap.resize(); refitMap(); }, 30); }
    else if (bmap) bmap.close();
  }

  // Back to the map area the person chose, or else fit the rooms.
  function refitMap() {
    if (!bmap) return;
    if (boxOn(S)) bmap.fitBox(S.bbox); else bmap.fit();
  }

  /* ---------------- Browse view ---------------- */
  function sampleNote() {
    var any = HAVN_LISTINGS.some(function (l) { return l.sample; });
    if (!any) return '';
    return '<p class="sample-note">' + H.icon('info') + '<span>' + H.esc(t('Sample listings: these rooms and photos are examples while real boarding houses are being added.')) + '</span></p>';
  }

  A.cardHtml = function (l, eager, opts) {
    opts = opts || {};
    var saved = H.saved.has(l.id);
    var href = '/room/' + l.id;
    var school = opts.school || (placeSchool(S) && placeSchool(S).id);
    if (opts.single) {
      var img = '<img src="' + H.photo(l.photos[0], 640) + '" width="640" height="480" alt="" loading="lazy" decoding="async">';
      return cardShell(l, saved, href, school, '<a class="slides" href="' + href + '" data-link tabindex="-1" aria-hidden="true">' + img + '</a>', '');
    }
    var imgs = l.photos.map(function (p, k) {
      return '<img src="' + H.photo(p, 640) + '" srcset="' + H.photo(p, 640) + ' 640w, ' + H.photo(p, 1200) + ' 1200w" sizes="(min-width: 1440px) 300px, (min-width: 1024px) 26vw, (min-width: 640px) 46vw, 94vw" width="640" height="480" alt="" ' +
        (eager && k === 0 ? 'fetchpriority="high"' : 'loading="lazy"') + ' decoding="async">';
    }).join('');
    return cardShell(l, saved, href, school,
      '<a class="slides" href="' + href + '" data-link tabindex="-1" aria-hidden="true">' + imgs + '</a>' +
      '<button type="button" class="slide-btn prev" data-step="-1" tabindex="-1" aria-label="' + H.esc(t('Previous photo')) + '">' + H.icon('chev-left') + '</button>' +
      '<button type="button" class="slide-btn next" data-step="1" tabindex="-1" aria-label="' + H.esc(t('Next photo')) + '">' + H.icon('chev-right') + '</button>' +
      '<div class="dots" aria-hidden="true">' + l.photos.map(function () { return '<i></i>'; }).join('') + '</div>', ' data-slides');
  };

  function cardShell(l, saved, href, school, media, slidesAttr) {
    var bath = l.bath === 'own' ? t('Own CR') : t('Shared CR');
    return '<article class="card' + (l.status === 'full' ? ' is-full' : '') + '" data-id="' + l.id + '">' +
      '<div class="card-media"' + slidesAttr + '>' + media +
        '<span class="status s-' + l.status + '"><i aria-hidden="true"></i>' + H.esc(H.statusLabel(l)) + '</span>' +
        '<button type="button" class="heart" data-save="' + l.id + '" aria-pressed="' + saved + '" aria-label="' + H.esc(saved ? t('Remove from saved') : t('Save this room')) + '">' + H.icon('heart') + '</button>' +
      '</div>' +
      '<a class="card-body" href="' + href + '" data-link>' +
        '<h2 class="card-title"><span>' + H.esc(l.name) + '</span>' + (l.sample ? '<span class="tag">' + H.esc(t('Sample')) + '</span>' : '') + '</h2>' +
        '<p class="card-near">' + H.icon('walk') + '<span>' + H.esc(H.nearText(l, school)) + '</span></p>' +
        '<p class="card-meta">' + H.esc(t(l.type) + ' · ' + H.genderLabel(l.gender) + ' · ' + bath) + '</p>' +
        '<p class="card-price"><b>' + H.peso(l.price) + '</b> ' + H.esc(t('/ month')) + '</p>' +
      '</a>' +
    '</article>';
  }

  function miniHtml(l) {
    return '<a class="mini" href="/room/' + l.id + '" data-link>' +
      '<img src="' + H.photo(l.photos[0], 640) + '" width="640" height="480" alt="">' +
      '<span class="mini-b"><b>' + H.esc(l.name) + '</b>' +
      '<span>' + H.esc(H.nearText(l, placeSchool(S) && placeSchool(S).id)) + '</span>' +
      '<span><strong>' + H.peso(l.price) + '</strong> ' + H.esc(t('/ month')) + ' · <em class="st-' + l.status + '">' + H.esc(H.statusLabel(l)) + '</em></span></span></a>';
  }

  function title(list) {
    var n = list.length;
    if (S.saved) return n === 1 ? t('1 saved room') : t('{n} saved rooms', { n: n });
    if (areaMode(S)) return n === 1 ? t('1 room in this map area') : t('{n} rooms in this map area', { n: n });
    var place = placeLabel(S);
    if (place) return n === 1 ? t('1 room near {place}', { place: place }) : t('{n} rooms near {place}', { n: n, place: place });
    return n === 1 ? t('1 room in Davao City') : t('{n} rooms in Davao City', { n: n });
  }

  var EMPTY_ART = '<svg class="empty-art" viewBox="0 0 160 120" aria-hidden="true"><rect x="10" y="96" width="140" height="6" rx="3" fill="#E0E4ED"/><path d="M38 96V58l42-30 42 30v38" fill="#fff" stroke="#0052CC" stroke-width="4" stroke-linejoin="round"/><rect x="68" y="66" width="24" height="30" rx="3" fill="#E6EFFE" stroke="#0052CC" stroke-width="4"/><circle cx="118" cy="40" r="16" fill="#fff" stroke="#6B7280" stroke-width="4"/><path d="m130 52 12 12" stroke="#6B7280" stroke-width="5" stroke-linecap="round"/></svg>';

  // Re-use the cards already on screen, so moving the map never reloads photos that stay.
  function updateGrid(box, list) {
    var ctx = (placeSchool(S) && placeSchool(S).id) || '';
    var grid = box.firstElementChild;
    if (!grid || !grid.hasAttribute('data-main') || grid.getAttribute('data-ctx') !== ctx) {
      box.innerHTML = '<div class="grid" data-main data-ctx="' + ctx + '">' + list.map(function (l, i) { return A.cardHtml(l, i < 4); }).join('') + '</div>';
      return;
    }
    var old = {}, tmp = document.createElement('div');
    $$('.card', grid).forEach(function (c) { old[c.getAttribute('data-id')] = c; });
    list.forEach(function (l, i) {
      var c = old[l.id];
      if (c) delete old[l.id];
      else { tmp.innerHTML = A.cardHtml(l, false); c = tmp.firstElementChild; }
      if (grid.children[i] !== c) grid.insertBefore(c, grid.children[i] || null);
    });
    Object.keys(old).forEach(function (k) { old[k].remove(); });
  }

  function mapCountText(n) {
    if (!n) return t('No rooms in this area');
    return n === 1 ? t('Show 1 room') : t('Show {n} rooms', { n: n });
  }

  /* refit: false keeps the map where it is (the person is moving it). */
  function renderResults(refit) {
    var list = results(S);
    var box = $('#results-body');
    $('#results-title').textContent = title(list);
    document.title = (S.saved ? t('Saved') : title(list)) + ' · ECStay';
    var sortSel = $('#sort');
    if (sortSel) sortSel.value = S.sort;
    if (!list.length) {
      if (S.saved) {
        box.innerHTML = '<div class="empty">' + EMPTY_ART + '<h2>' + H.esc(t('No saved rooms yet')) + '</h2><p>' + H.esc(t('Tap the heart on any room to keep it here.')) + '</p>' +
          '<a class="btn btn-primary" href="/rooms" data-link>' + H.esc(t('Browse rooms')) + '</a></div>';
      } else if (boxOn(S) && results(S, true).length) {
        var c = boxCenter(S.bbox);
        var near = results(S, true).sort(function (a, b) { return H.km(a, c) - H.km(b, c); }).slice(0, 3);
        box.innerHTML = '<div class="empty">' + EMPTY_ART + '<h2>' + H.esc(t('No rooms in this part of the map')) + '</h2>' +
          '<p>' + H.esc(t('Zoom out or move the map to see more rooms.')) + '</p>' +
          '<button type="button" class="btn btn-primary" data-clear-map>' + H.esc(t('Show all rooms')) + '</button></div>' +
          '<h2 class="sub-head">' + H.esc(t('Nearest rooms')) + '</h2>' +
          '<div class="grid">' + near.map(function (l) { return A.cardHtml(l, false); }).join('') + '</div>';
      } else {
        var alt = HAVN_LISTINGS.filter(function (l) { return l.status !== 'full'; }).slice(0, 3);
        box.innerHTML = '<div class="empty">' + EMPTY_ART + '<h2>' + H.esc(t('No boarding houses match your filters')) + '</h2>' +
          '<p>' + H.esc(t('Try removing the school filter or raising your budget.')) + '</p>' +
          '<button type="button" class="btn btn-primary" data-clear-all>' + H.esc(t('Clear all filters')) + '</button></div>' +
          '<h2 class="sub-head">' + H.esc(t('Rooms you might like')) + '</h2>' +
          '<div class="grid">' + alt.map(function (l) { return A.cardHtml(l, false); }).join('') + '</div>';
      }
    } else {
      updateGrid(box, list);
    }
    H.bindSlides(box);
    var mc = $('.map-count span');
    if (mc) mc.textContent = mapCountText(list.length);
    if (bmap) { bmap.set(results(S, true), refit !== false && !boxOn(S)); bmap.setPlace(placeSchool(S)); }
    return list;
  }

  /* The person moved the map: the list becomes the rooms inside it. */
  function onMapMove(b) {
    if (view !== 'browse' || S.saved) return;
    var hadArea = areaMode(S);
    var before = results(S).map(function (l) { return l.id; }).join();
    S.bbox = b.map(function (v) { return Math.round(v * 1e5) / 1e5; });
    S.place = ''; S.q = '';
    lastBrowseUrl = urlFor(S);
    history.replaceState(history.state, '', lastBrowseUrl);
    if (!hadArea) renderHeader();
    var list = renderResults(false);
    if (desktop.matches && window.scrollY > 0 && list.map(function (l) { return l.id; }).join() !== before) window.scrollTo(0, 0);
  }

  function footHtml(cls) {
    return '<footer class="foot' + (cls ? ' ' + cls : '') + '">' +
      '<p class="foot-brand"><img src="/assets/brand/ecstay-mark-light.svg" width="30" height="30" alt=""><span class="logo-word">ECStay</span><span class="foot-tag">' + H.esc(t('Rooms and bedspaces in Davao')) + '</span></p>' +
      '<p>© 2026 ECStay · Davao City</p>' +
      '<p><a href="/rooms" data-link>' + H.esc(t('All rooms')) + '</a></p>' +
      '<p><a href="/list" data-ll-open>' + H.esc(t('List your place')) + '</a></p>' +
      langButtons('lang-foot') +
      '<p class="foot-note">' + H.esc(t('Stock photos are used in sample listings.')) + (cls ? ' ' + H.esc(t('Kapi and friends were made for ECStay.')) : '') + '</p>' +
    '</footer>';
  }

  /* ---------------- Home ---------------- */
  function homeApi() {
    return {
      searchHtml: searchHtml(),
      sampleNote: sampleNote(),
      foot: footHtml(),
      footScene: footHtml('foot-scene'),
      count: function (p) { return results(stateWith(p)).length; },
      list: function (p) { return results(stateWith(p)); },
      url: function (p) { return urlFor(stateWith(p)); },
      card: A.cardHtml,
    };
  }

  function renderHome() {
    var host = $('#view-home');
    HomeView.render(host, homeApi());
    bindSearch($('#search', host));
    // Header search button shows once the hero search has scrolled away.
    if (findObs) findObs.disconnect();
    var hdr = $('#site-header');
    if (window.IntersectionObserver) {
      findObs = new IntersectionObserver(function (es) {
        hdr.classList.toggle('find-on', view === 'home' && !es[0].isIntersecting && es[0].boundingClientRect.top < 0);
      }, { rootMargin: '-96px 0px 0px 0px' });
      findObs.observe($('#search', host));
    }
  }

  // The home page is rebuilt each visit; empty it on the way out (one search box on the page).
  function leaveHome() {
    if (findObs) { findObs.disconnect(); findObs = null; }
    $('#site-header').classList.remove('find-on');
    var h = $('#view-home'); h.hidden = true; h.innerHTML = '';
  }

  function showHome() {
    var fromRoom = view === 'room';
    view = 'home';
    S = clone(DEFAULTS);
    lastBrowseUrl = '/';
    document.body.classList.remove('map-open');
    $('#view-browse').hidden = true;
    var room = $('#view-room');
    room.hidden = true; RoomView.destroy(); room.innerHTML = '';
    $('#view-home').hidden = false;
    renderHeader();
    renderHome();
    renderNav();
    document.title = 'ECStay · Boarding houses, bedspaces and rooms in Davao City';
    window.scrollTo(0, fromRoom ? homeScroll : 0);
  }

  function renderBrowse() {
    var host = $('#view-browse');
    host.innerHTML =
      '<div class="browse ' + (mode === 'map' ? 'mode-map' : 'mode-list') + '">' +
        '<section class="results" aria-labelledby="results-title">' +
          sampleNote() +
          '<div class="results-head"><h1 id="results-title"></h1>' +
            '<div class="sort"><label for="sort">' + H.esc(t('Sort')) + '</label><select id="sort">' +
              [['rec', 'Recommended'], ['low', 'Lowest price'], ['high', 'Highest price'], ['near', 'Nearest']].map(function (o) {
                return '<option value="' + o[0] + '">' + H.esc(t(o[1])) + '</option>';
              }).join('') +
            '</select></div></div>' +
          '<div id="results-body"></div>' +
          footHtml() +
        '</section>' +
        '<aside class="map-pane" aria-label="' + H.esc(t('Map')) + '"><div class="map" id="bmap"><div class="map-loading"></div></div>' +
          '<button type="button" class="map-count" data-show-list>' + H.icon('list') + '<span></span></button></aside>' +
      '</div>';
    $('#sort', host).addEventListener('change', function (e) { S.sort = e.target.value; apply(false); });
    var browse = $('.browse', host);
    browse.addEventListener('mouseover', function (e) {
      var c = e.target.closest('.card'); if (c && bmap) bmap.hover(c.getAttribute('data-id'), true);
    });
    browse.addEventListener('mouseout', function (e) {
      var c = e.target.closest('.card'); if (c && bmap && !c.contains(e.relatedTarget)) bmap.hover(c.getAttribute('data-id'), false);
    });
    if (bmap) { bmap.destroy(); bmap = null; bmapP = null; }
    renderResults();
    if (desktop.matches || mode === 'map') ensureMap();
  }

  function ensureMap() {
    if (bmap || bmapP) return;
    var el = $('#bmap');
    if (!el) return;
    bmapP = HavnMap.browse(el, {
      cardHtml: miniHtml,
      onHover: function (id, on) {
        var c = $('.card[data-id="' + id + '"]');
        if (c) c.classList.toggle('pin-hover', on);
      },
      onMove: onMapMove,
    }).then(function (m) {
      bmap = m;
      var ld = $('.map-loading', el); if (ld) ld.remove();
      bmap.set(results(S, true), false);
      bmap.setPlace(placeSchool(S));
      refitMap();
    }).catch(function () {
      bmapP = null;
      el.innerHTML = '<div class="map-error">' + H.icon('map') + '<p>Map could not load. Check your connection and try again.</p><button type="button" class="btn btn-ghost" data-retry-map>Try again</button></div>';
    });
  }

  /* Apply filter changes: URL, header, results, map. */
  function apply(scrollTop) {
    history.replaceState(null, '', urlFor(S));
    lastBrowseUrl = urlFor(S);
    renderHeader();
    renderResults();
    renderNav();
    if (scrollTop && !desktop.matches && mode === 'list') window.scrollTo(0, 0);
    if (scrollTop && desktop.matches) window.scrollTo({ top: 0 });
  }
  A.apply = apply;

  /* ---------------- Filters dialog ---------------- */
  function openFilters() {
    var D = clone(S);
    if (!D.max) D.max = PRICE_MAX;
    if (!D.min) D.min = PRICE_MIN;
    var chipBtn = function (label, on, attrs) { return chip(label, on, attrs); };
    function body() {
      var schools = chipBtn(t('Any school'), !D.place || D.place.indexOf('school:') !== 0, 'data-f-place=""') +
        HAVN_SCHOOLS.map(function (s) { return chipBtn(s.short, D.place === 'school:' + s.id, 'data-f-place="school:' + s.id + '"'); }).join('');
      var types = HAVN_ROOM_TYPES.map(function (x) { return chipBtn(t(x), D.types.indexOf(x) !== -1, 'data-f-type="' + x + '"'); }).join('');
      var who = [['', 'Anyone'], ['female', 'Female only'], ['male', 'Male only'], ['mixed', 'Mixed']].map(function (g) {
        return chipBtn(t(g[1]), D.gender === g[0], 'data-f-gender="' + g[0] + '"');
      }).join('');
      var amen = Object.keys(HAVN_AMENITIES).filter(function (k) { return k !== 'shared-cr'; }).map(function (k) {
        return chipBtn(t(HAVN_AMENITIES[k].label), D.amen.indexOf(k) !== -1, 'data-f-amen="' + k + '"');
      }).join('');
      return '<section class="f-sec"><h3>' + H.esc(t('Price per month')) + '</h3>' +
          '<div class="range" style="--a:' + pct(D.min) + '%;--b:' + pct(D.max) + '%">' +
            '<div class="range-track"></div>' +
            '<input type="range" id="f-min" min="' + PRICE_MIN + '" max="' + PRICE_MAX + '" step="' + PRICE_STEP + '" value="' + D.min + '" aria-label="Minimum price">' +
            '<input type="range" id="f-max" min="' + PRICE_MIN + '" max="' + PRICE_MAX + '" step="' + PRICE_STEP + '" value="' + D.max + '" aria-label="Maximum price">' +
          '</div><p class="range-out" id="f-range-out">' + rangeText() + '</p></section>' +
        '<label class="f-switch"><span>' + H.esc(t('Only rooms available now')) + '</span><input type="checkbox" id="f-avail"' + (D.avail ? ' checked' : '') + '><i aria-hidden="true"></i></label>' +
        '<section class="f-sec"><h3>' + H.esc(t('Near school')) + '</h3><div class="chip-wrap">' + schools + '</div></section>' +
        '<section class="f-sec"><h3>' + H.esc(t('Room type')) + '</h3><div class="chip-wrap">' + types + '</div></section>' +
        '<section class="f-sec"><h3>' + H.esc(t('Who can stay')) + '</h3><div class="chip-wrap">' + who + '</div></section>' +
        '<section class="f-sec"><h3>' + H.esc(t('Amenities')) + '</h3><div class="chip-wrap">' + amen + '</div></section>';
    }
    function pct(v) { return ((v - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100; }
    function rangeText() { return H.peso(D.min) + ' – ' + H.peso(D.max) + (D.max >= PRICE_MAX ? '+' : ''); }
    function norm(d) {
      var o = clone(d);
      if (o.min <= PRICE_MIN) o.min = 0;
      if (o.max >= PRICE_MAX) o.max = 0;
      return o;
    }
    function countText() {
      var n = results(norm(D)).length;
      return n === 1 ? t('Show 1 room') : t('Show {n} rooms', { n: n });
    }
    var dlg = H.dialog({
      title: t('Filters'),
      className: 'sheet',
      body: '<div id="f-body">' + body() + '</div>',
      foot: '<button type="button" class="btn-link" data-f-clear>' + H.esc(t('Clear all')) + '</button>' +
        '<button type="button" class="btn btn-primary" data-f-apply>' + H.esc(countText()) + '</button>',
      focus: '[data-close]',
    });
    var root = dlg.el;
    function refresh(keepRange) {
      if (!keepRange) { $('#f-body', root).innerHTML = body(); bindRange(); }
      $('[data-f-apply]', root).textContent = countText();
    }
    function bindRange() {
      var mn = $('#f-min', root), mx = $('#f-max', root), box = $('.range', root);
      function upd(e) {
        var a = +mn.value, b = +mx.value;
        if (a > b - PRICE_STEP) { if (e && e.target === mn) a = b - PRICE_STEP; else b = a + PRICE_STEP; }
        a = Math.max(PRICE_MIN, a); b = Math.min(PRICE_MAX, b);
        mn.value = a; mx.value = b; D.min = a; D.max = b;
        box.style.setProperty('--a', pct(a) + '%'); box.style.setProperty('--b', pct(b) + '%');
        $('#f-range-out', root).textContent = rangeText();
        refresh(true);
      }
      mn.addEventListener('input', upd); mx.addEventListener('input', upd);
    }
    bindRange();
    root.addEventListener('change', function (e) { if (e.target.id === 'f-avail') { D.avail = e.target.checked; refresh(true); } });
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-f-place')) { var p = b.getAttribute('data-f-place'); D.place = p; D.q = ''; if (p) D.bbox = null; refresh(); }
      else if (b.hasAttribute('data-f-type')) { var x = b.getAttribute('data-f-type'), i = D.types.indexOf(x); if (i === -1) D.types.push(x); else D.types.splice(i, 1); refresh(); }
      else if (b.hasAttribute('data-f-gender')) { D.gender = b.getAttribute('data-f-gender'); refresh(); }
      else if (b.hasAttribute('data-f-amen')) { var a = b.getAttribute('data-f-amen'), j = D.amen.indexOf(a); if (j === -1) D.amen.push(a); else D.amen.splice(j, 1); refresh(); }
      else if (b.hasAttribute('data-f-clear')) { var keep = { saved: D.saved, sort: D.sort }; D = clone(DEFAULTS); D.saved = keep.saved; D.sort = keep.sort; D.min = PRICE_MIN; D.max = PRICE_MAX; refresh(); }
      else if (b.hasAttribute('data-f-apply')) { S = norm(D); dlg.close(); apply(true); }
    });
  }

  /* ---------------- Room view ---------------- */
  function showRoom(id) {
    var l = H.byId(id);
    if (view === 'browse') browseScroll = window.scrollY;
    if (view === 'home') homeScroll = window.scrollY;
    view = 'room';
    document.body.classList.remove('map-open');
    leaveHome();
    $('#view-browse').hidden = true;
    var host = $('#view-room');
    host.hidden = false;
    renderHeader();
    renderNav();
    RoomView.render(host, l);
    window.scrollTo(0, 0);
  }

  function showBrowse() {
    var fromRoom = view === 'room';
    readUrl();
    lastBrowseUrl = urlFor(S);
    view = 'browse';
    leaveHome();
    var host = $('#view-room');
    host.hidden = true;
    RoomView.destroy();
    host.innerHTML = '';
    $('#view-browse').hidden = false;
    renderHeader();
    if (!$('#view-browse .browse')) renderBrowse();
    else renderResults();
    setMode(mode);
    if (fromRoom) window.scrollTo(0, browseScroll);
    if (bmap) setTimeout(function () { bmap.resize(); }, 0);
  }

  function route() {
    var m = location.pathname.match(/^\/room\/([\w-]+)\/?$/);
    if (m) showRoom(m[1]);
    else if (/^\/list\/?$/.test(location.pathname)) {
      // havnph.com/list: the link to share with landlords opens the listing form.
      history.replaceState(null, '', '/');
      showHome();
      Landlord.open();
    } else if (/^\/rooms\/?$/.test(location.pathname)) {
      showBrowse();
    } else if (location.search) {
      // Older links put the search on "/" (e.g. /?near=addu): they open the rooms list.
      history.replaceState(null, '', '/rooms' + location.search);
      showBrowse();
    } else {
      if (location.pathname !== '/') history.replaceState(null, '', '/');
      showHome();
    }
  }

  A.go = function (href) {
    if (href === location.pathname + location.search) { route(); return; }
    history.pushState({ fromBrowse: view === 'browse' || view === 'home' }, '', href);
    route();
  };
  A.lastBrowseUrl = function () { return lastBrowseUrl; };
  A.placeSchoolId = function () { var s = placeSchool(S); return s && s.id; };

  /* ---------------- Global events ---------------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-link]');
    if (a && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      if (e.target.closest('[data-step], [data-save]')) return;
      e.preventDefault();
      var href = a.getAttribute('href');
      if (a.hasAttribute('data-back') && history.state && history.state.fromBrowse) { history.back(); return; }
      if (a.hasAttribute('data-home')) { S = clone(DEFAULTS); mode = 'list'; }
      A.go(href);
      return;
    }
    var save = e.target.closest('[data-save]');
    if (save) {
      e.preventDefault();
      var id = save.getAttribute('data-save');
      var on = H.saved.toggle(id);
      H.toast(on ? t('Saved') : t('Remove from saved'));
      return;
    }
    if (e.target.closest('[data-open-filters]')) { openFilters(); return; }
    if (e.target.closest('[data-find]')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(function () { var q = $('#view-home #q'); if (q) q.focus({ preventScroll: true }); }, 350);
      return;
    }
    if (e.target.closest('[data-clear-all]')) { var k = { saved: S.saved, sort: S.sort }; S = clone(DEFAULTS); S.saved = k.saved; apply(true); return; }
    if (e.target.closest('[data-clear-map]')) { S.bbox = null; apply(true); return; }
    if (e.target.closest('[data-show-list]')) { setMode('list'); window.scrollTo(0, 0); return; }
    if (e.target.closest('[data-retry-map]')) { $('#bmap').innerHTML = '<div class="map-loading"></div>'; ensureMap(); return; }
    var lb = e.target.closest('[data-lang]');
    if (lb) {
      HAVN_I18N.set(lb.getAttribute('data-lang'));
      renderHeader(); renderNav();
      if (view === 'browse') renderBrowse(); else if (view === 'home') renderHome(); else RoomView.render($('#view-room'), H.byId(location.pathname.split('/')[2]));
    }
  });

  document.addEventListener('havn:saved', function () {
    $$('[data-save]').forEach(function (b) {
      var on = H.saved.has(b.getAttribute('data-save'));
      b.setAttribute('aria-pressed', on);
      if (b.classList.contains('heart')) b.setAttribute('aria-label', on ? t('Remove from saved') : t('Save this room'));
      var lab = b.querySelector('[data-save-label]'); if (lab) lab.textContent = on ? t('Saved') : t('Save');
    });
    var hdrCount = $('.saved-link');
    if (hdrCount) {
      var n = H.saved.count();
      var c = $('.count', hdrCount);
      if (n && !c) { c = document.createElement('b'); c.className = 'count'; hdrCount.appendChild(c); }
      if (c) { if (n) c.textContent = n; else c.remove(); }
    }
    renderNav();
    if (view === 'browse' && S.saved) renderResults();
  });

  window.addEventListener('popstate', route);
  desktop.addEventListener('change', function () {
    document.body.classList.toggle('map-open', mode === 'map' && !desktop.matches);
    if (view === 'browse' && desktop.matches) ensureMap();
    if (bmap) setTimeout(function () { bmap.resize(); }, 50);
  });

  /* Header height → CSS var (sticky map pane, mobile map padding). */
  var hdrEl = $('#site-header');
  function measure() {
    document.documentElement.style.setProperty('--hdr-h', hdrEl.offsetHeight + 'px');
    var top = $('.hdr', hdrEl);
    document.documentElement.style.setProperty('--hdr-top-h', top ? top.offsetHeight + 'px' : '0px');
  }
  if (window.ResizeObserver) new ResizeObserver(measure).observe(hdrEl);

  /* ---------------- Boot ---------------- */
  $('#main').innerHTML = '<div id="view-home" hidden></div><div id="view-browse" hidden></div><div id="view-room" hidden></div>';
  HAVN_I18N.set(HAVN_I18N.get());
  route();
  measure();
  Landlord.startAsk();
})();
