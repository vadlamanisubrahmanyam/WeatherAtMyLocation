/* Interactive weather map: model-grid heatmaps with animated wind particles, radar, satellite and an embedded Windy view. */
'use strict';
const WxMap = (() => {
  // Stops are [value (metric), r, g, b, alpha]. Temperature/wind/precip follow the meteorological conventions
  // used by Windy & co. so they read the way users expect.
  const SCALES = {
    temp: [[-40, 230, 230, 255, 1], [-30, 155, 107, 214, 1], [-20, 91, 63, 176, 1], [-10, 47, 95, 208, 1], [0, 63, 169, 224, 1], [5, 69, 196, 176, 1], [10, 92, 207, 106, 1], [15, 182, 216, 75, 1], [20, 242, 210, 74, 1], [25, 245, 163, 58, 1], [30, 232, 99, 58, 1], [35, 199, 48, 58, 1], [40, 142, 26, 58, 1], [48, 74, 15, 42, 1]],
    wind: [[0, 58, 76, 140, 1], [10, 63, 127, 191, 1], [20, 63, 174, 159, 1], [35, 108, 194, 74, 1], [50, 224, 195, 65, 1], [70, 232, 133, 58, 1], [90, 216, 67, 58, 1], [120, 160, 36, 122, 1], [160, 90, 26, 106, 1]],
    precip: [[0, 0, 0, 0, 0], [0.1, 79, 163, 224, 0.5], [1, 47, 111, 208, 0.85], [3, 63, 191, 95, 0.9], [6, 232, 209, 58, 0.95], [10, 232, 133, 58, 1], [20, 216, 67, 58, 1], [40, 160, 36, 122, 1]],
    clouds: [[0, 20, 30, 45, 0], [25, 170, 180, 195, 0.18], [60, 215, 220, 228, 0.5], [100, 245, 246, 250, 0.82]],
    pressure: [[970, 91, 63, 176, 1], [990, 63, 127, 191, 1], [1005, 95, 140, 175, 1], [1013, 140, 140, 140, 1], [1020, 192, 138, 90, 1], [1035, 216, 83, 58, 1], [1050, 160, 36, 122, 1]],
    humidity: [[0, 201, 138, 58, 1], [30, 216, 195, 122, 1], [60, 95, 174, 159, 1], [80, 63, 127, 191, 1], [100, 47, 63, 160, 1]],
  };
  const LAYERS = [
    { id: 'wind', label: '💨 Wind', v: 'wind_speed_10m', scale: 'wind', unit: 'wind' },
    { id: 'gusts', label: '🌪️ Gusts', v: 'wind_gusts_10m', scale: 'wind', unit: 'wind' },
    { id: 'temp', label: '🌡️ Temp', v: 'temperature_2m', scale: 'temp', unit: 'temp' },
    { id: 'rain', label: '🌧️ Rain', v: 'precipitation', scale: 'precip', unit: 'precip' },
    { id: 'radar', label: '📡 Radar', kind: 'radar' },
    { id: 'clouds', label: '☁️ Clouds', v: 'cloud_cover', scale: 'clouds', unit: 'pct' },
    { id: 'pressure', label: '🧭 Pressure', v: 'pressure_msl', scale: 'pressure', unit: 'pres' },
    { id: 'humidity', label: '💧 Humidity', v: 'relative_humidity_2m', scale: 'humidity', unit: 'pct' },
    { id: 'sat', label: '🛰️ Satellite', kind: 'sat' },
    { id: 'windy', label: '🌀 Windy', kind: 'windy' },
  ];
  const WINDY_OVERLAYS = [['wind', 'Wind'], ['gust', 'Gusts'], ['rain', 'Rain'], ['temp', 'Temp'], ['clouds', 'Clouds'], ['pressure', 'Pressure'], ['rh', 'Humidity'], ['cape', 'Storms (CAPE)'], ['waves', 'Waves'], ['snowcover', 'Snow'], ['visibility', 'Visibility']];
  const GRID_VARS = ['temperature_2m', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'precipitation', 'cloud_cover', 'pressure_msl', 'relative_humidity_2m'];

  let map = null, me = null, layerId = 'wind', hour = 0, playTimer = null, particlesOn = true;
  let grid = null, gridAbort = null, field = null;
  let scalarCanvas, partCanvas, partCtx, particles = [], animId = null;
  const radar = { frames: [], layers: [], idx: 0, loaded: false, attached: false };
  let satLayer = null, satDaysAgo = 1, windyOverlay = 'wind', moveTimer = null;
  const luts = {};

  const $ = (id) => document.getElementById(id);
  const def = () => LAYERS.find((l) => l.id === layerId);

  function lut(name) {
    if (luts[name]) return luts[name];
    const st = SCALES[name], lo = st[0][0], hi = st[st.length - 1][0], N = 512, out = new Uint8ClampedArray(N * 4);
    for (let i = 0; i < N; i++) {
      const v = lo + (hi - lo) * i / (N - 1);
      let k = 0;
      while (k < st.length - 2 && v > st[k + 1][0]) k++;
      const a = st[k], b = st[k + 1], t = Math.max(0, Math.min(1, (v - a[0]) / (b[0] - a[0])));
      for (let c = 0; c < 4; c++) out[i * 4 + c] = (a[c + 1] + (b[c + 1] - a[c + 1]) * t) * (c === 3 ? 255 : 1);
    }
    return (luts[name] = { lo, hi, N, out });
  }

  function status(msg, ms) {
    const el = $('map-status');
    if (!msg) { el.style.display = 'none'; return; }
    el.textContent = msg; el.style.display = 'block';
    clearTimeout(status._t);
    if (ms) status._t = setTimeout(() => (el.style.display = 'none'), ms);
  }

  // ── Init ────────────────────────────────────────────
  function init() {
    if (map) return true;
    if (typeof L === 'undefined') { status('Map library could not load — check your connection'); return false; }
    const p = state.place || { lat: 20, lon: 78 };
    map = L.map('map', { zoomControl: false, worldCopyJump: true, minZoom: 2, maxZoom: 12, attributionControl: true })
      .setView([p.lat, p.lon], 5);
    map.attributionControl.setPrefix(false);
    const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
    L.tileLayer(ESRI + 'World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16, attribution: 'Basemap © Esri · Forecast data Open-Meteo',
    }).addTo(map);
    map.createPane('wxPane').style.zIndex = 350;
    map.createPane('partPane').style.zIndex = 360;
    map.createPane('labels').style.zIndex = 650;
    map.getPane('labels').style.pointerEvents = 'none';
    map.getPane('wxPane').style.pointerEvents = 'none';
    map.getPane('partPane').style.pointerEvents = 'none';
    L.tileLayer(ESRI + 'World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, pane: 'labels' }).addTo(map);

    scalarCanvas = L.DomUtil.create('canvas', '', map.getPane('wxPane'));
    partCanvas = L.DomUtil.create('canvas', '', map.getPane('partPane'));
    partCtx = partCanvas.getContext('2d');

    map.on('movestart zoomstart', () => { stopParticles(); scalarCanvas.style.opacity = 0; partCanvas.style.opacity = 0; });
    map.on('moveend', () => { clearTimeout(moveTimer); moveTimer = setTimeout(onMoveEnd, 120); });
    map.on('click', onMapClick);
    setPlace(state.place);
    buildChips();
    wireControls();
    return true;
  }

  function wireControls() {
    $('map-me').onclick = () => state.place && map.setView([state.place.lat, state.place.lon], Math.max(map.getZoom(), 7));
    $('map-zoom-in').onclick = () => map.zoomIn();
    $('map-zoom-out').onclick = () => map.zoomOut();
    $('map-particles').onclick = () => {
      particlesOn = !particlesOn;
      $('map-particles').classList.toggle('on', particlesOn);
      particlesOn ? startParticles() : (stopParticles(), partCtx.clearRect(0, 0, partCanvas.width, partCanvas.height));
    };
    $('map-time').oninput = (e) => setTime(+e.target.value);
    $('map-play').onclick = togglePlay;
  }

  function buildChips() {
    $('map-layers').innerHTML = LAYERS.map((l) => `<button class="chip${l.id === layerId ? ' active' : ''}" data-l="${l.id}">${l.label}</button>`).join('');
    $('map-layers').onclick = (e) => { const b = e.target.closest('[data-l]'); if (b) setLayer(b.dataset.l); };
    $('windy-layers').innerHTML = WINDY_OVERLAYS.map(([k, n]) => `<button class="chip${k === windyOverlay ? ' active' : ''}" data-w="${k}">${n}</button>`).join('');
    $('windy-layers').onclick = (e) => {
      const b = e.target.closest('[data-w]'); if (!b) return;
      windyOverlay = b.dataset.w;
      $$('#windy-layers .chip').forEach((c) => c.classList.toggle('active', c === b));
      loadWindy();
    };
  }

  // ── Layers ──────────────────────────────────────────
  function setLayer(id) {
    stopPlay();
    const prev = def();
    layerId = id;
    $$('#map-layers .chip').forEach((c) => c.classList.toggle('active', c.dataset.l === id));
    const L2 = def();
    if (prev.kind === 'radar' && L2.kind !== 'radar') detachRadar();
    if (prev.kind === 'sat' && L2.kind !== 'sat' && satLayer) { map.removeLayer(satLayer); satLayer = null; }

    const isWindy = L2.kind === 'windy';
    $('windy-frame').classList.toggle('hidden', !isWindy);
    $('windy-sel').classList.toggle('hidden', !isWindy);
    $('map').classList.toggle('hidden', isWindy);
    $('map-side').classList.toggle('hidden', isWindy);
    $('map-bottom').classList.toggle('hidden', isWindy);
    if (isWindy) { stopParticles(); loadWindy(); return; }
    map.invalidateSize();

    // The model grid also drives the wind particles, which stay on over radar (not over satellite imagery).
    if (L2.kind === 'radar') showRadar();
    else if (L2.kind === 'sat') { stopParticles(); showSat(); }
    else { hour = Math.min(hour, grid ? grid.times.length - 1 : 0); setupGridSlider(); }
    refreshGrid();
    legend();
  }

  // ── Model grid ──────────────────────────────────────
  function needGrid() {
    const b = map.getBounds();
    if (!grid) return true;
    const viewW = b.getEast() - b.getWest(), gridW = grid.e - grid.w;
    if (gridW > Math.max(3.2 * viewW, 30) && gridW < 359) return true; // zoomed in too far for this grid's resolution
    let w = b.getWest(), e = b.getEast();
    const shift = Math.round((grid.w + grid.e) / 2 / 360 - (w + e) / 2 / 360) * 360;
    w += shift; e += shift;
    return !(grid.s <= Math.max(b.getSouth(), -78) && grid.n >= Math.min(b.getNorth(), 80) && (gridW >= 359 || (grid.w <= w && grid.e >= e)));
  }

  async function refreshGrid() {
    rebuild(); // draw immediately from the grid we have, then refine if the view needs new data
    if (needGrid()) { await fetchGrid(); rebuild(); }
  }

  async function fetchGrid() {
    const b = map.getBounds(), size = map.getSize();
    const latSpan = b.getNorth() - b.getSouth(), lonSpan = b.getEast() - b.getWest();
    const s = Math.max(-78, b.getSouth() - latSpan * 0.25), n = Math.min(80, b.getNorth() + latSpan * 0.25);
    let w = b.getWest() - lonSpan * 0.25, e = b.getEast() + lonSpan * 0.25;
    if (e - w > 360) { const c = (b.getWest() + b.getEast()) / 2; w = c - 180; e = c + 180; }
    const aspect = Math.max(0.3, Math.min(3, size.x / size.y));
    const nx = Math.max(5, Math.min(20, Math.round(Math.sqrt(150 * aspect)))), ny = Math.max(5, Math.min(20, Math.round(150 / nx)));
    const lats = [], lons = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      lats.push((s + (n - s) * j / (ny - 1)).toFixed(2));
      lons.push((((w + (e - w) * i / (nx - 1)) + 540) % 360 - 180).toFixed(2));
    }
    if (gridAbort) gridAbort.abort();
    gridAbort = new AbortController();
    status('Loading forecast grid…');
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}&hourly=${GRID_VARS.join(',')}&forecast_hours=48&timezone=GMT`;
      const r = await fetch(url, { signal: gridAbort.signal });
      const j = await r.json();
      if (!r.ok) throw new Error(r.status === 429 ? 'Map data limit reached — try again in a minute' : (j && j.reason) || 'Map data unavailable');
      const arr = Array.isArray(j) ? j : [j];
      const times = arr[0].hourly.time, H = times.length, data = {};
      GRID_VARS.forEach((v) => {
        data[v] = [];
        for (let h = 0; h < H; h++) {
          const a = new Float32Array(nx * ny);
          for (let k = 0; k < arr.length; k++) { const x = arr[k].hourly[v][h]; a[k] = x == null ? NaN : x; }
          data[v].push(a);
        }
      });
      const u = [], vv = [];
      for (let h = 0; h < H; h++) {
        const sp = data.wind_speed_10m[h], dr = data.wind_direction_10m[h], ua = new Float32Array(nx * ny), va = new Float32Array(nx * ny);
        for (let k = 0; k < sp.length; k++) { const rd = dr[k] * Math.PI / 180; ua[k] = -sp[k] * Math.sin(rd); va[k] = -sp[k] * Math.cos(rd); }
        u.push(ua); vv.push(va);
      }
      grid = { s, n, w, e, nx, ny, times, data, u, v: vv };
      hour = Math.min(hour, H - 1);
      setupGridSlider();
      status(null);
    } catch (err) {
      if (err.name === 'AbortError') return;
      status('⚠️ ' + err.message, 5000);
    }
  }

  function sample(arr, gx, gy, nx, ny) {
    if (gx < 0 || gy < 0 || gx > nx - 1 || gy > ny - 1) return NaN;
    const x0 = Math.min(nx - 2, Math.floor(gx)), y0 = Math.min(ny - 2, Math.floor(gy)), fx = gx - x0, fy = gy - y0;
    const i = y0 * nx + x0;
    return arr[i] * (1 - fx) * (1 - fy) + arr[i + 1] * fx * (1 - fy) + arr[i + nx] * (1 - fx) * fy + arr[i + nx + 1] * fx * fy;
  }
  function gridCoords(lat, lng) {
    if (lng < grid.w) lng += 360 * Math.ceil((grid.w - lng) / 360);
    if (lng > grid.e) lng -= 360 * Math.ceil((lng - grid.e) / 360);
    return [(lng - grid.w) / (grid.e - grid.w) * (grid.nx - 1), (lat - grid.s) / (grid.n - grid.s) * (grid.ny - 1)];
  }
  function valueAt(v, lat, lng) {
    if (!grid) return NaN;
    const [gx, gy] = gridCoords(lat, lng);
    return sample(grid.data[v][hour], gx, gy, grid.nx, grid.ny);
  }

  function rebuild() {
    const L2 = def();
    if (!map || L2.kind === 'windy') return;
    const size = map.getSize(), origin = map.containerPointToLayerPoint([0, 0]);
    [scalarCanvas, partCanvas].forEach((c) => { L.DomUtil.setPosition(c, origin); c.width = size.x; c.height = size.y; c.style.opacity = 1; });
    if (!grid) { field = null; return; }
    const step = 5, cols = Math.ceil(size.x / step) + 1, rows = Math.ceil(size.y / step) + 1;
    const f = { cols, rows, step, s: new Float32Array(cols * rows), u: new Float32Array(cols * rows), v: new Float32Array(cols * rows) };
    const sv = L2.v ? grid.data[L2.v][hour] : null, ua = grid.u[hour], va = grid.v[hour];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const ll = map.containerPointToLatLng([x * step, y * step]);
      const [gx, gy] = gridCoords(ll.lat, ll.lng), k = y * cols + x;
      f.s[k] = sv ? sample(sv, gx, gy, grid.nx, grid.ny) : NaN;
      f.u[k] = sample(ua, gx, gy, grid.nx, grid.ny);
      f.v[k] = sample(va, gx, gy, grid.nx, grid.ny);
    }
    field = f;
    if (L2.v) drawScalar(L2); else clearScalar();
    if (particlesOn && L2.kind !== 'sat') startParticles();
  }

  function clearScalar() { if (scalarCanvas) scalarCanvas.getContext('2d').clearRect(0, 0, scalarCanvas.width, scalarCanvas.height); }

  function drawScalar(L2) {
    const lt = lut(L2.scale), f = field, img = new ImageData(f.cols, f.rows), d = img.data;
    const fade = L2.scale === 'clouds' || L2.scale === 'precip' ? 1 : 0.62;
    for (let k = 0; k < f.s.length; k++) {
      const v = f.s[k];
      if (isNaN(v)) continue;
      const i = Math.max(0, Math.min(lt.N - 1, Math.round((v - lt.lo) / (lt.hi - lt.lo) * (lt.N - 1)))) * 4;
      d[k * 4] = lt.out[i]; d[k * 4 + 1] = lt.out[i + 1]; d[k * 4 + 2] = lt.out[i + 2]; d[k * 4 + 3] = lt.out[i + 3] * fade;
    }
    const tmp = document.createElement('canvas');
    tmp.width = f.cols; tmp.height = f.rows;
    tmp.getContext('2d').putImageData(img, 0, 0);
    const ctx = scalarCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, scalarCanvas.width, scalarCanvas.height);
    ctx.drawImage(tmp, 0, 0, f.cols * f.step, f.rows * f.step);
  }

  // ── Particles ───────────────────────────────────────
  function spawn(p) { p.x = Math.random() * partCanvas.width; p.y = Math.random() * partCanvas.height; p.age = Math.floor(Math.random() * 60); }
  function startParticles() {
    stopParticles();
    if (!field || !particlesOn || document.hidden || state.tab !== 'map') return;
    const count = Math.min(2600, Math.round(partCanvas.width * partCanvas.height / 260));
    particles = Array.from({ length: count }, () => { const p = {}; spawn(p); return p; });
    const f = field, ctx = partCtx, K = 0.07;
    const color = def().id === 'wind' || def().id === 'gusts' ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.55)';
    const tick = () => {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = 'rgba(0,0,0,0.93)';
      ctx.fillRect(0, 0, partCanvas.width, partCanvas.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const p of particles) {
        const k = Math.round(p.y / f.step) * f.cols + Math.round(p.x / f.step);
        const u = f.u[k], v = f.v[k];
        if (u === undefined || isNaN(u) || p.age++ > 90) { spawn(p); continue; }
        const nx = p.x + u * K, ny = p.y - v * K;
        ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny);
        p.x = nx; p.y = ny;
        if (nx < 0 || ny < 0 || nx > partCanvas.width || ny > partCanvas.height) spawn(p);
      }
      ctx.stroke();
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
  }
  function stopParticles() { if (animId) cancelAnimationFrame(animId); animId = null; }

  // ── Time slider ─────────────────────────────────────
  function setupGridSlider() {
    const sl = $('map-time');
    sl.max = grid ? grid.times.length - 1 : 47;
    sl.value = hour;
    timeLabel();
  }
  function timeLabel() {
    const L2 = def(), el = $('map-tl');
    if (L2.kind === 'radar') {
      const f = radar.frames[radar.idx];
      if (!f) { el.textContent = '—'; return; }
      const d = new Date(f.time * 1000), mins = Math.round((f.time * 1000 - Date.now()) / 60000);
      el.textContent = fmtClock(d) + (mins > 5 ? ` +${mins}m` : mins < -5 ? ` ${mins}m` : ' now');
    } else if (L2.kind === 'sat') {
      el.textContent = satDate();
    } else if (grid) {
      const d = new Date(grid.times[hour] + ':00Z');
      el.textContent = d.toLocaleDateString('en', { weekday: 'short' }) + ' ' + fmtClock(d) + (hour ? ` +${hour}h` : '');
    } else el.textContent = '—';
  }
  function fmtClock(d) {
    const h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
    return S.clock === '12' ? `${(h % 12) || 12}:${m}${h < 12 ? 'am' : 'pm'}` : `${String(h).padStart(2, '0')}:${m}`;
  }
  function setTime(i) {
    const L2 = def();
    if (L2.kind === 'radar') showRadarFrame(i);
    else if (L2.kind === 'sat') { satDaysAgo = 7 - i; showSat(); }
    else { hour = i; rebuild(); }
    $('map-time').value = i;
    timeLabel();
  }
  function togglePlay() { playTimer ? stopPlay() : startPlay(); }
  function startPlay() {
    $('map-play').textContent = '❚❚';
    const L2 = def();
    playTimer = setInterval(() => {
      const sl = $('map-time'), max = +sl.max;
      setTime(+sl.value >= max ? 0 : +sl.value + 1);
    }, L2.kind === 'radar' ? 600 : 900);
  }
  function stopPlay() { clearInterval(playTimer); playTimer = null; $('map-play').textContent = '▶'; }

  // ── Radar (RainViewer) ──────────────────────────────
  async function showRadar() {
    try {
      if (!radar.loaded) {
        status('Loading radar…');
        const j = await getJSON('https://api.rainviewer.com/public/weather-maps.json');
        const past = j.radar.past || [], now = j.radar.nowcast || [];
        radar.frames = past.concat(now);
        radar.layers = radar.frames.map((f) => L.tileLayer(`${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, {
          opacity: 0, maxNativeZoom: 7, maxZoom: 12, zIndex: 300, attribution: 'Radar © RainViewer',
        }));
        radar.idx = Math.max(0, past.length - 1);
        radar.loaded = true;
        status(null);
      }
      if (def().kind !== 'radar') return;
      if (!radar.attached) { radar.layers.forEach((l) => l.addTo(map)); radar.attached = true; }
      const sl = $('map-time');
      sl.max = radar.frames.length - 1;
      showRadarFrame(radar.idx);
      sl.value = radar.idx;
      if (map.getZoom() > 7) status('Radar detail is limited to zoom level 7', 3500);
    } catch (e) {
      status('⚠️ Radar unavailable right now', 4000);
    }
  }
  function showRadarFrame(i) {
    radar.idx = i;
    radar.layers.forEach((l, k) => l.setOpacity(k === i ? 0.85 : 0));
    timeLabel();
  }
  function detachRadar() { radar.layers.forEach((l) => map.removeLayer(l)); radar.attached = false; }

  // ── Satellite (NASA GIBS, daily true colour) ────────
  function satDate() { return new Date(Date.now() - satDaysAgo * 86400000).toISOString().slice(0, 10); }
  function showSat() {
    if (satLayer) map.removeLayer(satLayer);
    satLayer = L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${satDate()}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, {
      maxNativeZoom: 9, maxZoom: 12, zIndex: 250, attribution: 'Imagery © NASA GIBS / NOAA-20 VIIRS',
    }).addTo(map);
    const sl = $('map-time');
    sl.max = 6; sl.value = 7 - satDaysAgo;
    timeLabel();
  }

  // ── Windy embed ─────────────────────────────────────
  function loadWindy() {
    const c = map ? map.getCenter() : { lat: state.place.lat, lng: state.place.lon };
    const z = map ? Math.min(11, Math.max(3, map.getZoom())) : 5, p = state.place || { lat: c.lat, lon: c.lng };
    const wind = { kmh: 'km/h', mph: 'mph', ms: 'm/s', kn: 'kt', bft: 'bft' }[S.wind] || 'km/h';
    const q = new URLSearchParams({
      lat: c.lat.toFixed(3), lon: (((c.lng + 540) % 360) - 180).toFixed(3), detailLat: p.lat.toFixed(3), detailLon: p.lon.toFixed(3),
      zoom: z, level: 'surface', overlay: windyOverlay, product: 'ecmwf', menu: '', message: 'true', marker: 'true',
      calendar: 'now', pressure: 'true', type: 'map', location: 'coordinates', detail: '', metricWind: wind,
      metricTemp: S.temp === 'F' ? '°F' : '°C', radarRange: '-1',
    });
    $('windy-frame').src = 'https://embed.windy.com/embed2.html?' + q.toString();
  }

  // ── Legend ──────────────────────────────────────────
  function legend() {
    const L2 = def(), el = $('map-legend');
    if (L2.kind === 'windy') return;
    if (L2.kind === 'radar') {
      el.innerHTML = `Radar reflectivity · past 2 h${radar.frames.length > 13 ? ' + short-term forecast' : ''}<div class="lg-bar" style="background:linear-gradient(90deg,#88ddee,#0099cc,#0077aa,#ffee00,#ff9900,#ff4400,#cc0000)"></div><div class="lg-l"><span>Light</span><span>Moderate</span><span>Heavy</span></div>`;
      return;
    }
    if (L2.kind === 'sat') {
      el.innerHTML = 'NASA VIIRS true-colour satellite view · daily composite · slide to see past 7 days';
      return;
    }
    const st = SCALES[L2.scale], lo = st[0][0], hi = st[st.length - 1][0];
    const stops = st.map((s) => `rgba(${s[1]},${s[2]},${s[3]},${Math.max(s[4], 0.25)}) ${((s[0] - lo) / (hi - lo) * 100).toFixed(1)}%`).join(',');
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => fmtLegend(L2.unit, lo + (hi - lo) * t));
    el.innerHTML = `${L2.label.replace(/^\S+\s/, '')} · ${unitName(L2.unit)}<div class="lg-bar" style="background:linear-gradient(90deg,${stops})"></div><div class="lg-l">${ticks.map((t) => `<span>${t}</span>`).join('')}</div>`;
  }
  function unitName(u) { return u === 'temp' ? U.tUnit() : u === 'wind' ? U.windUnit() : u === 'precip' ? U.precipUnit() + '/h' : u === 'pres' ? U.presUnit() : '%'; }
  function fmtLegend(u, v) {
    if (u === 'temp') return Math.round(U.tNum(v));
    if (u === 'wind') return S.wind === 'bft' ? U.beaufort(v) : Math.round(U.windNum(v));
    if (u === 'precip') return S.precip === 'in' ? (v / 25.4).toFixed(2) : +v.toFixed(1);
    if (u === 'pres') return U.presNum(v);
    return Math.round(v);
  }

  // ── Tap a point ─────────────────────────────────────
  function onMapClick(e) {
    const { lat, lng } = e.latlng, nlng = ((lng + 540) % 360) - 180;
    const v = (k) => valueAt(k, lat, lng);
    let body;
    if (grid && !isNaN(v('temperature_2m'))) {
      const u = sampleUV(lat, lng), dir = (Math.atan2(-u[0], -u[1]) * 180 / Math.PI + 360) % 360;
      body = `<div class="pop-g">
        <span>Temperature</span><b>${U.t(v('temperature_2m'))}</b>
        <span>Wind</span><b>${U.wind(v('wind_speed_10m'))} ${U.compass(dir)}</b>
        <span>Gusts</span><b>${U.wind(v('wind_gusts_10m'))}</b>
        <span>Precipitation</span><b>${U.precip(Math.max(0, v('precipitation')))}/h</b>
        <span>Clouds</span><b>${Math.round(v('cloud_cover'))}%</b>
        <span>Humidity</span><b>${Math.round(v('relative_humidity_2m'))}%</b>
        <span>Pressure</span><b>${U.pres(v('pressure_msl'))}</b></div>
        <div class="card-note" style="margin-top:6px">${$('map-tl').textContent} · interpolated from model grid</div>`;
    } else body = '<div class="muted">Tap “Full forecast” for this spot.</div>';
    L.popup({ maxWidth: 260 }).setLatLng(e.latlng).setContent(
      `<div class="pop-t">${lat.toFixed(2)}°, ${nlng.toFixed(2)}°</div>${body}<button class="pop-btn" onclick="App.openPoint(${lat.toFixed(4)},${nlng.toFixed(4)})">Full forecast here ›</button>`
    ).openOn(map);
  }
  function sampleUV(lat, lng) {
    const [gx, gy] = gridCoords(lat, lng);
    return [sample(grid.u[hour], gx, gy, grid.nx, grid.ny), sample(grid.v[hour], gx, gy, grid.nx, grid.ny)];
  }

  function onMoveEnd() {
    const L2 = def();
    if (L2.kind === 'windy') return;
    if (L2.kind === 'radar' || L2.kind === 'sat') {
      rebuild();
      if (!grid || needGrid()) fetchGrid().then(rebuild); // keeps particles available over radar
      return;
    }
    refreshGrid();
  }

  // ── Public ──────────────────────────────────────────
  function show() {
    if (!init()) return;
    setTimeout(() => {
      map.invalidateSize();
      if (def().kind === 'windy') { loadWindy(); return; }
      if (!grid) setLayer(layerId); else { rebuild(); legend(); timeLabel(); }
    }, 60);
  }
  function hide() { stopPlay(); stopParticles(); }
  function setPlace(p) {
    if (!map || !p) return;
    const ll = [p.lat, p.lon];
    if (!me) me = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false }).addTo(map);
    else me.setLatLng(ll);
    map.setView(ll, Math.max(map.getZoom(), 5));
    if (def().kind === 'windy') loadWindy();
  }
  function unitsChanged() { if (map) { legend(); timeLabel(); if (def().kind === 'windy') loadWindy(); } }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopParticles(); else if (state.tab === 'map' && map) startParticles(); });
  return { show, hide, setPlace, unitsChanged };
})();
