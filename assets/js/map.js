/* Havn PH — maps. MapLibre GL + OpenFreeMap (OpenStreetMap data, no API key).
 * The basemap is stripped of every shop, restaurant, hotel, bank and transit
 * icon, so the only things on the map are streets, room pins and schools. */
(function () {
  var M = (window.HavnMap = {});
  var V = '4.7.1';
  var LIB_JS = 'https://unpkg.com/maplibre-gl@' + V + '/dist/maplibre-gl.js';
  var LIB_CSS = 'https://unpkg.com/maplibre-gl@' + V + '/dist/maplibre-gl.css';
  var STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
  var DAVAO = [125.6035, 7.0760];

  var libP, styleP;
  M.load = function () {
    if (!libP) {
      libP = new Promise(function (res, rej) {
        var css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = LIB_CSS;
        document.head.appendChild(css);
        var s = document.createElement('script');
        s.src = LIB_JS; s.async = true;
        s.onload = function () { window.maplibregl ? res(window.maplibregl) : rej(new Error('map library missing')); };
        s.onerror = function () { libP = null; rej(new Error('map library failed to load')); };
        document.head.appendChild(s);
      });
    }
    return libP;
  };

  // Layers we never want: points of interest (shops, food, hotels...), transit
  // icons, airport label, road shields, one-way arrows, 3D buildings.
  var DROP = /^(poi_|poi-|airport|building-3d|highway-shield|road_shield|road_one_way|aerialway)/;
  function cleanStyle(s) {
    s.layers = s.layers.filter(function (l) { return !DROP.test(l.id); });
    s.layers.forEach(function (l) {
      var p = l.paint || (l.paint = {});
      if (l.id === 'background') p['background-color'] = '#F3F4F6';
      if (l.id === 'water') p['fill-color'] = '#BFD6F6';
      if (l.id === 'park') { p['fill-color'] = '#DDEBD5'; p['fill-outline-color'] = 'rgba(0,0,0,0)'; }
      if (l.id === 'landuse_residential') p['fill-color'] = '#EEEFF2';
      if (l.id === 'landuse_school') p['fill-color'] = '#E8EEFB';
      if (l.id === 'building') {
        delete l.maxzoom;
        p['fill-color'] = '#E3E5EA';
        p['fill-outline-color'] = '#D5D8DF';
      }
    });
    return s;
  }
  function style() {
    if (!styleP) {
      styleP = fetch(STYLE_URL).then(function (r) {
        if (!r.ok) throw new Error('map style ' + r.status);
        return r.json();
      }).then(cleanStyle).catch(function (e) { styleP = null; throw e; });
    }
    return styleP;
  }

  function baseMap(el, opts) {
    return Promise.all([M.load(), style()]).then(function (r) {
      var ml = r[0];
      var map = new ml.Map({
        container: el,
        style: JSON.parse(JSON.stringify(r[1])),
        center: opts.center || DAVAO,
        zoom: opts.zoom || 12.4,
        minZoom: 10,
        maxZoom: 18.5,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        cooperativeGestures: !!opts.cooperative,
      });
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation && map.keyboard.disableRotation();
      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new ml.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right');
      map.addControl(new ml.AttributionControl({ compact: true }), 'bottom-right');
      addSchools(ml, map);
      return { ml: ml, map: map };
    });
  }

  function addSchools(ml, map) {
    HAVN_SCHOOLS.forEach(function (s) {
      var el = document.createElement('div');
      el.className = 'school-pin' + (s.labelSide === 'left' ? ' left' : '');
      el.title = s.name;
      el.innerHTML = '<span class="school-dot">' + H.icon('cap') + '</span><span class="school-name">' + H.esc(s.short) + '</span>';
      new ml.Marker({ element: el, anchor: 'center' }).setLngLat([s.lng, s.lat]).addTo(map);
    });
    function zoomClass() { map.getContainer().classList.toggle('far', map.getZoom() < 13.2); }
    map.on('zoom', zoomClass); zoomClass();
  }

  function whenLoaded(map, fn) { if (map.loaded()) fn(); else map.once('load', fn); }
  var PLACE_ICONS = { mall: 'bag', hospital: 'plus', work: 'building' };
  M.placeIcon = function (kind) { return PLACE_ICONS[kind] || 'pin'; };

  /* ---------- Browse map: price pins, clusters, popup card ---------- */
  M.browse = function (el, opts) {
    return baseMap(el, {}).then(function (b) {
      var ml = b.ml, map = b.map;
      var markers = {}, shown = {}, list = [], listKey = null, hoverId = null, selectedId = null, popup = null;
      var wantBox = null, moveT = 0, placeMarker = null;

      function geo(items) {
        return {
          type: 'FeatureCollection',
          features: items.map(function (l) {
            return { type: 'Feature', id: l.id, properties: { id: l.id, price: l.price, full: l.status === 'full' ? 1 : 0 }, geometry: { type: 'Point', coordinates: [l.lng, l.lat] } };
          }),
        };
      }

      function makeMarker(f) {
        var p = f.properties, el = document.createElement('button');
        el.type = 'button';
        if (p.cluster) {
          el.className = 'cluster-pin';
          el.innerHTML = '<span>' + p.point_count + '</span>';
          el.setAttribute('aria-label', t('Zoom in to see each room') + ' (' + p.point_count + ')');
          el.addEventListener('click', function (e) {
            e.stopPropagation();
            map.getSource('rooms').getClusterExpansionZoom(p.cluster_id).then(function (z) {
              map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z + 0.3, 17) }, { fromUser: true });
            });
          });
        } else {
          var l = H.byId(p.id);
          el.className = 'pin' + (p.full ? ' full' : '');
          el.setAttribute('data-id', p.id);
          el.innerHTML = '<span>' + H.peso(p.price) + '</span>';
          el.setAttribute('aria-label', l.name + ', ' + H.peso(l.price) + ' ' + t('/ month'));
          el.addEventListener('click', function (e) { e.stopPropagation(); select(p.id); });
          el.addEventListener('mouseenter', function () { opts.onHover && opts.onHover(p.id, true); });
          el.addEventListener('mouseleave', function () { opts.onHover && opts.onHover(p.id, false); });
        }
        return new ml.Marker({ element: el, anchor: el.classList.contains('pin') ? 'bottom' : 'center' }).setLngLat(f.geometry.coordinates);
      }

      function sync() {
        if (!map.getSource('rooms') || !map.isSourceLoaded('rooms')) return;
        var feats = map.querySourceFeatures('rooms'), next = {};
        feats.forEach(function (f) {
          var key = f.properties.cluster ? 'c' + f.properties.cluster_id : f.properties.id;
          if (next[key]) return;
          var m = markers[key] || (markers[key] = makeMarker(f));
          next[key] = m;
          if (!shown[key]) m.addTo(map);
        });
        Object.keys(shown).forEach(function (k) { if (!next[k]) shown[k].remove(); });
        shown = next;
        paintStates();
      }

      function paintStates() {
        Object.keys(shown).forEach(function (k) {
          var el = shown[k].getElement();
          if (!el.classList.contains('pin')) return;
          var id = el.getAttribute('data-id');
          el.classList.toggle('hover', id === hoverId);
          el.classList.toggle('active', id === selectedId);
          el.classList.toggle('saved', H.saved.has(id));
        });
      }

      function clearMarkers() {
        Object.keys(markers).forEach(function (k) { markers[k].remove(); });
        markers = {}; shown = {};
      }

      function pad() {
        var p = (opts.padding && opts.padding()) || {};
        return { top: (p.top || 0) + 56, bottom: (p.bottom || 0) + 56, left: 56, right: 64 };
      }

      // Fit the main group of rooms; a far-off outlier (e.g. Mintal) stays one zoom-out away
      // instead of shrinking every other pin into a cluster.
      function core(items) {
        if (items.length < 4) return items;
        var mid = function (a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; };
        var m = { lat: mid(items.map(function (l) { return l.lat; })), lng: mid(items.map(function (l) { return l.lng; })) };
        var c = items.filter(function (l) { return H.km(l, m) <= 6; });
        return c.length >= Math.ceil(items.length * 0.6) ? c : items;
      }

      function fit(items, animate) {
        wantBox = null;
        items = core(items);
        if (!items.length) return;
        if (items.length === 1) { map.easeTo({ center: [items[0].lng, items[0].lat], zoom: 15, duration: animate ? 500 : 0 }); return; }
        var bb = new ml.LngLatBounds();
        items.forEach(function (l) { bb.extend([l.lng, l.lat]); });
        map.fitBounds(bb, { padding: pad(), maxZoom: 15, duration: animate ? 600 : 0 });
      }

      // Show a saved map area again (from the URL, or after the map was hidden on phones).
      function fitBox(b) {
        wantBox = b;
        map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 0, duration: 0 });
      }

      function bounds() {
        var b = map.getBounds();
        return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      }

      // Only a person dragging, zooming, tapping a cluster or asking for their location
      // changes the search. Our own fits, resizes and card pans carry no originalEvent.
      function byUser(e) { return !!(e.originalEvent || e.geolocateSource || e.fromUser); }
      map.on('movestart', function (e) { if (byUser(e)) clearTimeout(moveT); });
      map.on('moveend', function (e) {
        if (!opts.onMove || !byUser(e)) return;
        clearTimeout(moveT);
        moveT = setTimeout(function () { opts.onMove(bounds()); }, 120);
      });

      function closeCard() {
        selectedId = null;
        if (popup) { popup.remove(); popup = null; }
        var c = el.parentNode.querySelector('.map-card');
        if (c) c.remove();
        paintStates();
      }

      function select(id) {
        var l = H.byId(id);
        if (!l) return;
        closeCard();
        selectedId = id;
        paintStates();
        var html = opts.cardHtml(l);
        if (window.matchMedia('(min-width: 1024px)').matches) {
          // Pins stand on the exact spot (tail tip = location), so a popup above clears the pin.
          var off = { center: [0, 0], top: [0, 10], bottom: [0, -40], left: [34, -17], right: [-34, -17],
            'top-left': [12, 10], 'top-right': [-12, 10], 'bottom-left': [12, -40], 'bottom-right': [-12, -40] };
          popup = new ml.Popup({ offset: off, closeButton: true, maxWidth: '280px', className: 'room-popup', focusAfterOpen: false })
            .setLngLat([l.lng, l.lat]).setHTML(html).addTo(map);
          popup.on('close', function () { if (selectedId === id) { selectedId = null; paintStates(); } popup = null; });
        } else {
          var card = document.createElement('div');
          card.className = 'map-card';
          card.innerHTML = html + '<button class="icon-btn map-card-x" aria-label="' + H.esc(t('Close')) + '">' + H.icon('x') + '</button>';
          card.querySelector('.map-card-x').addEventListener('click', closeCard);
          el.parentNode.appendChild(card);
          var w = map.getContainer().clientHeight;
          var pt = map.project([l.lng, l.lat]);
          if (pt.y > w - 220) map.panBy([0, pt.y - (w - 260)], { duration: 300 });
        }
        if (opts.onSelect) opts.onSelect(id);
      }

      whenLoaded(map, function () {
        map.addSource('rooms', { type: 'geojson', data: geo(list), cluster: true, clusterRadius: 44, clusterMaxZoom: 14 });
        map.addLayer({ id: 'rooms-hit', type: 'circle', source: 'rooms', paint: { 'circle-radius': 1, 'circle-opacity': 0 } });
        map.on('render', sync);
        map.on('click', function () { closeCard(); });
        if (wantBox) fitBox(wantBox); else fit(list, false);
      });
      document.addEventListener('havn:saved', paintStates);

      return {
        map: map,
        // Same rooms as before → pins stay put (no flicker while the map is being moved).
        set: function (items, refit) {
          var key = items.map(function (l) { return l.id; }).sort().join(',');
          var changed = key !== listKey;
          list = items.slice(); listKey = key;
          if (selectedId && !list.some(function (l) { return l.id === selectedId; })) closeCard();
          if (changed && map.getSource('rooms')) { clearMarkers(); map.getSource('rooms').setData(geo(list)); }
          if (refit) fit(list, true);
        },
        fit: function () { fit(list, false); },
        fitBox: fitBox,
        bounds: bounds,
        hover: function (id, on) { hoverId = on ? id : (hoverId === id ? null : hoverId); paintStates(); },
        // The mall / hospital / office the search is "near" (schools already have their own markers).
        setPlace: function (p) {
          if (placeMarker && placeMarker._havnId === (p && p.id)) return;
          if (placeMarker) { placeMarker.remove(); placeMarker = null; }
          if (!p || !p.kind) return;
          var el = document.createElement('div');
          el.className = 'place-pin';
          el.title = p.name;
          el.innerHTML = '<span class="place-dot">' + H.icon(PLACE_ICONS[p.kind] || 'pin') + '</span><span class="place-name">' + H.esc(p.short) + '</span>';
          placeMarker = new ml.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
          placeMarker._havnId = p.id;
        },
        resize: function () { map.resize(); },
        close: closeCard,
        destroy: function () { document.removeEventListener('havn:saved', paintStates); map.remove(); },
      };
    });
  };

  /* ---------- Room map: one exact pin + schools ---------- */
  M.room = function (el, l) {
    return baseMap(el, { center: [l.lng, l.lat], zoom: 16, cooperative: true }).then(function (b) {
      var pinEl = document.createElement('div');
      pinEl.className = 'home-pin';
      pinEl.innerHTML = '<span>' + H.icon('home') + '</span>';
      pinEl.title = l.name;
      new b.ml.Marker({ element: pinEl, anchor: 'bottom' }).setLngLat([l.lng, l.lat]).addTo(b.map);
      return { map: b.map, destroy: function () { b.map.remove(); } };
    });
  };
})();
