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
  function tab() { var x = new URLSearchParams(location.search).get('tab'); return /^(today|review|leads|listings|people|messages|insights)$/.test(x) ? x : 'today'; }

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
    return Promise.all([ECS.adminData(), ECS.adminInsights().catch(function () { return null; })]).then(function (r) {
      var d = r[0]; d.insights = r[1] || { site: [], listings: [] };
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
    var nav = [['today', 'grid', 'Today', nReview + nNew + nOpen, true], ['review', 'check', 'Review', nReview, true], ['leads', 'users', 'Leads', nNew, true], ['listings', 'building', 'Listings', 0, false], ['people', 'user', 'People', 0, false], ['messages', 'message', 'Messages', nOpen, true], ['insights', 'eye', 'Insights', 0, false]];
    var TITLE = { today: 'Today', review: 'Review listings', leads: 'Leads', listings: 'Listings', people: 'People', messages: 'Messages', insights: 'Insights' };
    var SUB = { today: 'What the team needs to do, most pressing first.', review: 'Check each listing against the Keeper standards, then approve it or ask for changes.', leads: 'Every renter who wrote to a Keeper. Set the stage as it moves along.', listings: 'Every listing with its Keeper, status and plan.', people: 'Everyone who signed up.', messages: 'Messages from the contact page.', insights: 'How many people visit, what they search for, and which listings they open.' };
    var tools = cur === 'today' || cur === 'review' || cur === 'insights' ? '' : '<div class="adm-tools"><label class="adm-search">' + H.icon('search') + '<input type="search" data-adm-search placeholder="' + esc(t('Search this page')) + '" aria-label="' + esc(t('Search this page')) + '"></label>' +
      (cur === 'leads' || cur === 'people' ? '<button type="button" class="btn btn-ghost btn-sm" data-adm-csv="' + cur + '">' + H.icon('external') + '<span>' + esc(t('Download as a sheet')) + '</span></button>' : '') + '</div>';
    host.innerHTML = '<div class="adm' + (H.store.get('ecs-nav-min', false) ? ' nav-min' : '') + '">' +
      '<aside class="adm-nav">' + HostView.navToggle() + '<p class="kh-brand">' + esc(t('ECStay admin')) + '</p>' +
        '<nav class="adm-tabs" aria-label="' + esc(t('Admin')) + '">' + nav.map(function (x) {
          return '<a href="' + esc(here) + '?tab=' + x[0] + '" data-link title="' + esc(t(x[2])) + '"' + (x[0] === cur ? ' aria-current="page"' : '') + '>' + H.icon(x[1]) + '<span>' + esc(t(x[2])) + '</span>' + (x[3] ? '<i class="' + (x[4] && x[3] ? 'hot' : '') + '">' + x[3] + '</i>' : '') + '</a>';
        }).join('') + '</nav>' +
        '<p class="kh-nav-foot"><a href="/host" data-link>' + esc(t('My own Keeper home')) + '</a><span>' + esc((ECS.user && ECS.user.email) || '') + '</span></p></aside>' +
      '<div class="adm-page"><header class="adm-head"><div><h1>' + esc(t(TITLE[cur])) + '</h1><p class="adm-sub">' + esc(t(SUB[cur])) + '</p></div>' + tools + '</header>' +
        '<div class="adm-body">' + (cur === 'today' ? todayTab(d, listById, profById, nList) : cur === 'review' ? review(d, profById) : cur === 'insights' ? insights(d) : cur === 'leads' ? leads(d, listById, profById) : cur === 'listings' ? listings(d, profById) : cur === 'people' ? people(d, nList, nLead) : messages(d)) + '</div>' +
      '</div></div>';
    var hdr = document.querySelector('.site-header'); if (hdr) host.querySelector('.adm').style.setProperty('--kh-top', hdr.offsetHeight + 'px');
    if (!host._admBound) { host._admBound = true; bind(host); }
  }

  /* ---- Today: the team's work for the day, most pressing first ---- */
  function todayTab(d, listById, profById, nList) {
    var here = location.pathname, week = Date.now() - 7 * 864e5, in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), now = today();
    var count = function (arr, f) { return arr.filter(f).length; };
    var person = function (p) { return (p && (p.full_name || p.email)) || t('(no name yet)'); };
    // One way to reach the person: their number to call, or their email when there is no number.
    var reach = function (mobile, email) {
      return mobile ? '<a class="aq-call" href="tel:' + esc(mobile) + '">' + H.icon('phone') + '<span>' + esc(ECS.showMobile(mobile)) + '</span></a>' :
        email ? '<a class="aq-call" href="mailto:' + esc(email) + '">' + H.icon('message') + '<span>' + esc(t('Email')) + '</span></a>' : '';
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
        '<a class="btn btn-primary btn-sm" href="' + esc(here) + '?tab=review" data-adm-go data-link>' + esc(t('Review')) + '</a>',
        late ? '<span class="aq-flag late">' + esc(t('Over 1 day')) + '</span>' : '<span class="aq-flag">' + esc(t('{n} hr left', { n: Math.max(1, Math.round(24 - hoursSince(at))) })) + '</span>');
    }).join('');

    // 2. New leads. On a sample listing there is no Keeper, so the team answers.
    var fresh = d.inquiries.filter(function (q) { return q.status === 'new'; });
    var leadHtml = fresh.slice(0, 5).map(function (q) {
      var ours = !listById[q.listing_id];
      return row(esc(String(q.renter_name || '?').trim().charAt(0).toUpperCase()), q.renter_name || t('Renter'),
        esc([q.listing_name || q.listing_ref, t('{time} ago', { time: since(q.created_at) })].filter(Boolean).join(' · ')) + (q.message ? '<em>' + esc(q.message) + '</em>' : ''),
        (ours ? '<a class="btn btn-primary btn-sm" href="/messages/' + esc(q.id) + '" data-link>' + esc(t('Reply')) + '</a>' : '<a class="btn btn-ghost btn-sm" href="/messages/' + esc(q.id) + '" data-link>' + esc(t('Read')) + '</a>'),
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
        tile('check', rev.length, 'Listings to review', 'review', rev.length ? 'brass' : '', late ? t('{n} over 1 day', { n: late }) : '') +
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

  /* ---- Review: one listing at a time, everything needed to decide on one card ---- */
  function review(d, profById) {
    var q = d.listings.filter(function (l) { return l.status === 'review'; }).sort(function (a, b) { return (a.submitted_at || a.updated_at) < (b.submitted_at || b.updated_at) ? -1 : 1; });
    if (!q.length) return '<div class="kcard"><div class="kcard-empty">' + H.icon('check') + '<p><b>' + esc(t('Nothing to review.')) + '</b> ' + esc(t('When a Keeper sends a listing, it shows here and counts down from 1 day.')) + '</p></div></div>';
    return q.map(function (l, i) {
      var k = profById[l.owner_id] || {}, rules = l.rules || {}, bills = l.bills || {}, ph = l.photos || [], at = l.submitted_at || l.updated_at, late = hoursSince(at) >= 24;
      var mobile = l.contact_mobile || k.mobile || '';
      var fact = function (label, value) { return value ? '<div><dt>' + esc(t(label)) + '</dt><dd>' + value + '</dd></div>' : ''; };
      var RULE = { allowed: 'Allowed', daytime: 'Daytime only', none: 'Not allowed', yes: 'Allowed', no: 'Not allowed', outside: 'Outside only' };
      var ruleTxt = [['visitors', 'Visitors'], ['cooking', 'Cooking'], ['pets', 'Pets'], ['smoking', 'Smoking']].map(function (r) { return rules[r[0]] ? t(r[1]) + ': ' + t(RULE[rules[r[0]]] || rules[r[0]]) : ''; }).filter(Boolean).concat(rules.curfew ? [t('Curfew') + ': ' + rules.curfew] : []).join(' · ');
      return '<article class="rvc" data-id="' + esc(l.id) + '">' +
        '<header class="rvc-h"><div><p class="rvc-n">' + esc(t('{n} of {m}', { n: i + 1, m: q.length })) + '</p><h2>' + esc(l.name || t('Untitled listing')) + '</h2>' +
          '<p class="rvc-meta">' + esc([l.place_type ? t(l.place_type) : '', l.gender ? H.genderLabel(l.gender) : '', l.area].filter(Boolean).join(' · ')) + '</p></div>' +
          '<span class="aq-flag' + (late ? ' late' : '') + '">' + esc(late ? t('Waiting {time}: over 1 day', { time: since(at) }) : t('Waiting {time}', { time: since(at) })) + '</span></header>' +
        '<div class="rvc-photos n' + Math.min(ph.length, 5) + '">' + ph.slice(0, 5).map(function (x, j) {
          return '<a href="' + esc(x.url || x) + '" target="_blank" rel="noopener" aria-label="' + esc(t('Photo {n}', { n: j + 1 })) + '"><img src="' + esc(x.url || x) + '" alt="" loading="lazy">' + (j === 4 && ph.length > 5 ? '<i>+' + (ph.length - 5) + '</i>' : '') + '</a>';
        }).join('') + '</div>' +
        '<div class="rvc-cols"><div class="rvc-main">' +
          '<h3>' + esc(t('Rooms and prices')) + '</h3><ul class="rvc-rooms">' + (l.rooms || []).map(function (x) { return '<li><span>' + esc(t(x.type)) + '</span><b>' + esc(H.peso(x.price)) + '</b><small>' + esc(t('{n} available', { n: x.count })) + '</small></li>'; }).join('') + '</ul>' +
          '<h3>' + esc(t('Description')) + '</h3><p class="rvc-desc">' + esc(l.description || '') + '</p>' +
          '<dl class="rvc-facts">' +
            fact('Address', esc(l.address || '') + ' <a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=' + l.lat + '&mlon=' + l.lng + '#map=18/' + l.lat + '/' + l.lng + '">' + esc(t('Check the pin')) + '</a>') +
            fact('Move-in cost', esc(t('{a} advance, {d} deposit', { a: l.advance_months == null ? '?' : l.advance_months, d: l.deposit_months == null ? '?' : l.deposit_months }))) +
            fact('Bills', esc([bills.electric ? t('Electricity') + ': ' + bills.electric : '', bills.water ? t('Water') + ': ' + bills.water : ''].filter(Boolean).join(' · '))) +
            fact('Amenities', esc((l.amenities || []).map(function (a) { return (window.HAVN_AMENITIES && HAVN_AMENITIES[a] && t(HAVN_AMENITIES[a].label)) || a; }).join(', '))) +
            fact('Rules', esc(ruleTxt)) +
          '</dl></div>' +
        '<aside class="rvc-side"><div class="rvc-keeper"><h3>' + esc(t('Keeper')) + '</h3><b>' + esc(k.full_name || t('(no name yet)')) + '</b>' +
            (mobile ? '<a href="tel:' + esc(mobile) + '">' + H.icon('phone') + '<span>' + esc(ECS.showMobile(mobile)) + '</span></a>' : '') +
            (k.email ? '<a href="mailto:' + esc(k.email) + '">' + H.icon('message') + '<span>' + esc(k.email) + '</span></a>' : '') + '</div>' +
          '<ul class="rvc-check"><li>' + H.icon('check') + esc(t('Photos are real and show these rooms')) + '</li><li>' + H.icon('check') + esc(t('The price is per month and complete')) + '</li><li>' + H.icon('check') + esc(t('The pin sits on the building')) + '</li></ul>' +
          '<label class="rvc-note"><span>' + esc(t('Note to the Keeper')) + ' <small>' + esc(t('needed when asking for changes')) + '</small></span><textarea rows="3" maxlength="500" data-note placeholder="' + esc(t('e.g. Please add a photo of the bathroom.')) + '"></textarea></label>' +
          '<button type="button" class="btn btn-primary btn-block" data-approve>' + esc(t('Approve and publish')) + '</button>' +
          '<button type="button" class="btn btn-ghost btn-block" data-changes>' + esc(t('Ask for changes')) + '</button>' +
          '<p class="rvc-fine">' + esc(t('The Keeper gets an email either way.')) + '</p></aside></div>' +
      '</article>';
    }).join('');
  }

  /* ---- Leads: one row each. The stage is a dropdown, and the row takes the colour of its stage. ---- */
  var leadFilter = 'all';
  function leads(d, listById, profById) {
    if (!d.inquiries.length) return '<p class="host-empty-line">' + esc(t('No leads yet. Every message a renter sends to a Keeper appears here.')) + '</p>';
    var n = function (k) { return k === 'all' ? d.inquiries.length : d.inquiries.filter(function (q) { return q.status === k; }).length; };
    if (leadFilter !== 'all' && !n(leadFilter)) leadFilter = 'all';
    var rows = d.inquiries.filter(function (q) { return leadFilter === 'all' || q.status === leadFilter; });
    return '<div class="adm-chips" role="group" aria-label="' + esc(t('Stage')) + '">' + [['all', 'All']].concat(STAGES).map(function (s) {
        return '<button type="button" class="st-' + s[0] + '" aria-pressed="' + (leadFilter === s[0]) + '" data-lead-filter="' + s[0] + '">' + (s[0] === 'all' ? '' : '<i></i>') + esc(t(s[1])) + ' <span>' + n(s[0]) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="lr-wrap"><div class="lr-h" aria-hidden="true"><span>' + esc(t('Renter')) + '</span><span>' + esc(t('Asked about')) + '</span><span>' + esc(t('Message')) + '</span><span>' + esc(t('Stage')) + '</span><span>' + esc(t('Team note')) + '</span></div>' +
      '<ul class="lr-list">' + rows.map(function (q) {
        var l = listById[q.listing_id], k = l && profById[l.owner_id];
        return '<li class="lead lr st-' + esc(q.status) + '" data-id="' + esc(q.id) + '">' +
          '<div class="lr-who"><b>' + esc(q.renter_name) + '</b><a href="tel:' + esc(q.renter_mobile) + '">' + esc(ECS.showMobile(q.renter_mobile)) + '</a>' + (q.renter_email ? '<a href="mailto:' + esc(q.renter_email) + '">' + esc(q.renter_email) + '</a>' : '') + '</div>' +
          '<div class="lr-room"><b>' + esc(q.listing_name || q.listing_ref) + '</b><small>' + esc([q.move_in ? t('Move-in: {m}', { m: q.move_in }) : '', day(q.created_at)].filter(Boolean).join(' · ')) + '</small>' +
            '<small class="' + (k ? '' : 'ours') + '">' + esc(k ? t('Keeper: {name}', { name: k.full_name || k.email }) : t('Sample listing: the team answers')) + '</small></div>' +
          '<p class="lr-msg" title="' + esc(q.message || '') + '">' + esc(q.message || '') + '</p>' +
          '<label class="lr-stage"><span class="sr">' + esc(t('Stage')) + '</span><select data-lead-stage>' + STAGES.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === q.status ? ' selected' : '') + '>' + esc(t(o[1])) + '</option>'; }).join('') + '</select></label>' +
          '<textarea class="lr-note" data-lead-note rows="1" maxlength="1000" aria-label="' + esc(t('Team note')) + '" placeholder="' + esc(t('Add a note')) + '">' + esc(q.admin_note || '') + '</textarea>' +
        '</li>';
      }).join('') + '</ul></div>';
  }

  /* ---- A listing's paid plan: set here when the Keeper's payment arrives ---- */
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function planCell(l) {
    if (l.status !== 'live' && l.status !== 'paused') return '<span class="tbl-none">–</span>';
    var ended = l.plan && (!l.plan_until || l.plan_until < today());
    return '<select data-plan aria-label="' + esc(t('Plan')) + '">' + [['', 'Free'], ['basic', 'Basic'], ['verified', 'Verified'], ['premium', 'Premium']].map(function (o) {
        return '<option value="' + o[0] + '"' + ((l.plan || '') === o[0] ? ' selected' : '') + '>' + esc(t(o[1])) + '</option>';
      }).join('') + '</select>' +
      '<input type="date" data-plan-until aria-label="' + esc(t('Plan ends on')) + '" value="' + esc(l.plan_until || '') + '"' + (l.plan ? '' : ' hidden') + '>' +
      (ended ? '<small class="plan-ended">' + esc(t('Term ended')) + '</small>' : '');
  }

  /* ---- Listings: the ones that matter first; half-started drafts sit behind their own filter ---- */
  var listFilter = 'active';
  function listings(d, profById) {
    if (!d.listings.length) return '<p class="host-empty-line">' + esc(t('No listings yet. When a Keeper starts one, it appears here.')) + '</p>';
    var views = {}; ((d.insights || {}).listings || []).forEach(function (x) { views[x.listing_id] = x; });
    var is = { active: function (l) { return l.status !== 'draft' && l.status !== 'removed'; }, live: function (l) { return l.status === 'live'; }, review: function (l) { return l.status === 'review' || l.status === 'changes'; },
      draft: function (l) { return l.status === 'draft'; }, all: function () { return true; } };
    var n = function (k) { return d.listings.filter(is[k]).length; };
    var liveKeepers = {}; d.listings.forEach(function (l) { if (l.status === 'live') liveKeepers[l.owner_id] = 1; });
    var order = { review: 0, changes: 1, live: 2, paused: 3, draft: 4, removed: 5 };
    var rows = d.listings.filter(is[listFilter]).sort(function (a, b) { return order[a.status] - order[b.status] || (ECS.stepsDone(b) - ECS.stepsDone(a)) || (a.updated_at < b.updated_at ? 1 : -1); });
    var tile = function (icon, v, label, tone) { return '<li><div class="kn"><span class="kn-ic ' + (tone || '') + '">' + H.icon(icon) + '</span><span class="kn-b"><b>' + v + '</b><span>' + esc(t(label)) + '</span></span></div></li>'; };
    return '<ul class="kn-row adm-sum">' + tile('home', n('live'), 'Live listings', 'green') + tile('user', Object.keys(liveKeepers).length, 'Keepers with a live listing', 'green') +
        tile('check', d.listings.filter(function (l) { return l.status === 'review'; }).length, 'Waiting for review', d.listings.some(function (l) { return l.status === 'review'; }) ? 'brass' : '') + tile('pencil', n('draft'), 'Drafts not sent yet') + '</ul>' +
      '<div class="adm-chips" role="group" aria-label="' + esc(t('Show')) + '">' + [['active', 'Sent to us'], ['live', 'Live'], ['review', 'In review'], ['draft', 'Drafts'], ['all', 'All']].map(function (f) {
        return '<button type="button" aria-pressed="' + (listFilter === f[0]) + '" data-list-filter="' + f[0] + '">' + esc(t(f[1])) + ' <span>' + n(f[0]) + '</span></button>';
      }).join('') + '</div>' +
      (rows.length ? '<div class="tbl-wrap"><table class="tbl tbl-l"><thead><tr><th>' + [t('Listing'), t('Keeper'), t('Status'), t('Views, 30 days'), t('Plan'), ''].map(esc).join('</th><th>') + '</th></tr></thead><tbody>' +
      rows.map(function (l) {
        var k = profById[l.owner_id] || {}, cover = l.photos && l.photos[0], price = ECS.priceFrom(l), v = views[l.id];
        return '<tr data-id="' + esc(l.id) + '"><td class="tbl-main">' + (cover ? '<img src="' + esc(cover.url || cover) + '" alt="" loading="lazy">' : '<span class="tbl-noimg">' + H.icon('home') + '</span>') +
          '<span><b>' + esc(l.name || t('Untitled listing')) + '</b><small>' + esc([l.area, price ? t('from {p} a month', { p: H.peso(price) }) : '', (l.photos || []).length + ' ' + t('photos')].filter(Boolean).join(' · ')) + '</small></span></td>' +
          '<td><b>' + esc(k.full_name || k.email || '') + '</b><small>' + esc(ECS.showMobile(l.contact_mobile || k.mobile || '')) + '</small></td>' +
          '<td><span class="pill st-' + l.status + '">' + esc(t(LSTATUS[l.status])) + '</span>' + (l.status === 'draft' ? '<small>' + esc(t('{n} of 6 steps done', { n: ECS.stepsDone(l) })) + '</small>' : '<small>' + esc(day(l.updated_at)) + '</small>') + '</td>' +
          '<td class="tbl-num">' + (l.status === 'live' || l.status === 'paused' ? '<b>' + ((v && v.views) || 0) + '</b><small>' + esc(t('{n} saves', { n: (v && v.saves) || 0 })) + '</small>' : '<span class="tbl-none">–</span>') + '</td>' +
          '<td class="tbl-plan">' + planCell(l) + '</td>' +
          '<td class="tbl-act">' + (l.status === 'review' ? '<a class="btn btn-primary btn-sm" href="' + esc(location.pathname) + '?tab=review" data-adm-go data-link>' + esc(t('Review')) + '</a>' :
            l.status === 'live' ? '<a class="btn btn-ghost btn-sm" href="/room/' + l.id + '" data-link>' + esc(t('View')) + '</a><button type="button" class="btn-link" data-unpublish>' + esc(t('Take down')) + '</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="host-empty-line">' + esc(t('No listings in this group.')) + '</p>');
  }

  /* ---- Insights: how the site is doing. Visits and searches are counted from the day this page was added. ---- */
  function insights(d) {
    var I = d.insights || { site: [], listings: [] }, listById = {}; d.listings.forEach(function (l) { listById[l.id] = l; });
    var days = []; for (var k = 29; k >= 0; k--) days.push(new Date(Date.now() + 8 * 36e5 - k * 864e5).toISOString().slice(0, 10));
    var at = {}; days.forEach(function (x, i) { at[x] = i; });
    var visits = days.map(function () { return 0; }), nVisit = 0, nSearch = 0, terms = {};
    I.site.forEach(function (s) {
      var i = at[String(s.day).slice(0, 10)]; if (i == null) return;
      if (s.kind === 'visit') { visits[i] += s.n; nVisit += s.n; } else { nSearch += s.n; terms[s.key] = (terms[s.key] || 0) + s.n; }
    });
    var top = Object.keys(terms).map(function (x) { return [x, terms[x]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
    var seen = I.listings.filter(function (x) { return listById[x.listing_id]; }).sort(function (a, b) { return b.views - a.views; }).slice(0, 6);
    var nViews = I.listings.reduce(function (a, x) { return a + (x.views || 0); }, 0);
    var areas = {}; d.listings.forEach(function (l) { if (l.status === 'live' && l.area) areas[l.area] = (areas[l.area] || 0) + 1; });
    var areaTop = Object.keys(areas).map(function (x) { return [x, areas[x]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
    var liveKeepers = {}; d.listings.forEach(function (l) { if (l.status === 'live') liveKeepers[l.owner_id] = 1; });
    var tile = function (icon, v, label, tone, hint) { return '<li><div class="kn"><span class="kn-ic ' + (tone || '') + '">' + H.icon(icon) + '</span><span class="kn-b"><b>' + Number(v).toLocaleString('en-PH') + '</b><span>' + esc(t(label)) + '</span>' + (hint ? '<small>' + esc(t(hint)) + '</small>' : '') + '</span></div></li>'; };
    var bars = function (list, empty) {
      if (!list.length) return '<p class="adm-quiet">' + esc(t(empty)) + '</p>';
      var max = list[0][1] || 1;
      return '<ol class="ab">' + list.map(function (x, i) { return '<li><span class="ab-n">' + (i + 1) + '</span><span class="ab-l">' + esc(x[0]) + '</span><span class="ab-bar"><i style="width:' + Math.max(4, Math.round(x[1] / max * 100)) + '%"></i></span><b>' + x[1] + '</b></li>'; }).join('') + '</ol>';
    };
    var vmax = Math.max(4, Math.max.apply(null, visits)), W = 600, Hh = 90, bw = W / 30;
    var chart = '<svg class="av" viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="none" role="img" aria-label="' + esc(t('Visits per day, last 30 days')) + '">' + visits.map(function (v, i) {
      var bh = v ? Math.max(3, Math.round(v / vmax * Hh)) : 1.5;
      return '<rect x="' + (i * bw + 2).toFixed(1) + '" y="' + (Hh - bh).toFixed(1) + '" width="' + (bw - 4).toFixed(1) + '" height="' + bh + '" rx="2"' + (v ? '' : ' class="zero"') + '><title>' + esc(day(days[i] + 'T12:00:00') + ': ' + v) + '</title></rect>';
    }).join('') + '</svg><p class="av-axis"><span>' + esc(day(days[0] + 'T12:00:00')) + '</span><span>' + esc(t('Today')) + '</span></p>';
    var card = function (title, sub, body) { return '<section class="kcard"><div class="kcard-h"><h2>' + esc(t(title)) + '</h2></div>' + (sub ? '<p class="adm-quiet">' + esc(t(sub)) + '</p>' : '') + body + '</section>'; };
    return '<ul class="kn-row adm-sum">' + tile('eye', nVisit, 'Visits to the site', 'green', 'last 30 days') + tile('search', nSearch, 'Searches', '', 'last 30 days') + tile('home', nViews, 'Listing pages opened', '', 'last 30 days') + tile('user', Object.keys(liveKeepers).length, 'Keepers with a live listing', 'green') + '</ul>' +
      '<div class="kh-cols adm-cols"><div class="kh-col">' +
        card('Visits per day', '', chart) +
        card('What renters search for', 'The places and words typed into search, most searched first.', bars(top, 'No searches counted yet. They build up as renters use the site.')) +
      '</div><div class="kh-col">' +
        card('Most opened listings', 'Live listings by how often renters opened them.', bars(seen.map(function (x) { return [listById[x.listing_id].name || t('Untitled listing'), x.views]; }), 'No listing has been opened yet. This fills in once listings are live.')) +
        card('Live listings by area', 'Where the supply is.', bars(areaTop, 'No live listings yet.')) +
      '</div></div>' +
      '<p class="adm-quiet">' + esc(t('Visits and searches are counted from 15 Nov 2026. A visit is one browser on one day; the team is not counted.')) + '</p>';
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
      return;
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
      if ((b = e.target.closest('[data-lead-filter]'))) { leadFilter = b.getAttribute('data-lead-filter'); paint(host, data); }
      else if ((b = e.target.closest('[data-list-filter]'))) { listFilter = b.getAttribute('data-list-filter'); paint(host, data); }
      else if ((b = e.target.closest('[data-approve], [data-changes]'))) {
        var card = b.closest('.rvc'), note = card.querySelector('[data-note]'), yes = b.hasAttribute('data-approve');
        if (!yes && note.value.trim().length < 5) { note.focus(); H.toast(t('Write a short note so the Keeper knows what to change.')); return; }
        if (yes && !window.confirm(t('Publish this listing? Renters will see it right away.'))) return;
        b.disabled = true; rev++;
        ECS.review(card.getAttribute('data-id'), yes ? 'live' : 'changes', yes ? null : note.value.trim()).then(function () {
          H.toast(yes ? t('Published. The Keeper has been emailed.') : t('Sent back with your note.'));
          note.blur(); return reload(host);
        }).catch(function (x) { b.disabled = false; H.toast(x.message); });
      }
      else if ((b = e.target.closest('[data-adm-csv]'))) download(b.getAttribute('data-adm-csv'));
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
