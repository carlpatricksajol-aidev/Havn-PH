/* ECStay — shared helpers (formatting, distances, saved rooms, dialogs). */
(function () {
  var H = (window.H = {});

  H.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  H.icon = function (name, cls) {
    return '<svg class="i ' + (cls || '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"/></svg>';
  };

  H.peso = function (n) { return '₱' + Number(n).toLocaleString('en-PH'); };

  H.photo = function (id, w) { return '/assets/photos/' + id + '-' + (w || 640) + '.webp'; };

  H.byId = function (id) {
    for (var i = 0; i < HAVN_LISTINGS.length; i++) if (HAVN_LISTINGS[i].id === id) return HAVN_LISTINGS[i];
    return null;
  };
  // A school or a landmark (mall, hospital, office) by id: both can be the "near" place of a search.
  H.school = function (id) {
    for (var i = 0; i < HAVN_SCHOOLS.length; i++) if (HAVN_SCHOOLS[i].id === id) return HAVN_SCHOOLS[i];
    var lm = window.HAVN_LANDMARKS || [];
    for (var j = 0; j < lm.length; j++) if (lm[j].id === id) return lm[j];
    return null;
  };
  H.landmark = function (id) { var p = H.school(id); return p && p.kind ? p : null; };

  /* Straight-line km between two points. */
  H.km = function (a, b) {
    var R = 6371, toR = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  };
  /* Walking minutes: straight line x1.3 for streets, at 4.8 km/h. */
  H.walkMin = function (km) { return Math.max(1, Math.round((km * 1.3) / 4.8 * 60)); };

  H.schoolsByDistance = function (l) {
    return HAVN_SCHOOLS.map(function (s) { return { school: s, km: H.km(l, s) }; })
      .sort(function (a, b) { return a.km - b.km; });
  };

  /* "6 min walk to AdDU" / "2.4 km to USeP" / landmark. */
  H.nearText = function (l, schoolId) {
    var d = schoolId ? { school: H.school(schoolId), km: H.km(l, H.school(schoolId)) } : H.schoolsByDistance(l)[0];
    if (!schoolId && l.landmark && d.km > 3) return l.landmark;
    var min = H.walkMin(d.km);
    if (min <= 25) return t('{n} min walk to {school}', { n: min, school: d.school.short });
    return t('{km} km to {school}', { km: d.km.toFixed(1), school: d.school.short });
  };
  H.nearName = function (l) {
    var d = H.schoolsByDistance(l)[0];
    if (l.landmark && d.km > 3) return l.landmark;
    return d.school.short;
  };

  H.genderLabel = function (g) {
    return g === 'female' ? t('Female only') : g === 'male' ? t('Male only') : t('Mixed');
  };

  H.statusLabel = function (l) {
    if (l.status === 'full') return t('Fully booked');
    if (l.status === 'few') return l.slots === 1 ? t('1 slot left') : t('{n} slots left', { n: l.slots });
    return t('Available now');
  };

  /* Storage that never throws (private mode, blocked storage). */
  H.store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  var saved = H.store.get('havn-saved', []);
  H.saved = {
    has: function (id) { return saved.indexOf(id) !== -1; },
    count: function () { return saved.filter(H.byId).length; },
    toggle: function (id) {
      var i = saved.indexOf(id);
      if (i === -1) saved.push(id); else saved.splice(i, 1);
      H.store.set('havn-saved', saved);
      document.dispatchEvent(new CustomEvent('havn:saved'));
      return i === -1;
    },
  };

  var toastTimer;
  H.toast = function (msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  };

  H.copy = function (text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove();
      return ok;
    }
  };

  H.share = function (url, title) {
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function () {});
      return;
    }
    H.copy(url).then(function () { H.toast(t('Link copied')); });
  };

  H.messengerUrl = function (text) {
    var u = 'https://m.me/' + encodeURIComponent(HAVN_CONFIG.messenger);
    return text ? u + '?text=' + encodeURIComponent(text) : u;
  };

  /* Body scroll lock that survives nested dialogs. */
  var locks = 0, lockY = 0;
  H.lockScroll = function (on) {
    if (on) {
      if (locks++ === 0) {
        lockY = window.scrollY;
        document.body.style.top = -lockY + 'px';
        document.body.classList.add('locked');
      }
    } else if (locks > 0 && --locks === 0) {
      document.body.classList.remove('locked');
      document.body.style.top = '';
      window.scrollTo(0, lockY);
    }
  };

  /* Modal dialog / bottom sheet. Returns { el, close }. */
  H.dialog = function (opts) {
    var opener = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'dlg-wrap ' + (opts.className || '');
    wrap.innerHTML =
      '<div class="dlg-backdrop" data-close></div>' +
      '<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-title">' +
      '<div class="dlg-head"><h2 id="dlg-title">' + H.esc(opts.title) + '</h2>' +
      '<button class="icon-btn" data-close aria-label="' + H.esc(t('Close')) + '">' + H.icon('x') + '</button></div>' +
      '<div class="dlg-body">' + opts.body + '</div>' +
      (opts.foot ? '<div class="dlg-foot">' + opts.foot + '</div>' : '') +
      '</div>';
    document.body.appendChild(wrap);
    H.lockScroll(true);
    requestAnimationFrame(function () { wrap.classList.add('open'); });
    var dlg = wrap.querySelector('.dlg');
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') trap(e, dlg);
    }
    function close() {
      document.removeEventListener('keydown', onKey);
      wrap.classList.remove('open');
      H.lockScroll(false);
      setTimeout(function () { wrap.remove(); }, 220);
      if (opener && opener.focus) opener.focus();
      if (opts.onClose) opts.onClose();
    }
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    var first = dlg.querySelector(opts.focus || '.dlg-body button, .dlg-body input, .dlg-body select, .dlg-body textarea');
    (first || dlg.querySelector('[data-close]')).focus({ preventScroll: true });
    return { el: wrap, close: close };
  };

  function trap(e, root) {
    var f = root.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    var a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
  H.trap = trap;

  /* Photo carousel inside a card or gallery: arrows + dots driven by scroll. */
  H.bindSlides = function (root) {
    root.querySelectorAll('[data-slides]').forEach(function (box) {
      if (box._bound) return; box._bound = true;
      var track = box.querySelector('.slides');
      var dots = box.querySelectorAll('.dots i');
      var count = box.querySelector('[data-count]');
      var n = track.children.length;
      function idx() { return Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); }
      function paint() {
        var i = idx();
        dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
        if (count) count.textContent = (i + 1) + ' / ' + n;
        box.classList.toggle('at-start', i <= 0);
        box.classList.toggle('at-end', i >= n - 1);
      }
      var raf;
      track.addEventListener('scroll', function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }, { passive: true });
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-step]');
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        var to = Math.min(n - 1, Math.max(0, idx() + Number(b.getAttribute('data-step'))));
        track.scrollTo({ left: to * track.clientWidth, behavior: 'smooth' });
      });
      paint();
    });
  };

  /* Images fade in over the skeleton once loaded. */
  document.addEventListener('load', function (e) {
    if (e.target.tagName === 'IMG') e.target.classList.add('ok');
  }, true);
})();
