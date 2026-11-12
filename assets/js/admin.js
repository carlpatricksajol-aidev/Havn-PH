/* ECStay — admin workspace (/admin, admins only, real accounts):
 *   Leads     every renter message as a card on a board: New → Contacted → Viewing set → Moved in → Closed
 *   Listings  every listing with its Keeper and status; approve or send back from here
 *   People    everyone who signed up: Keepers (with listing counts) and renters (with messages sent)
 *   Messages  contact-form messages; reply by email, mark done
 * Data comes from accounts.js (ECS.adminData, ECS.setLead, ECS.setContact, ECS.review). */
(function () {
  var AV = (window.AdminView = {});
  var STAGES = [['new', 'New'], ['contacted', 'Contacted'], ['viewing', 'Viewing set'], ['moved_in', 'Moved in'], ['closed', 'Closed']];
  var LSTATUS = { draft: 'Draft', review: 'In review', changes: 'Needs changes', live: 'Live', paused: 'Paused', removed: 'Removed' };
  function esc(s) { return H.esc(s); }
  function day(d) { return d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''; }
  function tab() { var x = new URLSearchParams(location.search).get('tab'); return /^(leads|listings|people|messages)$/.test(x) ? x : 'leads'; }

  // The data is kept between visits to this page, so going from tab to tab (or back to Admin) shows at once; it is then
  // read again quietly and the page repaints only if something changed.
  var data = null;
  AV.render = function (host) {
    if (data && !(ECS.user && ECS.user.role === 'admin')) data = null;   // never show kept data to anyone who is not an admin
    if (data) paint(host, data);
    else host.innerHTML = '<div class="adm"><div class="host-loading"><span class="spin"></span></div></div>';
    ECS.session().then(function (s) {
      if (!s) { data = null; App.go('/signin?next=/admin'); return; }
      return ECS.profile().then(function (p) {
        if (!p || p.role !== 'admin') { data = null; App.go('/host'); return; }
        return reload(host);
      });
    }).catch(function (x) { if (!data) host.innerHTML = '<div class="adm"><p class="host-error">' + esc(x.message) + '</p></div>'; });
  };
  var rev = 0;   // goes up with every change made here; a read that started before a change is thrown away and done again
  function reload(host) {
    var at = rev;
    return ECS.adminData().then(function (d) {
      if (at !== rev) return reload(host);
      var same = data && JSON.stringify(d) === JSON.stringify(data);
      data = d;
      // Not while a note is being typed or a card is being dragged: the fresh data shows on the next paint.
      var busy = host.querySelector('.lead.dragging') || (document.activeElement && host.contains(document.activeElement) && /^(TEXTAREA|SELECT|INPUT)$/.test(document.activeElement.tagName));
      if (!same && !busy && host.querySelector('.adm')) paint(host, d);
    });
  }

  function paint(host, d) {
    var listById = {}, profById = {}, nList = {}, nLead = {};
    d.listings.forEach(function (l) { listById[l.id] = l; nList[l.owner_id] = (nList[l.owner_id] || 0) + 1; });
    d.profiles.forEach(function (p) { profById[p.id] = p; });
    d.inquiries.forEach(function (q) { if (q.renter_id) nLead[q.renter_id] = (nLead[q.renter_id] || 0) + 1; });
    var count = function (arr, f) { return arr.filter(f).length; };
    var keepers = count(d.profiles, function (p) { return nList[p.id]; });
    var stats = [
      [count(d.inquiries, function (q) { return q.status === 'new'; }), 'New leads', 'leads'],
      [count(d.listings, function (l) { return l.status === 'review'; }), 'Listings to review', 'listings'],
      [count(d.listings, function (l) { return l.status === 'live'; }), 'Live listings', 'listings'],
      [keepers, 'Keepers', 'people'],
      [count(d.profiles, function (p) { return !nList[p.id] && p.role !== 'admin'; }), 'Renters', 'people'],
      [count(d.contacts, function (m) { return m.status === 'new'; }), 'Open messages', 'messages'],
    ];
    var cur = tab();
    var tabs = [['leads', 'Leads', d.inquiries.length], ['listings', 'Listings', d.listings.length], ['people', 'People', d.profiles.length], ['messages', 'Messages', d.contacts.length]];
    host.innerHTML = '<div class="adm">' +
      '<div class="adm-head"><div><p class="host-hi">ECStay</p><h1>' + esc(t('Admin')) + '</h1></div>' +
        '<a class="btn btn-ghost btn-sm" href="/host" data-link>' + H.icon('user') + '<span>' + esc(t('My account')) + '</span></a></div>' +
      '<ul class="adm-stats">' + stats.map(function (s) { return '<li><a href="/admin?tab=' + s[2] + '" data-link><b>' + s[0] + '</b><span>' + esc(t(s[1])) + '</span></a></li>'; }).join('') + '</ul>' +
      '<nav class="adm-tabs" aria-label="' + esc(t('Admin')) + '">' + tabs.map(function (x) {
        return '<a href="/admin?tab=' + x[0] + '" data-link' + (x[0] === cur ? ' aria-current="page"' : '') + '>' + esc(t(x[1])) + '<i>' + x[2] + '</i></a>';
      }).join('') + '</nav>' +
      '<div class="adm-body">' + (cur === 'leads' ? leads(d, listById, profById) : cur === 'listings' ? listings(d, profById) : cur === 'people' ? people(d, nList, nLead) : messages(d)) + '</div>' +
    '</div>';
    if (!host._admBound) { host._admBound = true; bind(host); }
  }

  /* ---- Leads board ---- */
  function leads(d, listById, profById) {
    if (!d.inquiries.length) return '<p class="host-empty-line">' + esc(t('No leads yet. Every message a renter sends to a Keeper appears here.')) + '</p>';
    return '<div class="board">' + STAGES.map(function (st) {
      var items = d.inquiries.filter(function (q) { return q.status === st[0]; });
      return '<section class="col" data-stage="' + st[0] + '"><h2>' + esc(t(st[1])) + '<i>' + items.length + '</i></h2>' +
        (items.length ? items.map(function (q) {
          var l = listById[q.listing_id], k = l && profById[l.owner_id];
          return '<article class="lead" draggable="true" data-id="' + esc(q.id) + '">' +
            '<header><b>' + esc(q.renter_name) + '</b><time>' + esc(day(q.created_at)) + '</time></header>' +
            '<p class="lead-room">' + H.icon('home') + '<span>' + esc(q.listing_name || q.listing_ref) + '</span></p>' +
            '<p class="lead-meta">' + esc([q.move_in ? t('Move-in: {m}', { m: q.move_in }) : '', k ? t('Keeper: {name}', { name: k.full_name || k.email }) : t('Sample listing (no Keeper)')].filter(Boolean).join(' · ')) + '</p>' +
            (q.message ? '<p class="lead-msg">' + esc(q.message) + '</p>' : '') +
            '<p class="lead-contact"><a href="tel:' + esc(q.renter_mobile) + '">' + H.icon('phone') + esc(ECS.showMobile(q.renter_mobile)) + '</a>' +
              (q.renter_email ? '<a href="mailto:' + esc(q.renter_email) + '">' + H.icon('message') + esc(q.renter_email) + '</a>' : '') + '</p>' +
            '<label class="lead-stage"><span>' + esc(t('Stage')) + '</span><select data-lead-stage>' + STAGES.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === q.status ? ' selected' : '') + '>' + esc(t(o[1])) + '</option>'; }).join('') + '</select></label>' +
            '<textarea data-lead-note rows="2" maxlength="1000" placeholder="' + esc(t('Add a note (only admins see this)')) + '">' + esc(q.admin_note || '') + '</textarea>' +
          '</article>';
        }).join('') : '<p class="col-empty">' + esc(t('Drag a lead here')) + '</p>') +
      '</section>';
    }).join('') + '</div>';
  }

  /* ---- A listing's paid plan: set here when the Keeper's payment arrives ---- */
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function planCell(l) {
    if (l.status !== 'live' && l.status !== 'paused') return '';
    var ended = l.plan && (!l.plan_until || l.plan_until < today());
    return '<select data-plan aria-label="' + esc(t('Plan')) + '">' + [['', 'Free'], ['basic', 'Basic'], ['verified', 'Verified'], ['premium', 'Premium']].map(function (o) {
        return '<option value="' + o[0] + '"' + ((l.plan || '') === o[0] ? ' selected' : '') + '>' + esc(t(o[1])) + '</option>';
      }).join('') + '</select>' +
      '<input type="date" data-plan-until aria-label="' + esc(t('Plan ends on')) + '" value="' + esc(l.plan_until || '') + '"' + (l.plan ? '' : ' hidden') + '>' +
      (ended ? '<small class="plan-ended">' + esc(t('Term ended')) + '</small>' : '');
  }

  /* ---- Listings table ---- */
  function listings(d, profById) {
    if (!d.listings.length) return '<p class="host-empty-line">' + esc(t('No listings yet. When a Keeper starts one, it appears here.')) + '</p>';
    var order = { review: 0, changes: 1, live: 2, paused: 3, draft: 4, removed: 5 };
    var rows = d.listings.slice().sort(function (a, b) { return order[a.status] - order[b.status] || (a.updated_at < b.updated_at ? 1 : -1); });
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + [t('Listing'), t('Keeper'), t('Area'), t('From'), t('Status'), t('Plan'), t('Updated'), ''].map(esc).join('</th><th>') + '</th></tr></thead><tbody>' +
      rows.map(function (l) {
        var k = profById[l.owner_id] || {}, cover = l.photos && l.photos[0], price = ECS.priceFrom(l);
        return '<tr data-id="' + esc(l.id) + '"><td class="tbl-main">' + (cover ? '<img src="' + esc(cover.url || cover) + '" alt="" loading="lazy">' : '<span class="tbl-noimg">' + H.icon('home') + '</span>') +
          '<span><b>' + esc(l.name || t('Untitled listing')) + '</b><small>' + esc([l.place_type, (l.photos || []).length + ' ' + t('photos')].filter(Boolean).join(' · ')) + '</small></span></td>' +
          '<td><b>' + esc(k.full_name || '') + '</b><small>' + esc([k.email, ECS.showMobile(l.contact_mobile || k.mobile || '')].filter(Boolean).join(' · ')) + '</small></td>' +
          '<td>' + esc(l.area || '') + '</td><td>' + (price ? H.peso(price) : '') + '</td>' +
          '<td><span class="pill st-' + l.status + '">' + esc(t(LSTATUS[l.status])) + '</span></td><td class="tbl-plan">' + planCell(l) + '</td><td>' + esc(day(l.updated_at)) + '</td>' +
          '<td class="tbl-act">' + (l.status === 'review' ? '<a class="btn btn-primary btn-sm" href="/host/review" data-link>' + esc(t('Review')) + '</a>' :
            l.status === 'live' ? '<a class="btn btn-ghost btn-sm" href="/room/' + l.id + '" data-link>' + esc(t('View')) + '</a><button type="button" class="btn-link" data-unpublish>' + esc(t('Take down')) + '</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---- People table ---- */
  function people(d, nList, nLead) {
    var rows = d.profiles.slice().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + [t('Name'), t('Type'), t('Email'), t('Mobile'), t('Activity'), t('Joined')].map(esc).join('</th><th>') + '</th></tr></thead><tbody>' +
      rows.map(function (p) {
        var type = p.role === 'admin' ? 'Admin' : nList[p.id] ? 'Keeper' : 'Renter';
        var act = [nList[p.id] ? t('{n} listings', { n: nList[p.id] }) : '', nLead[p.id] ? t('{n} messages sent', { n: nLead[p.id] }) : ''].filter(Boolean).join(' · ');
        return '<tr><td><b>' + esc(p.full_name || t('(no name yet)')) + '</b></td><td><span class="pill ty-' + type.toLowerCase() + '">' + esc(t(type)) + '</span></td>' +
          '<td><a href="mailto:' + esc(p.email) + '">' + esc(p.email || '') + '</a></td><td>' + (p.mobile ? '<a href="tel:' + esc(p.mobile) + '">' + esc(ECS.showMobile(p.mobile)) + '</a>' : '') + '</td>' +
          '<td>' + esc(act || t('Signed up')) + '</td><td>' + esc(day(p.created_at)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---- Contact messages ---- */
  function messages(d) {
    if (!d.contacts.length) return '<p class="host-empty-line">' + esc(t('No messages from the contact page yet.')) + '</p>';
    return '<ul class="msgs">' + d.contacts.map(function (m) {
      return '<li class="msg' + (m.status === 'done' ? ' is-done' : '') + '" data-id="' + esc(m.id) + '"><header><b>' + esc(m.name) + '</b><span class="pill">' + esc(m.topic) + '</span><time>' + esc(day(m.created_at)) + '</time></header>' +
        '<p>' + esc(m.message) + '</p><div class="msg-act"><a class="btn btn-primary btn-sm" href="mailto:' + esc(m.email) + '?subject=' + encodeURIComponent('Re: your message to ECStay') + '">' + esc(t('Reply to {email}', { email: m.email })) + '</a>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-msg-done>' + esc(t(m.status === 'done' ? 'Reopen' : 'Mark done')) + '</button></div></li>';
    }).join('') + '</ul>';
  }

  // Move a lead to another stage: the card moves at once, the save follows; if the save fails the card goes back.
  function moveLead(host, id, stage) {
    var q = data && data.inquiries.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!q || q.status === stage) return;
    var was = q.status;
    q.status = stage; rev++; paint(host, data);
    ECS.setLead(id, { status: stage }).then(function () { rev++; H.toast(t('Lead moved')); })
      .catch(function (x) { q.status = was; if (host.querySelector('.adm')) paint(host, data); H.toast(x.message); });
  }

  function bind(host) {
    // Tabs and the number tiles: swap the body from the data already loaded, with no reload.
    host.addEventListener('click', function (e) {
      var a = e.target.closest('.adm-tabs a, .adm-stats a'); if (!a || !data || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault(); e.stopPropagation();
      var to = a.getAttribute('href');
      if (to !== location.pathname + location.search) history.pushState(null, '', to);
      paint(host, data);
    }, true);

    /* Drag a lead card onto another column. Typing in the note, picking a stage and tapping a link stay ordinary. */
    var dragId = null;
    host.addEventListener('pointerdown', function (e) {
      var c = e.target.closest('.lead'); if (c) c.draggable = !e.target.closest('textarea, select, a');
    });
    host.addEventListener('dragstart', function (e) {
      var c = e.target.closest && e.target.closest('.lead'); if (!c) return;
      dragId = c.getAttribute('data-id');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
      setTimeout(function () { c.classList.add('dragging'); }, 0);
    });
    var over = function (col) { Array.prototype.forEach.call(host.querySelectorAll('.col.over'), function (x) { if (x !== col) x.classList.remove('over'); }); if (col) col.classList.add('over'); };
    host.addEventListener('dragover', function (e) {
      if (!dragId) return;
      var col = e.target.closest('.col'); over(col);
      if (col) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
    });
    host.addEventListener('drop', function (e) {
      if (!dragId) return;
      var col = e.target.closest('.col'), id = dragId; dragId = null; over(null);
      if (!col) return;
      e.preventDefault();
      moveLead(host, id, col.getAttribute('data-stage'));
    });
    host.addEventListener('dragend', function () {
      dragId = null; over(null);
      Array.prototype.forEach.call(host.querySelectorAll('.lead.dragging'), function (x) { x.classList.remove('dragging'); });
    });

    host.addEventListener('change', function (e) {
      var pl = e.target.closest('[data-plan], [data-plan-until]');
      if (pl) {
        var tr = pl.closest('tr'), sel = tr.querySelector('[data-plan]'), dt = tr.querySelector('[data-plan-until]');
        if (sel.value && !dt.value) { var d6 = new Date(); d6.setMonth(d6.getMonth() + 6); dt.value = d6.getFullYear() + '-' + ('0' + (d6.getMonth() + 1)).slice(-2) + '-' + ('0' + d6.getDate()).slice(-2); }
        ECS.setPlan(tr.getAttribute('data-id'), sel.value, dt.value).then(function () { H.toast(sel.value ? t('Plan saved') : t('Plan removed')); sel.blur(); dt.blur(); return reload(host); }).catch(function (x) { H.toast(x.message); });
        return;
      }
      var s = e.target.closest('[data-lead-stage]'); if (!s) return;
      moveLead(host, s.closest('.lead').getAttribute('data-id'), s.value);
    });
    host.addEventListener('focusout', function (e) {
      var n = e.target.closest('[data-lead-note]'); if (!n || n.value === n.defaultValue) return;
      var id = n.closest('.lead').getAttribute('data-id'), note = n.value.trim() || null;
      ECS.setLead(id, { admin_note: note }).then(function () {
        n.defaultValue = n.value; H.toast(t('Note saved'));
        var q = data && data.inquiries.filter(function (x) { return String(x.id) === String(id); })[0]; if (q) q.admin_note = note;
      }).catch(function (x) { H.toast(x.message); });
    });
    host.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-msg-done]'))) {
        var li = b.closest('.msg');
        ECS.setContact(li.getAttribute('data-id'), { status: li.classList.contains('is-done') ? 'new' : 'done' }).then(function () { return reload(host); }).catch(function (x) { H.toast(x.message); });
      } else if ((b = e.target.closest('[data-unpublish]'))) {
        if (!window.confirm(t('Take this listing down? Renters will no longer see it.'))) return;
        ECS.review(b.closest('tr').getAttribute('data-id'), 'removed', null).then(function () { H.toast(t('Listing taken down')); return reload(host); }).catch(function (x) { H.toast(x.message); });
      }
    });
  }
})();
