/* Havn PH — landlords: the "Do you own a boarding house?" pop-up and the listing form.
 *
 * Settings live in data.js (HAVN_CONFIG):
 *   phone            number landlords can call or text; empty = the Call/Text buttons are hidden
 *   landlordFormKey  Web3Forms access key; form answers arrive by email. Empty = the form
 *                    hands the details to Messenger instead (it never pretends to send).
 */
(function () {
  var L = (window.Landlord = {});
  var C = window.HAVN_CONFIG || {};
  var PHONE = String(C.phone || '').trim();
  var ASK_KEY = 'havn-landlord-ask', SENT_KEY = 'havn-landlord-sent';
  var ASK_DELAY = 15000;                   // first visit: ask after 15 seconds
  var REST_CLOSED = 14, REST_RENTER = 90;  // days before asking again (closed / "I'm looking for a room")
  var askEl = null, opener = null, timer = 0, dlg = null;

  function $(s, r) { return (r || document).querySelector(s); }
  function telHref() {
    var d = PHONE.replace(/[^\d+]/g, '');
    return d.charAt(0) === '0' ? '+63' + d.slice(1) : d;
  }
  // A Philippine mobile (09..., +639..., 639...) or any 7-13 digit number.
  function cleanPhone(v) {
    var d = String(v).replace(/[^\d]/g, '');
    if (/^639\d{9}$/.test(d)) d = '0' + d.slice(2);
    if (/^9\d{9}$/.test(d)) d = '0' + d;
    return d.length >= 7 && d.length <= 13 ? d : '';
  }
  function showPhone(d) { return /^09\d{9}$/.test(d) ? d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7) : d; }

  /* ---------------- The pop-up: centered, page dimmed behind it ---------------- */
  function due() {
    if (H.store.get(SENT_KEY, false)) return false;
    return Date.now() > H.store.get(ASK_KEY, 0);
  }
  function rest(days) { H.store.set(ASK_KEY, Date.now() + days * 864e5); }
  function canShow() {
    if (document.querySelector('.dlg-wrap, .viewer')) return false;
    var a = document.activeElement;
    return !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); // never interrupt someone typing
  }
  // A bright, calm room for the photo side, and a preview of what a landlord's listing looks like.
  var ASK_PHOTO = '/assets/photos/u-6a9f6d5f-1200.webp';
  function point(icon, text) {
    return '<li><span class="ll-ask-pi" aria-hidden="true">' + H.icon(icon) + '</span><span>' + H.esc(text) + '</span></li>';
  }
  function showAsk() {
    if (askEl) return;
    opener = document.activeElement;
    askEl = document.createElement('div');
    askEl.className = 'll-ask';
    askEl.innerHTML =
      '<div class="ll-ask-backdrop" data-ll-close="' + REST_CLOSED + '"></div>' +
      '<div class="ll-ask-card" role="dialog" aria-modal="true" aria-labelledby="ll-ask-t" aria-describedby="ll-ask-s" tabindex="-1">' +
        '<button type="button" class="ll-ask-x" data-ll-close="' + REST_CLOSED + '" aria-label="' + H.esc(t('Close')) + '">' + H.icon('x') + '</button>' +
        '<div class="ll-ask-media" aria-hidden="true">' +
          '<img src="' + ASK_PHOTO + '" alt="" width="1200" height="900">' +
          '<span class="ll-ask-brand"><span class="logo-word">havn</span><span class="logo-dot"></span></span>' +
          '<div class="ll-ask-preview">' +
            '<span class="ll-ask-preview-k">' + H.esc(t('Your listing')) + '</span>' +
            '<b>' + H.esc(t('Your boarding house')) + '</b>' +
            '<span class="ll-ask-preview-near">' + H.icon('walk') + H.esc(t('{n} min walk to {school}', { n: 5, school: 'AdDU' })) + '</span>' +
            '<span class="ll-ask-preview-row"><span><b>' + H.peso(4500) + '</b> ' + H.esc(t('/ month')) + '</span>' +
              '<span class="ll-ask-status"><i></i>' + H.esc(t('Available now')) + '</span></span>' +
          '</div>' +
        '</div>' +
        '<div class="ll-ask-body">' +
          '<p class="ll-ask-eyebrow">' + H.esc(t('For landlords')) + '</p>' +
          '<h2 id="ll-ask-t">' + H.esc(t('Do you own a boarding house?')) + '</h2>' +
          '<p id="ll-ask-s" class="ll-ask-lead">' + H.esc(t('Havn helps students and young workers in Davao find rooms by school, budget and room type. Add yours.')) + '</p>' +
          '<ul class="ll-ask-points">' +
            point('cap', t('Renters see the walk time to their school')) +
            point('pin', t('Your photos, price and exact spot on the map')) +
            point('clock', PHONE ? t('Fill up a short form, or just call or text us') : t('Fill up a short form and we\'ll get back to you')) +
          '</ul>' +
          '<div class="ll-ask-btns">' +
            '<a class="btn ll-ask-go" href="/list" data-ll-open><span>' + H.esc(t('List my place')) + '</span>' + H.icon('arrow-right') + '</a>' +
            '<button type="button" class="ll-ask-no" data-ll-close="' + REST_RENTER + '">' + H.esc(t('No, I\'m looking for a room')) + '</button>' +
          '</div>' +
          (PHONE ? '<p class="ll-ask-call">' + H.esc(t('Prefer to talk?')) + ' <a href="tel:' + H.esc(telHref()) + '">' + H.icon('phone') + H.esc(PHONE) + '</a></p>' : '') +
        '</div>' +
      '</div>';
    document.body.appendChild(askEl);
    H.lockScroll(true);
    document.addEventListener('keydown', onAskKey);
    askEl.getBoundingClientRect(); // start from the closed state so the entrance animates
    requestAnimationFrame(function () { if (askEl) askEl.classList.add('open'); });
    $('.ll-ask-card', askEl).focus({ preventScroll: true });
  }
  function onAskKey(e) {
    if (!askEl) return;
    var card = $('.ll-ask-card', askEl);
    if (e.key === 'Escape') { e.preventDefault(); closeAsk(REST_CLOSED); }
    else if (e.key === 'Tab' && document.activeElement === card) {
      e.preventDefault();
      var f = card.querySelectorAll('a[href], button');
      f[e.shiftKey ? f.length - 1 : 0].focus();
    } else if (e.key === 'Tab') H.trap(e, card);
  }
  function closeAsk(days, keepFocus) {
    clearTimeout(timer);
    if (days) rest(days);
    if (!askEl) return;
    var el = askEl; askEl = null;
    document.removeEventListener('keydown', onAskKey);
    H.lockScroll(false);
    el.classList.add('closing');
    el.classList.remove('open');
    setTimeout(function () { el.remove(); }, 220);
    if (!keepFocus && opener && opener.focus) opener.focus({ preventScroll: true });
  }
  L.startAsk = function () {
    if (!due()) return;
    // Fetch the photo early so the pop-up never opens on a grey box.
    setTimeout(function () { if (due()) new Image().src = ASK_PHOTO; }, Math.max(0, ASK_DELAY - 6000));
    timer = setTimeout(function tick() {
      if (!due()) return;
      if (canShow()) showAsk(); else timer = setTimeout(tick, 3000);
    }, ASK_DELAY);
  };

  /* ---------------- The form ---------------- */
  function chipInput(type, name, value, label, checked) {
    return '<label class="chip chip-in"><input type="' + type + '" name="' + name + '" value="' + H.esc(value) + '"' + (checked ? ' checked' : '') + '><span>' + H.esc(label) + '</span></label>';
  }
  function opt() { return ' <small>' + H.esc(t('optional')) + '</small>'; }
  function field(id, label, input, optional) {
    return '<div class="field"><label for="' + id + '">' + H.esc(label) + (optional ? opt() : '') + '</label>' + input +
      '<p class="err" id="' + id + '-err" hidden></p></div>';
  }

  function formHtml() {
    var talk = PHONE
      ? '<div class="ll-talk"><p><b>' + H.esc(t('Prefer to talk?')) + '</b><span>' + H.esc(PHONE) + '</span></p>' +
          '<div class="ll-talk-btns">' +
            '<a class="btn btn-ghost btn-sm" href="tel:' + H.esc(telHref()) + '">' + H.icon('phone') + '<span>' + H.esc(t('Call')) + '</span></a>' +
            '<a class="btn btn-ghost btn-sm" href="sms:' + H.esc(telHref()) + '">' + H.icon('message') + '<span>' + H.esc(t('Text')) + '</span></a>' +
          '</div></div>' +
        '<p class="ll-lead">' + H.esc(t('Or send your details and we\'ll get back to you.')) + '</p>'
      : '<p class="ll-lead">' + H.esc(t('Send your details and we\'ll get back to you.')) + '</p>';
    return talk +
      '<form id="ll-form" novalidate>' +
        field('ll-name', t('Your name'), '<input id="ll-name" type="text" autocomplete="name" maxlength="80" required aria-describedby="ll-name-err">') +
        field('ll-phone', t('Mobile number'), '<input id="ll-phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="0917 123 4567" required aria-describedby="ll-phone-err">') +
        '<fieldset class="field"><legend>' + H.esc(t('How should we reach you?')) + '</legend><div class="chip-wrap">' +
          chipInput('radio', 'reach', 'Text', t('Text me'), false) + chipInput('radio', 'reach', 'Call', t('Call me'), false) + chipInput('radio', 'reach', 'Either', t('Either'), true) +
        '</div></fieldset>' +
        field('ll-where', t('Where is your place?'), '<input id="ll-where" type="text" maxlength="140" placeholder="' + H.esc(t('e.g. Bajada, near AdDU')) + '" required aria-describedby="ll-where-err">') +
        '<fieldset class="field"><legend>' + H.esc(t('What do you rent out?')) + opt() + '</legend><div class="chip-wrap">' +
          HAVN_ROOM_TYPES.map(function (x) { return chipInput('checkbox', 'types', x, t(x), false); }).join('') +
        '</div></fieldset>' +
        field('ll-count', t('How many rooms or beds?'), '<input id="ll-count" type="number" inputmode="numeric" min="1" max="999">', true) +
        field('ll-notes', t('Anything else?'), '<textarea id="ll-notes" rows="3" maxlength="1000" placeholder="' + H.esc(t('Rent, house rules, when rooms are free…')) + '"></textarea>', true) +
        '<input type="checkbox" name="botcheck" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        '<p class="fine">' + H.esc(t('We only use your details to contact you about listing your place.')) + '</p>' +
        '<p class="ll-error" role="alert" hidden></p>' +
      '</form>';
  }

  function values(root) {
    var f = $('#ll-form', root);
    return {
      name: $('#ll-name', f).value.trim(),
      phoneRaw: $('#ll-phone', f).value.trim(),
      phone: cleanPhone($('#ll-phone', f).value),
      reach: ($('input[name="reach"]:checked', f) || {}).value || 'Either',
      where: $('#ll-where', f).value.trim(),
      types: Array.prototype.map.call(f.querySelectorAll('input[name="types"]:checked'), function (i) { return i.value; }),
      count: $('#ll-count', f).value.trim(),
      notes: $('#ll-notes', f).value.trim(),
      bot: $('.hp', f).checked,
    };
  }

  function setErr(root, id, msg) {
    var input = $('#' + id, root), err = $('#' + id + '-err', root);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    err.textContent = msg || '';
    err.hidden = !msg;
  }
  function validate(root, v) {
    var bad = [];
    setErr(root, 'll-name', v.name ? '' : t('Please enter your name.')); if (!v.name) bad.push('ll-name');
    setErr(root, 'll-phone', v.phone ? '' : t('Please enter a mobile number like 0917 123 4567.')); if (!v.phone) bad.push('ll-phone');
    setErr(root, 'll-where', v.where ? '' : t('Please tell us where your place is.')); if (!v.where) bad.push('ll-where');
    return bad.length ? $('#' + bad[0], root) : null;
  }

  function summary(v) {
    return t('Hi Havn! I\'d like to list my boarding house.') + '\n' +
      'Name: ' + v.name + '\nMobile: ' + showPhone(v.phone) + ' (' + v.reach + ')\nWhere: ' + v.where +
      (v.types.length ? '\nRents out: ' + v.types.join(', ') : '') +
      (v.count ? '\nRooms or beds: ' + v.count : '') +
      (v.notes ? '\nNotes: ' + v.notes : '');
  }

  function send(v) {
    var ctl = window.AbortController ? new AbortController() : null;
    var stop = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    var body = {
      access_key: C.landlordFormKey,
      subject: 'New landlord: ' + v.name + ' (' + v.where + ')',
      from_name: 'Havn PH website',
      botcheck: false,
      'Name': v.name,
      'Mobile': showPhone(v.phone),
      'Best way to reach': v.reach,
      'Where': v.where,
      'Rents out': v.types.join(', ') || '-',
      'Rooms or beds': v.count || '-',
      'Notes': v.notes || '-',
      'Site language': HAVN_I18N.get(),
    };
    return fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ctl ? ctl.signal : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.success) throw new Error((j && j.message) || 'HTTP ' + r.status);
      });
    }).then(function () { clearTimeout(stop); }, function (e) { clearTimeout(stop); throw e; });
  }

  function done(root, v) {
    H.store.set(SENT_KEY, true);
    var first = v.name.split(/\s+/)[0];
    $('.dlg-body', root).innerHTML =
      '<div class="ll-done">' +
        '<span class="ll-done-ic" aria-hidden="true">' + H.icon('check') + '</span>' +
        '<h3 tabindex="-1">' + H.esc(t('Thanks, {name}!', { name: first })) + '</h3>' +
        '<p>' + H.esc(t('We got your details. We\'ll get in touch soon at {phone}.', { phone: showPhone(v.phone) })) + '</p>' +
      '</div>';
    $('.dlg-foot', root).innerHTML = '<button type="button" class="btn btn-primary btn-block" data-close>' + H.esc(t('Back to rooms')) + '</button>';
    $('.ll-done h3', root).focus();
  }

  L.open = function () {
    closeAsk(REST_CLOSED, true);
    if (dlg) return;
    var hasKey = !!C.landlordFormKey;
    dlg = H.dialog({
      title: t('List your boarding house'),
      className: 'sheet landlord',
      body: formHtml(),
      foot: '<button type="submit" form="ll-form" class="btn btn-primary btn-block" data-ll-send>' +
        (hasKey ? '<span>' + H.esc(t('Send')) + '</span>' : H.icon('message') + '<span>' + H.esc(t('Send on Messenger')) + '</span>') + '</button>',
      focus: '#ll-name',
      onClose: function () { dlg = null; },
    });
    var root = dlg.el, form = $('#ll-form', root), btn = $('[data-ll-send]', root), errBox = $('.ll-error', root);

    form.addEventListener('input', function (e) {
      if (e.target.getAttribute('aria-invalid') === 'true') setErr(root, e.target.id, '');
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      errBox.hidden = true;
      var v = values(root);
      var bad = validate(root, v);
      if (bad) { bad.focus(); return; }
      if (v.bot) { done(root, v); return; }
      if (!hasKey) {
        // Not connected to email yet: hand the details to Messenger, honestly.
        var text = summary(v);
        H.copy(text);
        window.open(H.messengerUrl(text), '_blank', 'noopener');
        H.toast(t('Message copied. Paste it in Messenger.'));
        dlg.close();
        return;
      }
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      $('span', btn).textContent = t('Sending…');
      send(v).then(function () { done(root, v); }, function () {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        $('span', btn).textContent = t('Send');
        errBox.textContent = t('Could not send. Check your connection and try again.') + (PHONE ? ' ' + t('You can also call or text us at {phone}.', { phone: PHONE }) : '');
        errBox.hidden = false;
      });
    });
  };

  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-ll-open]');
    if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) { e.preventDefault(); L.open(); return; }
    var x = e.target.closest('[data-ll-close]');
    if (x) closeAsk(+x.getAttribute('data-ll-close'));
  });
})();
