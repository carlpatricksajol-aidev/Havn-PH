/* ECStay — Messages (/messages, /messages/<conversation id>), for anyone signed in.
 * One inbox for both sides: conversations about rooms you asked about (you are the renter) and about your own
 * listings (you are the Keeper). Admins also see conversations where the ECStay team answers (sample rooms).
 * Left: the list of conversations. Right: the open conversation, the room it is about, and the reply box.
 * Data comes from accounts.js (ECS.threads, ECS.sendReply). */
(function () {
  var MV = (window.MsgView = {});
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return H.esc(s); }
  var timer = null, state = null;

  function when(d) {
    var x = new Date(d), n = new Date();
    if (x.toDateString() === n.toDateString()) return x.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
    return x.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  }
  function dayLabel(d) {
    var x = new Date(d), n = new Date(), y = new Date(n.getTime() - 864e5);
    if (x.toDateString() === n.toDateString()) return t('Today');
    if (x.toDateString() === y.toDateString()) return t('Yesterday');
    return x.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function initials(n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join(''); }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

  /* Who is on the other side, in words the reader understands. */
  function other(th) {
    if (th.role === 'renter') return th.q.listing_id ? t('Keeper of {room}', { room: th.room.name }) : t('ECStay team');
    return th.q.renter_name || t('Renter');
  }
  function roleTag(th) { return th.role === 'renter' ? t('You asked') : th.role === 'keeper' ? t('Your listing') : t('Team'); }
  function who(th, m) {
    if (m.sender_role === th.role) return t('You');
    if (m.sender_role === 'renter') return firstName(th.q.renter_name) || t('Renter');
    return m.sender_role === 'keeper' ? t('Keeper') : t('ECStay team');
  }
  function cover(th) { return th.room.photo ? '<img src="' + esc(H.photo(th.room.photo, 640)) + '" alt="" loading="lazy">' : H.icon('home'); }

  MV.render = function (host, id) {
    clearInterval(timer);
    if (!ECS.enabled()) { App.go('/list'); return; }
    host.innerHTML = (window.HostView ? HostView.demoBar() : '') + '<div class="inbox"><div class="host-loading"><span class="spin"></span></div></div>';
    ECS.session().then(function (s) {
      if (!s) { App.go('/signin?next=' + encodeURIComponent(location.pathname)); return; }
      return ECS.threads().then(function (list) {
        state = { host: host, list: list, id: id || null, filter: 'all' };
        paint();
        // Quiet refresh while the page is open, so a reply from the other side shows up.
        timer = setInterval(function () {
          if (!document.body.contains($('.inbox', host))) { clearInterval(timer); return; }
          if (document.hidden) return;
          ECS.threads().then(function (fresh) {
            var before = JSON.stringify(state.list.map(function (x) { return [x.q.id, x.msgs.length]; }));
            state.list = fresh;
            if (before !== JSON.stringify(fresh.map(function (x) { return [x.q.id, x.msgs.length]; }))) paint(true);
          }).catch(function () {});
        }, 20000);
      });
    }).catch(function (x) { host.innerHTML = '<div class="inbox"><p class="host-error">' + esc(x.message) + '</p></div>'; });
  };

  function paint(keepDraft) {
    var host = state.host, list = state.list;
    var draft = keepDraft && $('.msg-box textarea', host) ? $('.msg-box textarea', host).value : '';
    var hasBoth = list.some(function (x) { return x.role === 'renter'; }) && list.some(function (x) { return x.role !== 'renter'; });
    var shown = list.filter(function (x) { return state.filter === 'all' || (state.filter === 'renter' ? x.role === 'renter' : x.role !== 'renter'); });
    var wide = window.matchMedia('(min-width: 900px)').matches;
    var open = list.filter(function (x) { return x.q.id === state.id; })[0] || (wide && !state.id ? shown[0] : null);

    $('.inbox', host).outerHTML =
      '<div class="inbox' + (open && state.id ? ' is-open' : '') + '">' +
        '<aside class="msg-side">' +
          '<div class="msg-side-top"><h1>' + esc(t('Messages')) + '</h1>' +
            (hasBoth ? '<div class="msg-tabs" role="tablist">' + [['all', 'All'], ['renter', 'Rooms I asked about'], ['keeper', 'My listings']].map(function (o) {
              return '<button type="button" role="tab" aria-selected="' + (state.filter === o[0]) + '" class="' + (state.filter === o[0] ? 'on' : '') + '" data-msg-filter="' + o[0] + '">' + esc(t(o[1])) + '</button>';
            }).join('') + '</div>' : '') +
          '</div>' +
          (shown.length ? '<ul class="msg-list">' + shown.map(function (th) {
            var last = th.msgs[th.msgs.length - 1];
            return '<li><a href="/messages/' + esc(th.q.id) + '" data-link class="msg-row' + (open && open.q.id === th.q.id ? ' on' : '') + (th.waiting ? ' waiting' : '') + '">' +
              '<span class="msg-pic">' + cover(th) + '</span>' +
              '<span class="msg-row-b"><span class="msg-row-top"><b>' + esc(other(th)) + '</b><time>' + esc(when(last.created_at)) + '</time></span>' +
                '<span class="msg-row-room">' + esc(th.room.name) + '</span>' +
                '<span class="msg-row-last">' + (th.waiting ? '<i aria-hidden="true"></i>' : '') + esc((last.sender_role === th.role ? t('You') + ': ' : '') + (last.body || t('(no message)'))) + '</span>' +
                '<span class="msg-tag ' + th.role + '">' + esc(roleTag(th)) + '</span></span></a></li>';
          }).join('') + '</ul>' :
            '<div class="msg-empty"><img src="/assets/capy/kapi.webp" width="120" height="120" alt=""><h2>' + esc(t('No messages yet')) + '</h2>' +
              '<p>' + esc(t('When you ask a Keeper about a room, or a renter asks about your listing, the conversation shows here.')) + '</p>' +
              '<a class="btn btn-primary" href="/rooms" data-link>' + esc(t('Find a room')) + '</a></div>') +
        '</aside>' +
        '<section class="msg-main">' + (open ? thread(open) : (shown.length ? '<div class="msg-pick"><p>' + esc(t('Choose a conversation to read it.')) + '</p></div>' : '')) + '</section>' +
      '</div>';

    var root = $('.inbox', host);
    // The inbox fills the screen under whatever sits above it (top bar, demo bar).
    root.style.setProperty('--msg-h', 'calc(100dvh - ' + Math.round(root.getBoundingClientRect().top + window.scrollY) + 'px)');
    root.addEventListener('click', function (e) {
      var f = e.target.closest('[data-msg-filter]');
      if (f) { state.filter = f.getAttribute('data-msg-filter'); state.id = null; history.replaceState(history.state, '', '/messages'); paint(); }
    });
    if (open) bindThread(root, open, draft);
  }

  function thread(th) {
    var q = th.q, room = th.room, lastDay = '';
    var bubbles = th.msgs.map(function (m) {
      var mine = m.sender_role === th.role, d = dayLabel(m.created_at), head = '';
      if (d !== lastDay) { head = '<li class="msg-day"><span>' + esc(d) + '</span></li>'; lastDay = d; }
      return head + '<li class="bub ' + (mine ? 'mine' : 'theirs') + '">' +
        (mine ? '' : '<span class="bub-av" aria-hidden="true">' + esc(m.sender_role === 'renter' ? initials(q.renter_name) : m.sender_role === 'keeper' ? 'K' : 'EC') + '</span>') +
        '<div><p class="bub-who">' + esc(who(th, m)) + ' · ' + esc(new Date(m.created_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })) + '</p>' +
        '<p class="bub-text">' + esc(m.body || t('(no message)')) + '</p></div></li>';
    }).join('');
    var facts = [];
    if (q.move_in) facts.push([t('Move-in'), q.move_in]);
    if (room.price) facts.push([t('Rent'), t('from {p} a month', { p: H.peso(room.price) })]);
    if (room.area) facts.push([t('Area'), room.area]);
    // Free plan: the Keeper answers 5 new renters a month, and a renter's number shows once they have answered.
    var gated = th.role === 'keeper' && q.answered === false && !q.paid, locked = gated && q.locked;
    var quota = state.list.quota, left = quota ? Math.max(0, quota.limit - quota.used) : null;
    var rname = firstName(q.renter_name) || t('this renter');
    // Each side sees what helps them act: the Keeper (and the team) get the renter's number, the renter gets safety advice.
    var side = th.role === 'renter' ?
      '<div class="msg-card"><h3>' + esc(t('Stay safe')) + '</h3><ul class="msg-tips"><li>' + esc(t('See the room in person before paying anything.')) + '</li><li>' + esc(t('Ask for a receipt for every payment.')) + '</li><li>' + esc(t('Keep the conversation here so there is a record.')) + '</li></ul>' +
        '<a class="btn-link" href="/contact?topic=report" data-link>' + esc(t('Report a problem')) + '</a></div>' :
      '<div class="msg-card"><h3>' + esc(t('About the renter')) + '</h3><p class="msg-person"><span class="bub-av">' + esc(initials(q.renter_name)) + '</span><b>' + esc(q.renter_name) + '</b></p>' +
        (q.renter_mobile ? '<div class="msg-reach"><a class="btn btn-ghost btn-sm" href="sms:' + esc(q.renter_mobile) + '">' + H.icon('message') + '<span>' + esc(t('Text {m}', { m: ECS.showMobile(q.renter_mobile) })) + '</span></a>' +
          '<a class="btn btn-ghost btn-sm" href="tel:' + esc(q.renter_mobile) + '">' + H.icon('phone') + '<span>' + esc(t('Call')) + '</span></a></div>' :
          gated ? '<p class="msg-nonum">' + H.icon('phone') + '<span>' + esc(locked ? t('Their mobile number shows once you can answer them.') : t('Their mobile number shows here after you answer.')) + '</span></p>' : '') +
        (locked ? '' : '<p class="fine">' + esc(t('Reply within a day if you can. Renters usually message several places.')) + '</p>') + '</div>';
    return '<header class="msg-head">' +
        '<a class="msg-back" href="/messages" data-link aria-label="' + esc(t('All messages')) + '">' + H.icon('arrow-left') + '</a>' +
        '<span class="msg-pic">' + cover(th) + '</span>' +
        '<div class="msg-head-b"><b>' + esc(other(th)) + '</b><span>' + esc(room.name) + '</span></div>' +
        (room.url ? '<a class="btn btn-ghost btn-sm msg-view" href="' + esc(room.url) + '" data-link>' + esc(t(th.role === 'keeper' ? 'View listing' : 'View room')) + '</a>' : '') +
      '</header>' +
      '<div class="msg-cols">' +
        '<div class="msg-conv">' +
          '<ol class="msg-flow" aria-live="polite">' + bubbles + '</ol>' +
          (locked ? '<div class="msg-lock"><h3>' + esc(t('You have answered 5 new renters this month')) + '</h3>' +
            '<p>' + esc(t('The Free plan covers 5 new renters a month. You can answer {name} from {date}, or today on a paid plan.', { name: rname, date: ECS.quotaResets() })) + '</p>' +
            '<a class="btn btn-primary" href="/host/plans" data-link>' + esc(t('See plans')) + '</a></div>' : '') +
          '<form class="msg-box" novalidate' + (locked ? ' hidden' : '') + '>' +
            (gated && !locked && left != null ? '<p class="msg-hint">' + esc(t('Free plan: {n} of {max} new renters left this month.', { n: left, max: quota.limit })) + ' <a href="/host/plans" data-link>' + esc(t('See plans')) + '</a></p>' : '') +
            (th.role !== 'renter' && th.msgs.length < 2 ? '<div class="msg-quick">' + [t('Yes, it\'s still available. When would you like to see it?'), t('Thanks for asking! It\'s taken for now, but I can tell you when a room opens.')].map(function (s) {
              return '<button type="button" data-quick>' + esc(s) + '</button>';
            }).join('') + '</div>' : '') +
            '<div class="msg-box-row"><textarea rows="1" maxlength="2000" placeholder="' + esc(t('Write a message')) + '" aria-label="' + esc(t('Write a message')) + '"></textarea>' +
            '<button type="submit" class="btn btn-primary">' + esc(t('Send')) + '</button></div>' +
            '<p class="field-err" role="alert" hidden></p>' +
          '</form>' +
        '</div>' +
        '<aside class="msg-info">' +
          '<a class="msg-room"' + (room.url ? ' href="' + esc(room.url) + '" data-link' : '') + '><span class="msg-room-pic">' + cover(th) + '</span><b>' + esc(room.name) + '</b></a>' +
          (facts.length ? '<dl class="msg-facts">' + facts.map(function (f) { return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>'; }).join('') + '</dl>' : '') +
          side +
        '</aside>' +
      '</div>';
  }

  function bindThread(root, th, draft) {
    var flow = $('.msg-flow', root), form = $('.msg-box', root), ta = $('textarea', form), err = $('.field-err', form), btn = $('button[type=submit]', form);
    flow.scrollTop = flow.scrollHeight;
    if (draft) ta.value = draft;
    function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; }
    ta.addEventListener('input', grow); grow();
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 900px)').matches) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : btn.click(); } });
    form.addEventListener('click', function (e) { var b = e.target.closest('[data-quick]'); if (b) { ta.value = b.textContent; grow(); ta.focus(); } });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var body = ta.value.trim();
      if (!body) { ta.focus(); return; }
      err.hidden = true; btn.disabled = true;
      ECS.sendReply(th.q.id, th.role, body).then(function (m) {
        th.msgs.push(m); th.waiting = false; state.id = state.id || th.q.id;
        // A first answer uses one of the month's five and shows the renter's number: read the inbox again.
        if (th.role === 'keeper' && th.q.answered === false) ECS.threads().then(function (fresh) { state.list = fresh; paint(true); }).catch(function () {});
        state.list.sort(function (a, b) { return new Date(b.msgs[b.msgs.length - 1].created_at) - new Date(a.msgs[a.msgs.length - 1].created_at); });
        paint();
        var box = $('.msg-box textarea', state.host); if (box && window.matchMedia('(min-width: 900px)').matches) box.focus();
      }).catch(function (x) { btn.disabled = false; err.textContent = x.message; err.hidden = false; });
    });
  }
})();
