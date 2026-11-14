/* ECStay — admin workspace (private address, admins only, real accounts):
 *   Today     the team's work for the day: listings to review (1 day promised), new leads, open messages, plans
 *             ending, Keepers who stopped half way, newest sign-ups
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
  function tab() { var x = new URLSearchParams(location.search).get('tab'); return /^(today|leads|listings|people|messages)$/.test(x) ? x : 'today'; }

  // The data is kept between visits to this page, so going from tab to tab (or back to Admin) shows at once; it is then
  // read again quietly and the page repaints only if something changed.
  var data = null;
  AV.render = function (host) {
    if (data && !(ECS.user && ECS.user.role === 'admin')) data = null;   // never show kept data to anyone who is not an admin
    if (data) paint(host, data);
    else host.innerHTML = '<div class="adm"><div class="host-loading"><span class="spin"></span></div></div>';
    ECS.session().then(function (s) {
      if (!s) { data = null; App.go('/signin?next=' + encodeURIComponent(location.pathname + location.search)); return; }
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

  function since(d) {
    var h = Math.max(0, (Date.now() - new Date(d).getTime()) / 36e5);
    return h < 1 ? t('under 1 hour') : h < 24 ? t('{n} hr', { n: Math.round(h) }) : t('{n} days', { n: Math.floor(h / 24) });
  }
  function hoursSince(d) { return (Date.now() - new Date(d).getTime()) / 36e5; }

  function paint(host, d) {
    var listById = {}, profById = {}, nList = {}, nLead = {};
    d.listings.forEach(function (l) { listById[l.id] = l; nList[l.owner_id] = (nList[l.owner_id] || 0) + 1; });
    d.profiles.forEach(function (p) { profById[p.id] = p; });
    d.inquiries.forEach(function (q) { if (q.renter_id) nLead[q.renter_id] = (nLead[q.renter_id] || 0) + 1; });
    var count = function (arr, f) { return arr.filter(f).length; };
    var nReview = count(d.listings, function (l) { return l.status === 'review'; }), nNew = count(d.inquiries, function (q) { return q.status === 'new'; }), nOpen = count(d.contacts, function (m) { return m.status === 'new'; });
    var cur = tab(), here = location.pathname;
    var nav = [['today', 'grid', 'Today', nReview + nNew + nOpen, true], ['leads', 'users', 'Leads', nNew, nNew > 0], ['listings', 'building', 'Listings', nReview || d.listings.length, nReview > 0], ['people', 'user', 'People', d.profiles.length, false], ['messages', 'message', 'Messages', nOpen, nOpen > 0]];
    var TITLE = { today: 'Today', leads: 'Leads', listings: 'Listings', people: 'People', messages: 'Messages' };
    var SUB = { today: 'What the team needs to do, most pressing first.', leads: 'Every renter who wrote to a Keeper. Drag a card as it moves along.', listings: 'Every listing with its Keeper, status and plan.', people: 'Everyone who signed up.', messages: 'Messages from the contact page.' };
    var tools = cur === 'today' ? '' : '<div class="adm-tools"><label class="adm-search">' + H.icon('search') + '<input type="search" data-adm-search placeholder="' + esc(t('Search this page')) + '" aria-label="' + esc(t('Search this page')) + '"></label>' +
      (cur === 'leads' || cur === 'people' ? '<button type="button" class="btn btn-ghost btn-sm" data-adm-csv="' + cur + '">' + H.icon('external') + '<span>' + esc(t('Download as a sheet')) + '</span></button>' : '') + '</div>';
    host.innerHTML = '<div class="adm">' +
      '<aside class="adm-nav"><p class="kh-brand">' + esc(t('ECStay admin')) + '</p>' +
        '<nav class="adm-tabs" aria-label="' + esc(t('Admin')) + '">' + nav.map(function (x) {
          return '<a href="' + esc(here) + '?tab=' + x[0] + '" data-link' + (x[0] === cur ? ' aria-current="page"' : '') + '>' + H.icon(x[1]) + '<span>' + esc(t(x[2])) + '</span>' + (x[3] ? '<i class="' + (x[4] && x[3] ? 'hot' : '') + '">' + x[3] + '</i>' : '') + '</a>';
        }).join('') + '</nav>' +
        '<a class="btn btn-brass adm-review" href="/host/review" data-link>' + H.icon('check') + '<span>' + esc(nReview ? t('Review listings ({n})', { n: nReview }) : t('Review listings')) + '</span></a>' +
        '<p class="kh-nav-foot"><a href="/host" data-link>' + esc(t('Keeper home')) + '</a><span>' + esc((ECS.user && ECS.user.email) || '') + '</span></p></aside>' +
      '<div class="adm-page"><header class="adm-head"><div><h1>' + esc(t(TITLE[cur])) + '</h1><p class="adm-sub">' + esc(t(SUB[cur])) + '</p></div>' + tools + '</header>' +
        '<div class="adm-body">' + (cur === 'today' ? todayTab(d, listById, profById, nList) : cur === 'leads' ? leads(d, listById, profById) : cur === 'listings' ? listings(d, profById) : cur === 'people' ? people(d, nList, nLead) : messages(d)) + '</div>' +
      '</div></div>';
    var hdr = document.querySelector('.site-header'); if (hdr) host.querySelector('.adm').style.setProperty('--kh-top', hdr.offsetHeight + 'px');
    if (!host._admBound) { host._admBound = true; bind(host); }
  }

  /* ---- Today: the team's work for the day, most pressing first ---- */
  function todayTab(d, listById, profById, nList) {
    var here = location.pathname, week = Date.now() - 7 * 864e5, in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), now = today();
    var count = function (arr, f) { return arr.filter(f).length; };
    var person = function (p) { return (p && (p.full_name || p.email)) || t('(no name yet)'); };
    var reach = function (mobile, email) {
      return (mobile ? '<a class="adm-ic" href="tel:' + esc(mobile) + '" title="' + esc(t('Call') + ' ' + ECS.showMobile(mobile)) + '" aria-label="' + esc(t('Call') + ' ' + ECS.showMobile(mobile)) + '">' + H.icon('phone') + '</a>' +
        '<a class="adm-ic" href="sms:' + esc(mobile) + '" title="' + esc(t('Text {m}', { m: ECS.showMobile(mobile) })) + '" aria-label="' + esc(t('Text {m}', { m: ECS.showMobile(mobile) })) + '">' + H.icon('message') + '</a>' : '') +
        (email ? '<a class="adm-ic" href="mailto:' + esc(email) + '" title="' + esc(email) + '" aria-label="' + esc(t('Email') + ' ' + email) + '">' + H.icon('external') + '</a>' : '');
    };
    var row = function (pic, title, sub, right, flag) { return '<li class="aq"><span class="aq-pic">' + pic + '</span><div class="aq-b"><b>' + esc(title) + '</b><small>' + sub + '</small></div>' + (flag || '') + '<div class="aq-act">' + right + '</div></li>'; };
    var card = function (title, n, body, empty, more) {
      return '<section class="kcard"><div class="kcard-h"><h2>' + esc(t(title)) + (n ? ' <b class="count brass">' + n + '</b>' : '') + '</h2>' + (more || '') + '</div>' +
        (body || '<div class="kcard-empty">' + H.icon('check') + '<p>' + esc(t(empty)) + '</p></div>') + '</section>';
    };
    var go = function (tabId, label) { return '<a class="kh-more" href="' + esc(here) + '?tab=' + tabId + '" data-adm-go data-link>' + esc(t(label)) + '</a>'; };

    // 1. Listings waiting for review: we promise an answer within 1 day.
    var rev = d.listings.filter(function (l) { return l.status === 'review'; }).sort(function (a, b) { return (a.submitted_at || a.updated_at) < (b.submitted_at || b.updated_at) ? -1 : 1; });
    var revHtml = rev.map(function (l) {
      var k = profById[l.owner_id] || {}, cover = l.photos && l.photos[0], at = l.submitted_at || l.updated_at, late = hoursSince(at) >= 24;
      return row(cover ? '<img src="' + esc(cover.url || cover) + '" alt="" loading="lazy">' : H.icon('home'), l.name || t('Untitled listing'),
        esc([person(k), l.area, t('waiting {time}', { time: since(at) })].filter(Boolean).join(' · ')),
        reach(l.contact_mobile || k.mobile, k.email) + '<a class="btn btn-primary btn-sm" href="/host/review" data-link>' + esc(t('Review')) + '</a>',
        late ? '<span class="aq-flag late">' + esc(t('Over 1 day')) + '</span>' : '<span class="aq-flag">' + esc(t('{n} hr left', { n: Math.max(1, Math.round(24 - hoursSince(at))) })) + '</span>');
    }).join('');

    // 2. New leads. On a sample listing there is no Keeper, so the team answers.
    var fresh = d.inquiries.filter(function (q) { return q.status === 'new'; });
    var leadHtml = fresh.slice(0, 5).map(function (q) {
      var ours = !listById[q.listing_id];
      return row(esc(String(q.renter_name || '?').trim().charAt(0).toUpperCase()), q.renter_name || t('Renter'),
        esc([q.listing_name || q.listing_ref, t('{time} ago', { time: since(q.created_at) })].filter(Boolean).join(' · ')) + (q.message ? '<em>' + esc(q.message) + '</em>' : ''),
        reach(q.renter_mobile, q.renter_email) + (ours ? '<a class="btn btn-primary btn-sm" href="/messages/' + esc(q.id) + '" data-link>' + esc(t('Reply')) + '</a>' : '<a class="btn btn-ghost btn-sm" href="/messages/' + esc(q.id) + '" data-link>' + esc(t('Read')) + '</a>'),
        ours ? '<span class="aq-flag late">' + esc(t('Team answers')) + '</span>' : '');
    }).join('');

    // 3. Contact-page messages still open.
    var open = d.contacts.filter(function (m) { return m.status === 'new'; });
    var openHtml = open.slice(0, 4).map(function (m) {
      return row(H.icon('message'), m.name, esc([m.topic, t('{time} ago', { time: since(m.created_at) })].filter(Boolean).join(' · ')) + '<em>' + esc(m.message) + '</em>',
        '<a class="btn btn-primary btn-sm" href="mailto:' + esc(m.email) + '?subject=' + encodeURIComponent('Re: your message to ECStay') + '">' + esc(t('Reply')) + '</a>');
    }).join('');

    // 4. Paid plans that end within 7 days, or have ended.
    var plans = d.listings.filter(function (l) { return l.plan && l.plan_until && l.plan_until <= in7 && (l.status === 'live' || l.status === 'paused'); }).sort(function (a, b) { return a.plan_until < b.plan_until ? -1 : 1; });
    var planHtml = plans.map(function (l) {
      var k = profById[l.owner_id] || {}, ended = l.plan_until < now;
      return row(H.icon('sparkle'), l.name || t('Untitled listing'), esc([person(k), l.plan.charAt(0).toUpperCase() + l.plan.slice(1), t(ended ? 'ended {date}' : 'ends {date}', { date: day(l.plan_until + 'T12:00:00') })].join(' · ')),
        reach(l.contact_mobile || k.mobile, k.email) + '<a class="btn btn-ghost btn-sm" href="' + esc(here) + '?tab=listings" data-adm-go data-link>' + esc(t('Renew')) + '</a>', ended ? '<span class="aq-flag late">' + esc(t('Term ended')) + '</span>' : '');
    }).join('');

    // 5. Keepers who started a listing and stopped: a call often gets it finished.
    var stuck = d.listings.filter(function (l) { return l.status === 'draft' && ECS.stepsDone(l) >= 2 && hoursSince(l.updated_at) >= 48; }).sort(function (a, b) { return ECS.stepsDone(b) - ECS.stepsDone(a); }).slice(0, 5);
    var stuckHtml = stuck.map(function (l) {
      var k = profById[l.owner_id] || {};
      return row('<span class="aq-n">' + ECS.stepsDone(l) + '/6</span>', l.name || t('Untitled listing'), esc([person(k), t('last touched {time} ago', { time: since(l.updated_at) })].join(' · ')), reach(l.contact_mobile || k.mobile, k.email));
    }).join('');
    var changes = d.listings.filter(function (l) { return l.status === 'changes'; });
    var chHtml = changes.map(function (l) {
      var k = profById[l.owner_id] || {};
      return row(H.icon('pencil'), l.name || t('Untitled listing'), esc([person(k), t('sent back {time} ago', { time: since(l.updated_at) })].join(' · ')) + (l.review_note ? '<em>' + esc(l.review_note) + '</em>' : ''), reach(l.contact_mobile || k.mobile, k.email));
    }).join('');

    var newest = d.profiles.slice().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).slice(0, 5).map(function (p) {
      var type = p.role === 'admin' ? 'Admin' : nList[p.id] ? 'Keeper' : 'Renter';
      return row(esc(String(person(p)).charAt(0).toUpperCase()), person(p), esc([t(type), t('joined {date}', { date: day(p.created_at) })].join(' · ')), reach(p.mobile, p.email));
    }).join('');

    var tile = function (icon, n, label, tabId, tone, hint) {
      return '<li><a class="kn" href="' + esc(here) + '?tab=' + tabId + '" data-link><span class="kn-ic ' + (tone || '') + '">' + H.icon(icon) + '</span><span class="kn-b"><b>' + n + '</b><span>' + esc(t(label)) + '</span>' + (hint ? '<small>' + esc(hint) + '</small>' : '') + '</span></a></li>';
    };
    var late = count(rev, function (l) { return hoursSince(l.submitted_at || l.updated_at) >= 24; });
    return '<ul class="adm-stats kn-row">' +
        tile('check', rev.length, 'Listings to review', 'listings', rev.length ? 'brass' : '', late ? t('{n} over 1 day', { n: late }) : '') +
        tile('users', fresh.length, 'New leads', 'leads', fresh.length ? 'brass' : '', t('{n} this week', { n: count(d.inquiries, function (q) { return new Date(q.created_at).getTime() >= week; }) })) +
        tile('home', count(d.listings, function (l) { return l.status === 'live'; }), 'Live listings', 'listings', 'green', t('{n} on a paid plan', { n: count(d.listings, function (l) { return l.status === 'live' && ECS.planOn(l); }) })) +
        tile('user', d.profiles.length, 'People signed up', 'people', '', t('{n} this week', { n: count(d.profiles, function (p) { return new Date(p.created_at).getTime() >= week; }) })) +
      '</ul>' +
      '<div class="kh-cols adm-cols"><div class="kh-col">' +
        card('Listings waiting for review', rev.length, revHtml && '<ul class="aq-list">' + revHtml + '</ul>', 'Nothing is waiting. Every listing sent to us has an answer.') +
        card('New leads', fresh.length, leadHtml && '<ul class="aq-list">' + leadHtml + '</ul>', 'No new leads. Each one has been picked up.', d.inquiries.length ? go('leads', 'Open the board') : '') +
        (openHtml ? card('Messages from the contact page', open.length, '<ul class="aq-list">' + openHtml + '</ul>', '', go('messages', 'See all')) : '') +
      '</div><div class="kh-col">' +
        (planHtml ? card('Plans ending soon', plans.length, '<ul class="aq-list">' + planHtml + '</ul>', '') : '') +
        (chHtml ? card('Sent back, waiting on the Keeper', changes.length, '<ul class="aq-list">' + chHtml + '</ul>', '') : '') +
        card('Keepers to nudge', stuck.length, stuckHtml && '<ul class="aq-list">' + stuckHtml + '</ul>', 'No listing has been left half done for more than 2 days.') +
        card('Newest sign-ups', 0, '<ul class="aq-list">' + newest + '</ul>', '', go('people', 'See all')) +
      '</div></div>';
  }

  // The current tab as a sheet (CSV) that opens in Excel or Google Sheets.
  function download(kind) {
    var nList = {}; data.listings.forEach(function (l) { nList[l.owner_id] = (nList[l.owner_id] || 0) + 1; });
    var rows = kind === 'leads' ?
      [['Name', 'Mobile', 'Email', 'Listing', 'Move-in', 'Stage', 'Date', 'Message', 'Team note']].concat(data.inquiries.map(function (q) { return [q.renter_name, q.renter_mobile, q.renter_email, q.listing_name || q.listing_ref, q.move_in, q.status, (q.created_at || '').slice(0, 10), q.message, q.admin_note]; })) :
      [['Name', 'Type', 'Email', 'Mobile', 'Listings', 'Joined']].concat(data.profiles.map(function (p) { return [p.full_name, p.role === 'admin' ? 'Admin' : nList[p.id] ? 'Keeper' : 'Renter', p.email, p.mobile, nList[p.id] || 0, (p.created_at || '').slice(0, 10)]; }));
    var csv = rows.map(function (r) { return r.map(function (v) { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'ecstay-' + kind + '-' + today() + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
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
      var a = e.target.closest('.adm-tabs a, .adm-stats a, a[data-adm-go]'); if (!a || !data || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault(); e.stopPropagation();
      var to = a.getAttribute('href');
      if (to !== location.pathname + location.search) history.pushState(null, '', to);
      paint(host, data); window.scrollTo(0, 0);
    }, true);
    // Search: hides the cards and rows on this page that do not contain the words typed.
    host.addEventListener('input', function (e) {
      var box = e.target.closest('[data-adm-search]'); if (!box) return;
      var words = box.value.toLowerCase().split(/\s+/).filter(Boolean), shown = 0;
      var items = host.querySelectorAll('.adm-body .lead, .adm-body tbody tr, .adm-body .msg');
      Array.prototype.forEach.call(items, function (el) {
        var txt = (el.textContent + ' ' + Array.prototype.map.call(el.querySelectorAll('textarea, a[href^="mailto:"]'), function (x) { return x.value || x.getAttribute('href'); }).join(' ')).toLowerCase();
        var hit = words.every(function (w) { return txt.indexOf(w) >= 0; });
        if (hit) { el.removeAttribute('data-hide'); shown++; } else el.setAttribute('data-hide', '');
      });
      var none = host.querySelector('.adm-none'); if (none) none.remove();
      if (words.length && !shown && items.length) host.querySelector('.adm-body').insertAdjacentHTML('beforeend', '<p class="adm-none">' + esc(t('Nothing on this page matches.')) + '</p>');
    });

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
      if ((b = e.target.closest('[data-adm-csv]'))) download(b.getAttribute('data-adm-csv'));
      else if ((b = e.target.closest('[data-msg-done]'))) {
        var li = b.closest('.msg');
        ECS.setContact(li.getAttribute('data-id'), { status: li.classList.contains('is-done') ? 'new' : 'done' }).then(function () { return reload(host); }).catch(function (x) { H.toast(x.message); });
      } else if ((b = e.target.closest('[data-unpublish]'))) {
        if (!window.confirm(t('Take this listing down? Renters will no longer see it.'))) return;
        ECS.review(b.closest('tr').getAttribute('data-id'), 'removed', null).then(function () { H.toast(t('Listing taken down')); return reload(host); }).catch(function (x) { H.toast(x.message); });
      }
    });
  }
})();
