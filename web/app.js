/* SkyPulse Weather — main app logic. All data sources are free and key-less. */
'use strict';

// ── Helpers ───────────────────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ok = (v) => v != null && !isNaN(v);
const store = {
  get(k, d) { try { const v = localStorage.getItem('wx.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('wx.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};
async function getJSON(url, ms = 15000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error((j && (j.reason || j.detail || j.title)) || 'HTTP ' + r.status);
    return j;
  } finally { clearTimeout(t); }
}
function toast(msg, ms = 3200) {
  const el = $('#toast');
  el.textContent = msg; el.style.display = 'block';
  clearTimeout(toast._t); toast._t = setTimeout(() => (el.style.display = 'none'), ms);
}

// ── Settings & units ──────────────────────────────────
const DEFAULTS = { temp: 'C', wind: 'kmh', pressure: 'hPa', precip: 'mm', dist: 'km', clock: '24', aqi: 'us' };
const S = Object.assign({}, DEFAULTS, store.get('settings', {}));
const BFT = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
const U = {
  tNum: (c) => (S.temp === 'F' ? c * 9 / 5 + 32 : c),
  t: (c) => (ok(c) ? Math.round(U.tNum(c)) + '°' : '--'),
  tUnit: () => (S.temp === 'F' ? '°F' : '°C'),
  beaufort: (k) => { let b = 0; while (b < 12 && k >= BFT[b]) b++; return b; },
  windNum: (k) => ({ kmh: k, mph: k * 0.621371, ms: k / 3.6, kn: k * 0.539957, bft: U.beaufort(k) }[S.wind]),
  windUnit: () => ({ kmh: 'km/h', mph: 'mph', ms: 'm/s', kn: 'kn', bft: 'Bft' }[S.wind]),
  wind: (k) => (ok(k) ? (S.wind === 'bft' ? 'F' + U.beaufort(k) : Math.round(U.windNum(k)) + ' ' + U.windUnit()) : '--'),
  presNum: (h) => (S.pressure === 'inHg' ? +(h * 0.02953).toFixed(2) : S.pressure === 'mmHg' ? Math.round(h * 0.750062) : Math.round(h)),
  presUnit: () => S.pressure,
  pres: (h) => (ok(h) ? U.presNum(h) + ' ' + S.pressure : '--'),
  precipUnit: () => (S.precip === 'in' ? 'in' : 'mm'),
  precip: (mm) => (ok(mm) ? (S.precip === 'in' ? (mm / 25.4).toFixed(2) + ' in' : (mm >= 10 ? Math.round(mm) : mm.toFixed(1)) + ' mm') : '--'),
  snow: (cm) => (ok(cm) ? (S.precip === 'in' ? (cm / 2.54).toFixed(1) + ' in' : cm.toFixed(1) + ' cm') : '--'),
  dist: (m) => {
    if (!ok(m)) return '--';
    if (S.dist === 'mi') { const mi = m / 1609.34; return (mi >= 10 ? Math.round(mi) : mi.toFixed(1)) + ' mi'; }
    const km = m / 1000; return (km >= 10 ? Math.round(km) : km.toFixed(1)) + ' km';
  },
  height: (m) => (ok(m) ? (S.dist === 'mi' ? Math.round(m * 3.28084).toLocaleString() + ' ft' : Math.round(m).toLocaleString() + ' m') : '--'),
  compass: (d) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(((d % 360) + 360) % 360 / 22.5) % 16],
};

// ── Time (Open-Meteo returns location-local "YYYY-MM-DDTHH:MM") ─────
function hm(str) {
  const h = +str.slice(11, 13), m = str.slice(14, 16);
  if (S.clock === '12') return `${(h % 12) || 12}${m !== '00' ? ':' + m : ''}${h < 12 ? 'am' : 'pm'}`;
  return `${String(h).padStart(2, '0')}:${m}`;
}
function hourLabel(str) {
  const h = +str.slice(11, 13);
  return S.clock === '12' ? `${(h % 12) || 12}${h < 12 ? 'a' : 'p'}` : String(h).padStart(2, '0');
}
const dayName = (ds, short = true) => new Date(ds.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en', { weekday: short ? 'short' : 'long', timeZone: 'UTC' });
const dayDate = (ds) => new Date(ds.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const locNow = (wx) => new Date(Date.now() + wx.utc_offset_seconds * 1000).toISOString().slice(0, 16);
const localStr = (date, wx) => new Date(date.getTime() + wx.utc_offset_seconds * 1000).toISOString().slice(0, 16);
function hourIdx(wx) {
  const now = locNow(wx).slice(0, 13), i = wx.hourly.time.findIndex((t) => t.slice(0, 13) === now);
  return i < 0 ? 0 : i;
}
function todayIdx(wx) { const i = wx.daily.time.indexOf(locNow(wx).slice(0, 10)); return i < 0 ? 0 : i; }
const fmtDur = (sec) => { if (!ok(sec)) return '--'; const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return `${h}h ${String(m).padStart(2, '0')}m`; };

// ── WMO weather codes ─────────────────────────────────
const WMO = {
  0: ['Clear sky', '☀️', '🌙'], 1: ['Mainly clear', '🌤️', '🌙'], 2: ['Partly cloudy', '⛅', '☁️'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Freezing fog', '🌫️'], 51: ['Light drizzle', '🌦️', '🌧️'], 53: ['Drizzle', '🌦️', '🌧️'], 55: ['Dense drizzle', '🌧️'],
  56: ['Freezing drizzle', '🌧️'], 57: ['Heavy freezing drizzle', '🌧️'], 61: ['Light rain', '🌦️', '🌧️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'], 67: ['Heavy freezing rain', '🌧️'], 71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
  80: ['Light showers', '🌦️', '🌧️'], 81: ['Showers', '🌧️'], 82: ['Violent showers', '⛈️'], 85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm with hail', '⛈️'], 99: ['Severe thunderstorm with hail', '⛈️'],
};
const wmo = (code, isDay = 1) => { const w = WMO[code] || ['Unknown', '🌡️']; return { text: w[0], icon: !isDay && w[2] ? w[2] : w[1] }; };
function heroClass(code, isDay) {
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 51) return 'rain';
  if (!isDay) return 'night';
  return code <= 1 ? 'clear' : '';
}

// ── State ─────────────────────────────────────────────
const state = { place: null, wx: null, aq: null, marine: null, mins: null, nws: null, models: null, tab: 'today', hourMetric: 'temp', modelMetric: 'temp', loadToken: 0, loadedAt: 0 };
let saved = store.get('places', []);

// ── Data URLs ─────────────────────────────────────────
const HOURLY = 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,snow_depth,weather_code,pressure_msl,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,evapotranspiration,vapour_pressure_deficit,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day,cape,lifted_index,freezing_level_height,shortwave_radiation,soil_temperature_0cm,soil_moisture_0_to_1cm';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,sunshine_duration,uv_index_max,precipitation_sum,rain_sum,snowfall_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,shortwave_radiation_sum,et0_fao_evapotranspiration';
const CURRENT = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
const ll = (p) => `latitude=${p.lat.toFixed(4)}&longitude=${p.lon.toFixed(4)}`;
const forecastURL = (p) => `https://api.open-meteo.com/v1/forecast?${ll(p)}&current=${CURRENT}&hourly=${HOURLY}&daily=${DAILY}&past_days=1&forecast_days=16&timezone=auto`;
const minutelyURL = (p) => `https://api.open-meteo.com/v1/forecast?${ll(p)}&minutely_15=precipitation,temperature_2m&past_minutely_15=1&forecast_minutely_15=12&timezone=auto`;
const aqURL = (p) => `https://air-quality-api.open-meteo.com/v1/air-quality?${ll(p)}&current=us_aqi,european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,dust,aerosol_optical_depth&hourly=us_aqi,european_aqi,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&forecast_days=4&timezone=auto`;
const marineURL = (p) => `https://marine-api.open-meteo.com/v1/marine?${ll(p)}&current=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature&daily=wave_height_max&forecast_days=3&timezone=auto`;
const MODELS = [
  ['ecmwf_ifs025', 'ECMWF', '#3987e5'], ['gfs_seamless', 'GFS (NOAA)', '#d95926'], ['icon_seamless', 'ICON (DWD)', '#199e70'],
  ['gem_seamless', 'GEM (Canada)', '#c98500'], ['jma_seamless', 'JMA (Japan)', '#d55181'], ['ukmo_seamless', 'UK Met Office', '#0ca30c'],
  ['meteofrance_seamless', 'Météo-France', '#9085e9'],
];

// ── Location ──────────────────────────────────────────
function geolocate() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Geolocation unsupported'));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lon: p.coords.longitude }),
      rej, { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
  });
}
async function reverseGeocode(lat, lon) {
  try {
    const j = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, 8000);
    const name = j.locality || j.city || j.principalSubdivision;
    if (name) return { name, admin: [j.city !== name ? j.city : '', j.principalSubdivision].filter(Boolean).join(', '), country: j.countryName || '' };
  } catch (e) { /* fall through */ }
  try {
    const j = await getJSON(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=14`, 8000);
    const a = j.address || {};
    const name = a.suburb || a.neighbourhood || a.city || a.town || a.village || a.county;
    if (name) return { name, admin: [a.city || a.town || '', a.state || ''].filter((x) => x && x !== name).join(', '), country: a.country || '' };
  } catch (e) { /* fall through */ }
  return { name: `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, admin: '', country: '' };
}
async function useMyLocation() {
  setBusy(true);
  $('#place-name').textContent = 'Locating…';
  let p;
  try {
    const g = await geolocate();
    p = { ...g, current: true };
  } catch (e) {
    try {
      const j = await getJSON('https://get.geojs.io/v1/ip/geo.json', 8000);
      p = { lat: +j.latitude, lon: +j.longitude, name: j.city || j.region, admin: j.region || '', country: j.country || '', current: true, approx: true };
      toast('GPS unavailable — using approximate location');
    } catch (e2) {
      p = store.get('lastPlace') || { lat: 17.385, lon: 78.487, name: 'Hyderabad', admin: 'Telangana', country: 'India' };
      toast('Location unavailable — showing ' + p.name);
    }
  }
  if (p.current && !p.approx) Object.assign(p, await reverseGeocode(p.lat, p.lon));
  await loadPlace(p);
}

// ── Load everything for a place ───────────────────────
async function loadPlace(p) {
  const token = ++state.loadToken;
  state.place = p;
  store.set('lastPlace', p);
  renderHeader();
  WxMap.setPlace(p);
  setBusy(true);
  const aqP = getJSON(aqURL(p)).catch(() => null);
  const marP = getJSON(marineURL(p)).catch(() => null);
  const minP = getJSON(minutelyURL(p)).catch(() => null);
  const inUS = p.lat > 17 && p.lat < 72 && p.lon > -180 && p.lon < -64;
  const nwsP = inUS ? getJSON(`https://api.weather.gov/alerts/active?point=${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).catch(() => null) : Promise.resolve(null);
  try {
    const wx = await getJSON(forecastURL(p), 20000);
    if (token !== state.loadToken) return;
    state.wx = wx; state.models = null; state.aq = state.marine = state.mins = state.nws = null;
    renderAll();
  } catch (e) {
    if (token !== state.loadToken) return;
    setBusy(false);
    $('#hero').innerHTML = `<div class="skel err">Couldn’t load the forecast (${esc(e.message)}).<br><br><button class="pill-btn" onclick="App.reload()">Try again</button></div>`;
    return;
  }
  const [aq, marine, mins, nws] = await Promise.all([aqP, marP, minP, nwsP]);
  if (token !== state.loadToken) return;
  Object.assign(state, { aq, marine, mins, nws, loadedAt: Date.now() });
  renderAll();
  setBusy(false);
}
function setBusy(b) { $('#refresh-btn').classList.toggle('spin', b); }

// ── Render: header ────────────────────────────────────
function renderHeader() {
  const p = state.place;
  $('#place-name').textContent = (p.current ? '📍 ' : '') + (p.name || 'Unknown');
  $('#place-sub').textContent = [p.admin, p.country].filter(Boolean).join(', ') || `${p.lat.toFixed(2)}°, ${p.lon.toFixed(2)}°`;
  const isSaved = saved.some((s) => near(s, p));
  $('#star-btn').textContent = isSaved ? '★' : '☆';
  $('#star-btn').classList.toggle('on', isSaved);
}
const near = (a, b) => Math.abs(a.lat - b.lat) < 0.02 && Math.abs(a.lon - b.lon) < 0.02;

function renderAll() {
  if (!state.wx) return;
  renderHeader();
  renderToday();
  renderForecast();
  renderSky();
}

// ── Render: Today ─────────────────────────────────────
function renderToday() {
  const wx = state.wx, c = wx.current, h = wx.hourly, d = wx.daily, i = hourIdx(wx), di = todayIdx(wx);
  const w = wmo(c.weather_code, c.is_day);
  const hero = $('#hero');
  hero.className = 'hero ' + heroClass(c.weather_code, c.is_day);
  hero.innerHTML = `
    <div class="hero-top">
      <div>
        <div class="hero-temp num">${U.t(c.temperature_2m)}</div>
        <div class="hero-cond">${w.text}</div>
        <div class="hero-meta">Feels like ${U.t(c.apparent_temperature)} · H ${U.t(d.temperature_2m_max[di])} L ${U.t(d.temperature_2m_min[di])}</div>
      </div>
      <div class="hero-icon">${w.icon}</div>
    </div>
    <div class="hero-summary">${esc(daySummary(wx))}</div>
    <div class="hero-foot"><span>Local time ${hm(locNow(wx))} (${esc(wx.timezone_abbreviation || wx.timezone)})</span><span>Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>`;

  renderAlerts();
  renderNowcast();

  // 24h strip with sunrise / sunset markers
  const cells = [];
  const sunEvents = [];
  [di, di + 1].forEach((k) => { if (d.sunrise[k]) sunEvents.push([d.sunrise[k], '🌅', 'Sunrise']); if (d.sunset[k]) sunEvents.push([d.sunset[k], '🌇', 'Sunset']); });
  for (let k = i; k < Math.min(i + 25, h.time.length); k++) {
    const ww = wmo(h.weather_code[k], h.is_day[k]), pp = h.precipitation_probability[k];
    cells.push(`<div class="hcell${k === i ? ' now' : ''}"><span class="ht">${k === i ? 'Now' : hourLabel(h.time[k])}</span><span class="hi">${ww.icon}</span><span class="hv num">${U.t(h.temperature_2m[k])}</span><span class="hp">${pp >= 10 ? pp + '%' : ''}</span></div>`);
    sunEvents.forEach(([t, ic, nm]) => {
      if (t.slice(0, 13) === h.time[k].slice(0, 13) && k !== i) cells.push(`<div class="hcell sun"><span class="ht">${hm(t)}</span><span class="hi">${ic}</span><span class="hv">${nm}</span><span class="hp"></span></div>`);
    });
  }
  $('#hstrip').innerHTML = cells.join('');

  // detail tiles
  const pTrend = ok(h.pressure_msl[i - 3]) ? h.pressure_msl[i] - h.pressure_msl[i - 3] : 0;
  const trend = pTrend > 1 ? '↗ Rising' : pTrend < -1 ? '↘ Falling' : '→ Steady';
  const wb = wetBulb(c.temperature_2m, c.relative_humidity_2m);
  const uv = h.uv_index[i], cape = h.cape[i];
  const uvL = uvLevel(uv);
  const tiles = [
    { k: '🌡️ Feels like', v: U.t(c.apparent_temperature), s: feelsNote(c) },
    { k: '💧 Humidity', v: Math.round(c.relative_humidity_2m) + '%', s: `Dew point ${U.t(h.dew_point_2m[i])} · ${dewComfort(h.dew_point_2m[i])}` },
    { k: '💨 Wind', v: U.wind(c.wind_speed_10m), s: `${U.compass(c.wind_direction_10m)} · gusts ${U.wind(c.wind_gusts_10m)}<br>${beaufortName(U.beaufort(c.wind_speed_10m))}`, arrow: c.wind_direction_10m },
    { k: '🧭 Pressure', v: U.pres(c.pressure_msl), s: `${trend} (3 h)` },
    { k: '☀️ UV index', v: ok(uv) ? uv.toFixed(1) : '--', s: `${uvL[0]} · today max ${ok(d.uv_index_max[di]) ? d.uv_index_max[di].toFixed(1) : '--'}`, meter: [Math.min(1, (uv || 0) / 11), uvL[1]] },
    { k: '👁️ Visibility', v: U.dist(h.visibility[i]), s: visNote(h.visibility[i]) },
    { k: '☁️ Cloud cover', v: Math.round(c.cloud_cover) + '%', s: `Low ${h.cloud_cover_low[i]}% · Mid ${h.cloud_cover_mid[i]}% · High ${h.cloud_cover_high[i]}%` },
    { k: '☔ Rain chance', v: (h.precipitation_probability[i] ?? '--') + '%', s: `Today up to ${d.precipitation_probability_max[di] ?? '--'}% · ${U.precip(d.precipitation_sum[di])}` },
    { k: '⛈️ Storm energy', v: ok(cape) ? Math.round(cape) + '<small>J/kg</small>' : '--', s: `CAPE · ${capeLevel(cape)}${ok(h.lifted_index[i]) ? ` · LI ${h.lifted_index[i].toFixed(1)}` : ''}` },
    { k: '🥵 Wet-bulb', v: U.t(wb), s: wbNote(wb) },
    { k: '🔆 Solar radiation', v: ok(h.shortwave_radiation[i]) ? Math.round(h.shortwave_radiation[i]) + '<small>W/m²</small>' : '--', s: `Sunshine today ${ok(d.sunshine_duration[di]) ? (d.sunshine_duration[di] / 3600).toFixed(1) : '--'} h` },
    { k: '🧊 Freezing level', v: U.height(h.freezing_level_height[i]), s: 'Altitude of the 0 °C line' },
    { k: '❄️ Snow', v: U.snow((d.snowfall_sum[di] || 0)), s: `Snowfall today · depth on ground ${ok(h.snow_depth[i]) ? U.snow(h.snow_depth[i] * 100) : '--'}` },
    { k: '🌱 Evapotranspiration', v: U.precip(d.et0_fao_evapotranspiration[di]), s: `Reference ET₀ today · VPD ${ok(h.vapour_pressure_deficit[i]) ? h.vapour_pressure_deficit[i].toFixed(2) : '--'} kPa` },
    { k: '🪴 Soil (surface)', v: U.t(h.soil_temperature_0cm[i]), s: `Moisture ${ok(h.soil_moisture_0_to_1cm[i]) ? Math.round(h.soil_moisture_0_to_1cm[i] * 100) : '--'}% vol` },
    { k: '🌗 Daylight', v: fmtDur(d.daylight_duration[di]), s: `${d.sunrise[di] ? hm(d.sunrise[di]) : '--'} – ${d.sunset[di] ? hm(d.sunset[di]) : '--'} · ${daylightDelta(d, di)}` },
  ];
  $('#details').innerHTML = tiles.map((t) => `
    <div class="tile"><div class="tile-k">${t.k}</div><div class="tile-v num">${t.v}</div>
    ${t.arrow != null ? `<div class="tile-arrow" style="transform:rotate(${t.arrow + 180}deg)">↑</div>` : ''}
    ${t.meter ? `<div class="meter"><i style="width:${t.meter[0] * 100}%;background:${t.meter[1]}"></i></div>` : ''}
    <div class="tile-s">${t.s}</div></div>`).join('');

  renderAQMini();
}

function daySummary(wx) {
  const h = wx.hourly, d = wx.daily, i = hourIdx(wx), di = todayIdx(wx), parts = [];
  const yi = di - 1;
  if (yi >= 0 && ok(d.temperature_2m_max[yi])) {
    const diff = d.temperature_2m_max[di] - d.temperature_2m_max[yi];
    const dd = Math.abs(Math.round(S.temp === 'F' ? diff * 9 / 5 : diff));
    parts.push(dd < 1 ? 'Similar temperatures to yesterday.' : `Today is ${dd}° ${diff > 0 ? 'warmer' : 'cooler'} than yesterday.`);
  }
  // next 12 h: rain, wind, temp trend
  const end = Math.min(i + 12, h.time.length);
  let rainAt = -1, gustMax = 0, gustAt = i;
  for (let k = i; k < end; k++) {
    if (rainAt < 0 && (h.precipitation_probability[k] >= 50 || h.precipitation[k] >= 0.5)) rainAt = k;
    if (h.wind_gusts_10m[k] > gustMax) { gustMax = h.wind_gusts_10m[k]; gustAt = k; }
  }
  if (rainAt === i) parts.push('Precipitation likely now.');
  else if (rainAt > i) parts.push(`${wmo(h.weather_code[rainAt]).text} likely from about ${hm(h.time[rainAt])}.`);
  else parts.push('Dry for the next 12 hours.');
  if (gustMax >= 50) parts.push(`Gusts up to ${U.wind(gustMax)} around ${hm(h.time[gustAt])}.`);
  const nd = di + 1;
  if (d.time[nd]) parts.push(`Tomorrow: ${wmo(d.weather_code[nd]).text.toLowerCase()}, ${U.t(d.temperature_2m_min[nd])} to ${U.t(d.temperature_2m_max[nd])}.`);
  return parts.join(' ');
}
function wetBulb(T, RH) {
  if (!ok(T) || !ok(RH)) return NaN;
  return T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) + Math.atan(T + RH) - Math.atan(RH - 1.676331) + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035;
}
const wbNote = (w) => (!ok(w) ? '' : w >= 31 ? '⚠️ Dangerous heat stress' : w >= 28 ? 'High heat stress — limit exertion' : w >= 24 ? 'Moderate heat stress' : 'Low heat stress');
function feelsNote(c) {
  const diff = c.apparent_temperature - c.temperature_2m;
  if (Math.abs(diff) < 1.5) return 'Similar to the actual temperature';
  if (diff > 0) return c.relative_humidity_2m > 60 ? 'Humidity makes it feel warmer' : 'Sun and light wind make it feel warmer';
  return c.wind_speed_10m > 15 ? 'Wind makes it feel colder' : 'Feels colder than actual';
}
const dewComfort = (dp) => (!ok(dp) ? '' : dp < 10 ? 'Dry' : dp < 16 ? 'Comfortable' : dp < 21 ? 'Sticky' : dp < 24 ? 'Muggy' : 'Oppressive');
function uvLevel(u) {
  if (!ok(u)) return ['--', '#888'];
  if (u < 3) return ['Low', '#0ca30c'];
  if (u < 6) return ['Moderate', '#fab219'];
  if (u < 8) return ['High', '#ec835a'];
  if (u < 11) return ['Very high', '#d03b3b'];
  return ['Extreme', '#9b3fb0'];
}
const capeLevel = (c) => (!ok(c) ? '--' : c < 300 ? 'Stable' : c < 1000 ? 'Marginal' : c < 2500 ? 'Moderate' : c < 3500 ? 'High' : 'Extreme');
const visNote = (v) => (!ok(v) ? '' : v < 1000 ? 'Fog — very poor' : v < 4000 ? 'Poor (mist/haze)' : v < 10000 ? 'Moderate' : 'Clear view');
const beaufortName = (b) => ['Calm', 'Light air', 'Light breeze', 'Gentle breeze', 'Moderate breeze', 'Fresh breeze', 'Strong breeze', 'Near gale', 'Gale', 'Strong gale', 'Storm', 'Violent storm', 'Hurricane force'][b];
function daylightDelta(d, di) {
  if (di < 1 || !ok(d.daylight_duration[di - 1])) return '';
  const s = Math.round(d.daylight_duration[di] - d.daylight_duration[di - 1]);
  return `${s >= 0 ? '+' : '−'}${Math.floor(Math.abs(s) / 60)}m ${Math.abs(s) % 60}s vs yesterday`;
}

// ── Alerts: official (NWS, US) + derived from the forecast ────────
function computeAlerts() {
  const wx = state.wx, h = wx.hourly, d = wx.daily, i = hourIdx(wx), di = todayIdx(wx), out = [];
  const end = Math.min(i + 24, h.time.length);
  const max = (key) => { let m = -Infinity, at = i; for (let k = i; k < end; k++) if (h[key][k] > m) { m = h[key][k]; at = k; } return [m, at]; };
  const min = (key) => { let m = Infinity, at = i; for (let k = i; k < end; k++) if (h[key][k] < m) { m = h[key][k]; at = k; } return [m, at]; };
  const when = (k) => (k === i ? 'now' : `around ${dayName(h.time[k])} ${hm(h.time[k])}`);

  let storm = -1;
  for (let k = i; k < end; k++) if (h.weather_code[k] >= 95 || (h.cape[k] > 1500 && h.precipitation[k] > 1)) { storm = k; break; }
  if (storm >= 0) out.push({ sev: h.weather_code[storm] >= 96 ? 'critical' : 'serious', icon: '⛈️', t: 'Thunderstorms possible', d: `Storm risk ${when(storm)}. Lightning, downpours${h.weather_code[storm] >= 96 ? ' and hail' : ''} possible. Stay indoors when thunder roars.` });
  const [gust, ga] = max('wind_gusts_10m');
  if (gust >= 90) out.push({ sev: 'critical', icon: '🌪️', t: 'Damaging wind gusts', d: `Gusts to ${U.wind(gust)} ${when(ga)}. Secure loose objects and avoid travel if possible.` });
  else if (gust >= 60) out.push({ sev: 'warning', icon: '💨', t: 'Strong wind gusts', d: `Gusts to ${U.wind(gust)} ${when(ga)}.` });
  const [rain1h, ra] = max('precipitation');
  const rain24 = h.precipitation.slice(i, end).reduce((a, b) => a + (b || 0), 0);
  if (rain1h >= 15 || rain24 >= 64) out.push({ sev: 'critical', icon: '🌊', t: 'Very heavy rain — flooding risk', d: `${U.precip(rain24)} expected in 24 h, peak ${U.precip(rain1h)}/h ${when(ra)}.` });
  else if (rain1h >= 7.5 || rain24 >= 30) out.push({ sev: 'warning', icon: '🌧️', t: 'Heavy rain', d: `${U.precip(rain24)} expected in 24 h, peak ${U.precip(rain1h)}/h ${when(ra)}.` });
  const snow24 = h.snowfall.slice(i, end).reduce((a, b) => a + (b || 0), 0);
  if (snow24 >= 5) out.push({ sev: snow24 >= 15 ? 'serious' : 'warning', icon: '❄️', t: 'Snowfall', d: `${U.snow(snow24)} of snow expected in the next 24 h.` });
  if (h.weather_code.slice(i, end).some((c) => c === 56 || c === 57 || c === 66 || c === 67)) out.push({ sev: 'serious', icon: '🧊', t: 'Freezing rain / ice', d: 'Freezing precipitation expected — roads and paths may be icy.' });
  const [heat, ha] = max('apparent_temperature');
  if (heat >= 46) out.push({ sev: 'critical', icon: '🥵', t: 'Extreme heat', d: `Feels like ${U.t(heat)} ${when(ha)}. Avoid sun exposure, drink water, check on vulnerable people.` });
  else if (heat >= 40) out.push({ sev: 'serious', icon: '🥵', t: 'Heat warning', d: `Feels like ${U.t(heat)} ${when(ha)}. Limit outdoor exertion.` });
  const [cold, ca] = min('apparent_temperature');
  if (cold <= -25) out.push({ sev: 'critical', icon: '🥶', t: 'Extreme cold', d: `Wind chill ${U.t(cold)} ${when(ca)}. Frostbite possible within minutes.` });
  else if (cold <= -10) out.push({ sev: 'warning', icon: '🥶', t: 'Cold wind chill', d: `Feels like ${U.t(cold)} ${when(ca)}.` });
  else {
    const [tmin, ta] = min('temperature_2m');
    if (tmin <= 0 && tmin > -10) out.push({ sev: 'info', icon: '🌡️', t: 'Frost possible', d: `Low of ${U.t(tmin)} ${when(ta)}. Protect plants and watch for ice.` });
  }
  const [vis, va] = min('visibility');
  if (vis < 1000) out.push({ sev: vis < 200 ? 'serious' : 'warning', icon: '🌫️', t: 'Fog / low visibility', d: `Visibility down to ${U.dist(vis)} ${when(va)}. Drive with care.` });
  if (d.uv_index_max[di] >= 8) out.push({ sev: d.uv_index_max[di] >= 11 ? 'serious' : 'warning', icon: '🕶️', t: `${uvLevel(d.uv_index_max[di])[0]} UV today`, d: `UV index up to ${d.uv_index_max[di].toFixed(1)}. Use SPF 30+, sunglasses and shade around midday.` });
  const aqi = state.aq && state.aq.current && state.aq.current.us_aqi;
  if (aqi > 150) out.push({ sev: aqi > 200 ? 'critical' : 'serious', icon: '😷', t: 'Unhealthy air quality', d: `US AQI ${Math.round(aqi)}. Reduce outdoor activity; consider a mask (N95).` });
  return out;
}
function renderAlerts() {
  const derived = computeAlerts();
  const official = ((state.nws && state.nws.features) || []).map((f) => f.properties).map((p) => ({
    sev: /extreme/i.test(p.severity) ? 'critical' : /severe/i.test(p.severity) ? 'serious' : 'warning',
    icon: '🏛️', t: p.event, d: p.headline || '', more: p.description, src: 'Official · National Weather Service',
  }));
  const all = official.concat(derived);
  $('#alerts').innerHTML = all.map((a) => `
    <div class="alert ${a.sev}"><div class="alert-i">${a.icon}</div><div style="min-width:0">
      <div class="alert-sev">${a.src || 'Forecast-based'} · ${{ critical: 'Critical', serious: 'Severe', warning: 'Caution', info: 'Advisory' }[a.sev]}</div>
      <div class="alert-t">${esc(a.t)}</div><div class="alert-d">${esc(a.d)}</div>
      ${a.more ? `<details><summary>Full text</summary><p>${esc(a.more)}</p></details>` : ''}
    </div></div>`).join('');
}

// ── Nowcast (15-minute precipitation) ─────────────────
function renderNowcast() {
  const el = $('#nowcast'), m = state.mins && state.mins.minutely_15;
  if (!m) { el.innerHTML = '<div class="muted" style="font-size:.85rem">Short-term precipitation is loading or unavailable here.</div>'; return; }
  const now = locNow(state.mins);
  let s = m.time.findIndex((t) => t > now);
  s = Math.max(0, s - 1);
  const t = m.time.slice(s, s + 12), p = m.precipitation.slice(s, s + 12).map((x) => x || 0), temps = m.temperature_2m.slice(s, s + 12);
  const kind = (k) => (temps[k] != null && temps[k] < 1 ? 'Snow' : 'Rain');
  const wet = p.map((x) => x >= 0.05);
  let text;
  if (!wet.some(Boolean)) text = '☀️ No precipitation expected in the next 3 hours.';
  else if (wet[0]) {
    const stop = wet.indexOf(false);
    text = stop < 0 ? `🌧️ ${kind(0)} continuing for the next 3 hours.` : `🌦️ ${kind(0)} easing in about ${stop * 15} min.`;
  } else {
    const start = wet.indexOf(true);
    text = `🌂 ${kind(start)} starting in about ${start * 15} min (${hm(t[start])}).`;
  }
  if (!wet.some(Boolean)) { el.innerHTML = `<div class="nowcast-text" style="margin:0">${text}</div>`; return; }
  const mx = Math.max(0.1, ...p);
  el.innerHTML = `<div class="nowcast-text">${text}</div>
    <div class="nowcast-bars">${p.map((x, k) => `<div class="nc-bar${x < 0.05 ? ' zero' : ''}" title="${hm(t[k])}: ${U.precip(x)}" style="height:${x < 0.05 ? 2 : Math.max(8, (x / mx) * 100)}%"></div>`).join('')}</div>
    <div class="nowcast-axis"><span>${hm(t[0])}</span><span>${t[3] ? hm(t[3]) : ''}</span><span>${t[6] ? hm(t[6]) : ''}</span><span style="text-align:right">${t[9] ? hm(t[9]) : ''}</span></div>
    <div class="card-note">Bar height = precipitation in each 15 minutes (tallest ${U.precip(mx)}).</div>`;
}

// ── AQI ───────────────────────────────────────────────
const US_AQI = [[50, 'Good', '#00e400', 'Air quality is satisfactory.'], [100, 'Moderate', '#ffff00', 'Unusually sensitive people should limit long outdoor exertion.'],
  [150, 'Unhealthy for sensitive groups', '#ff7e00', 'Children, older adults and people with heart or lung disease should reduce exertion.'],
  [200, 'Unhealthy', '#ff0000', 'Everyone should reduce prolonged outdoor exertion.'], [300, 'Very unhealthy', '#8f3f97', 'Avoid outdoor activity; keep windows closed.'],
  [9999, 'Hazardous', '#7e0023', 'Health emergency — stay indoors.']];
const EU_AQI = [[20, 'Good', '#50f0e6', 'Enjoy your usual outdoor activities.'], [40, 'Fair', '#50ccaa', 'Enjoy your usual outdoor activities.'],
  [60, 'Moderate', '#f0e641', 'Sensitive people should consider reducing intense outdoor activity.'], [80, 'Poor', '#ff5050', 'Consider reducing intense outdoor activity.'],
  [100, 'Very poor', '#960032', 'Reduce outdoor activity.'], [9999, 'Extremely poor', '#7d2181', 'Avoid outdoor activity.']];
function aqiInfo(v) {
  const tbl = S.aqi === 'eu' ? EU_AQI : US_AQI;
  const r = tbl.find((x) => v <= x[0]) || tbl[tbl.length - 1];
  return { cat: r[1], color: r[2], adv: r[3], pos: S.aqi === 'eu' ? Math.min(1, v / 120) : Math.min(1, v / 300) };
}
function aqiInfoFor(v, std) { const keep = S.aqi; S.aqi = std; const r = aqiInfo(v); S.aqi = keep; return r; }
function renderAQMini() {
  const el = $('#aq-mini'), c = state.aq && state.aq.current;
  if (!c) { el.innerHTML = '<div class="card-h"><span class="card-t">Air quality</span></div><div class="muted" style="font-size:.85rem">Loading…</div>'; return; }
  const v = S.aqi === 'eu' ? c.european_aqi : c.us_aqi, a = aqiInfo(v);
  el.innerHTML = `<div class="card-h"><span class="card-t">Air quality · ${S.aqi === 'eu' ? 'European' : 'US'} AQI</span><button class="link-btn" data-goto="sky">Details ›</button></div>
    <div class="aqi-top"><div class="aqi-ring" style="border:6px solid ${a.color}"><span class="v num">${ok(v) ? Math.round(v) : '--'}</span></div>
    <div><div class="aqi-cat">${a.cat}</div><div class="aqi-adv">${a.adv}</div><div class="aqi-adv">PM2.5 ${fmtUg(c.pm2_5)} · PM10 ${fmtUg(c.pm10)}</div></div></div>`;
}
const fmtUg = (v) => (ok(v) ? (v < 10 ? v.toFixed(1) : Math.round(v)) + ' µg/m³' : '--');

// ── Render: Forecast tab ──────────────────────────────
const HOUR_METRICS = [
  { id: 'temp', label: 'Temperature' }, { id: 'rain', label: 'Rain' }, { id: 'wind', label: 'Wind' }, { id: 'hum', label: 'Humidity' },
  { id: 'pres', label: 'Pressure' }, { id: 'cloud', label: 'Clouds' }, { id: 'uv', label: 'UV' }, { id: 'vis', label: 'Visibility' },
];
const hourHidden = new Set();
function hourSeries(m, h, s, e) {
  const sl = (k, f = (x) => x) => h[k].slice(s, e).map((x) => (x == null ? null : f(x)));
  switch (m) {
    case 'temp': return { series: [{ name: 'Temperature', color: '#3987e5', values: sl('temperature_2m', U.tNum) }, { name: 'Feels like', color: '#d95926', values: sl('apparent_temperature', U.tNum), dash: [5, 4] }, { name: 'Dew point', color: '#199e70', values: sl('dew_point_2m', U.tNum) }], fmt: (v) => Math.round(v) + '°' };
    case 'rain': return { series: [{ name: 'Chance of rain', color: '#3987e5', values: sl('precipitation_probability'), type: 'bar' }], fmt: (v) => Math.round(v) + '%', yMax: 100, zeroBase: true, extra: true };
    case 'wind': return { series: [{ name: 'Wind', color: '#3987e5', values: sl('wind_speed_10m', U.windNum) }, { name: 'Gusts', color: '#d95926', values: sl('wind_gusts_10m', U.windNum) }], fmt: (v) => Math.round(v) + ' ' + U.windUnit(), zeroBase: true };
    case 'hum': return { series: [{ name: 'Relative humidity', color: '#3987e5', values: sl('relative_humidity_2m') }], fmt: (v) => Math.round(v) + '%', zeroBase: true, yMax: 100 };
    case 'pres': return { series: [{ name: 'Sea-level pressure', color: '#3987e5', values: sl('pressure_msl', U.presNum) }], fmt: (v) => (S.pressure === 'inHg' ? v.toFixed(2) : Math.round(v)) + ' ' + S.pressure };
    case 'cloud': return { series: [{ name: 'Low', color: '#3987e5', values: sl('cloud_cover_low') }, { name: 'Mid', color: '#d95926', values: sl('cloud_cover_mid') }, { name: 'High', color: '#199e70', values: sl('cloud_cover_high') }], fmt: (v) => Math.round(v) + '%', zeroBase: true, yMax: 100 };
    case 'uv': return { series: [{ name: 'UV index', color: '#3987e5', values: sl('uv_index'), type: 'bar', colors: sl('uv_index').map((u) => uvLevel(u)[1]) }], fmt: (v) => v.toFixed(1), zeroBase: true, yMax: 8 };
    case 'vis': return { series: [{ name: 'Visibility', color: '#3987e5', values: sl('visibility', (x) => (S.dist === 'mi' ? x / 1609.34 : x / 1000)) }], fmt: (v) => v.toFixed(1) + (S.dist === 'mi' ? ' mi' : ' km'), zeroBase: true };
  }
}
function renderHourChart() {
  const wx = state.wx, h = wx.hourly, s = hourIdx(wx), e = Math.min(s + 72, h.time.length);
  const cfg = hourSeries(state.hourMetric, h, s, e);
  if (cfg.extra) {
    // rain: show amount in the tooltip via a hidden-value series (same unit axis would mix % and mm, so amount is tooltip-only)
    const amt = h.precipitation.slice(s, e);
    cfg.tipFmt = (v, ser) => `${Math.round(v)}%`;
    cfg.labels = h.time.slice(s, e).map((t, k) => `${dayName(t)} ${hm(t)} · ${U.precip(amt[k])}`);
  }
  const times = h.time.slice(s, e);
  const dayBreaks = [];
  times.forEach((t, k) => { if (k > 0 && t.slice(11, 13) === '00') dayBreaks.push(k); });
  $('#hour-legend').innerHTML = cfg.series.length > 1
    ? cfg.series.map((x) => `<button class="${hourHidden.has(x.name) ? 'off' : ''}" data-s="${x.name}"><i style="background:${x.color}"></i>${x.name}</button>`).join('')
    : `<span>${cfg.series[0].name}${state.hourMetric === 'rain' ? ' · tap a bar for the amount' : ''}</span>`;
  Charts.mount({
    canvas: $('#hour-chart'), scrollEl: $('#hour-scroll'), tipEl: $('#hour-tip'), n: times.length, colWidth: 22, height: 200,
    series: cfg.series, hidden: hourHidden, zeroBase: cfg.zeroBase, yMax: cfg.yMax,
    labels: cfg.labels || times.map((t) => `${dayName(t)} ${hm(t)}`),
    xLabel: (k) => (times[k].slice(11, 13) === '00' ? dayName(times[k]) : +times[k].slice(11, 13) % 3 === 0 ? hourLabel(times[k]) : null),
    dayBreaks, yFmt: (v) => (Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)), tipFmt: cfg.tipFmt || cfg.fmt,
  });
}
function renderForecast() {
  $('#hour-metrics').innerHTML = HOUR_METRICS.map((m) => `<button class="chip${m.id === state.hourMetric ? ' active' : ''}" data-hm="${m.id}">${m.label}</button>`).join('');
  if (state.tab === 'forecast') renderHourChart();

  const d = state.wx.daily, di = todayIdx(state.wx);
  const idx = []; for (let k = di; k < d.time.length; k++) idx.push(k);
  const lo = Math.min(...idx.map((k) => d.temperature_2m_min[k]).filter(ok)), hi = Math.max(...idx.map((k) => d.temperature_2m_max[k]).filter(ok));
  const pos = (v) => ((v - lo) / (hi - lo || 1)) * 100;
  const tempColor = (v) => (v < 0 ? '#7fb8ff' : v < 10 ? '#45c4b0' : v < 20 ? '#a6d84b' : v < 28 ? '#f2d24a' : v < 35 ? '#f5a33a' : '#e8633a');
  const conf = confidenceByDay();
  const nowT = state.wx.current.temperature_2m;
  $('#daily').innerHTML = idx.map((k) => {
    const w = wmo(d.weather_code[k]), mn = d.temperature_2m_min[k], mx = d.temperature_2m_max[k];
    const cf = conf[d.time[k]];
    return `<div class="day"><button class="day-row" data-day="${k}">
      <span class="day-name">${k === di ? 'Today' : dayName(d.time[k])}<small>${dayDate(d.time[k])}${cf ? ` <span class="conf ${cf[0]}">${cf[1]}</span>` : ''}</small></span>
      <span class="day-ic">${w.icon}</span>
      <span class="day-pp">${d.precipitation_probability_max[k] >= 10 ? '💧' + d.precipitation_probability_max[k] + '%' : ''}</span>
      <span class="day-lo num">${U.t(mn)}</span>
      <span class="range"><i style="left:${pos(mn)}%;right:${100 - pos(mx)}%;background:linear-gradient(90deg,${tempColor(mn)},${tempColor(mx)})"></i>${k === di && ok(nowT) ? `<b style="left:${pos(nowT)}%"></b>` : ''}</span>
      <span class="day-hi num">${U.t(mx)}</span></button>
      <div class="day-more">
        <div>Conditions <b>${w.text}</b></div><div>Feels <b>${U.t(d.apparent_temperature_min[k])} / ${U.t(d.apparent_temperature_max[k])}</b></div>
        <div>Precipitation <b>${U.precip(d.precipitation_sum[k])}</b></div><div>Rain hours <b>${ok(d.precipitation_hours[k]) ? d.precipitation_hours[k] : '--'} h</b></div>
        <div>Wind max <b>${U.wind(d.wind_speed_10m_max[k])} ${ok(d.wind_direction_10m_dominant[k]) ? U.compass(d.wind_direction_10m_dominant[k]) : ''}</b></div><div>Gusts <b>${U.wind(d.wind_gusts_10m_max[k])}</b></div>
        <div>UV max <b>${ok(d.uv_index_max[k]) ? d.uv_index_max[k].toFixed(1) : '--'}</b></div><div>Snowfall <b>${U.snow(d.snowfall_sum[k])}</b></div>
        <div>Sunrise <b>${d.sunrise[k] ? hm(d.sunrise[k]) : '--'}</b></div><div>Sunset <b>${d.sunset[k] ? hm(d.sunset[k]) : '--'}</b></div>
        <div>Sunshine <b>${ok(d.sunshine_duration[k]) ? (d.sunshine_duration[k] / 3600).toFixed(1) : '--'} h</b></div><div>Solar energy <b>${ok(d.shortwave_radiation_sum[k]) ? d.shortwave_radiation_sum[k].toFixed(1) : '--'} MJ/m²</b></div>
      </div></div>`;
  }).join('');
  if (state.models) renderModels();
}

// ── Model comparison ──────────────────────────────────
async function loadModels() {
  const body = $('#models-body');
  body.innerHTML = '<div class="muted" style="padding:16px 0">Loading 7 forecast models…</div>';
  const p = state.place;
  const fetchSet = (list) => getJSON(`https://api.open-meteo.com/v1/forecast?${ll(p)}&hourly=temperature_2m,precipitation,wind_speed_10m&models=${list.map((m) => m[0]).join(',')}&forecast_days=7&timezone=auto`, 25000);
  try {
    let list = MODELS, j;
    try { j = await fetchSet(list); } catch (e) { list = MODELS.slice(0, 3); j = await fetchSet(list); }
    state.models = { j, list: list.filter((m) => j.hourly['temperature_2m_' + m[0]] && j.hourly['temperature_2m_' + m[0]].some(ok)) };
    renderModels();
    renderForecast();
  } catch (e) {
    body.innerHTML = `<div class="err" style="padding:12px 0">Couldn’t load model data (${esc(e.message)}).</div><button class="pill-btn" id="models-load">Try again</button>`;
  }
}
const modelHidden = new Set();
function renderModels() {
  const { j, list } = state.models, h = j.hourly, body = $('#models-body'), m = state.modelMetric;
  const key = m === 'temp' ? 'temperature_2m_' : m === 'precip' ? 'precipitation_' : 'wind_speed_10m_';
  const conv = m === 'temp' ? U.tNum : m === 'precip' ? (x) => (S.precip === 'in' ? x / 25.4 : x) : U.windNum;
  const fmt = m === 'temp' ? (v) => v.toFixed(1) + '°' : m === 'precip' ? (v) => (S.precip === 'in' ? v.toFixed(2) + ' in' : v.toFixed(1) + ' mm') : (v) => Math.round(v) + ' ' + U.windUnit();
  const nowS = locNow(j).slice(0, 13);
  let s = h.time.findIndex((t) => t.slice(0, 13) === nowS); if (s < 0) s = 0;
  const times = h.time.slice(s);
  const dayBreaks = []; times.forEach((t, k) => { if (k > 0 && t.slice(11, 13) === '00') dayBreaks.push(k); });
  const series = list.map(([id, name, color]) => ({ name, color, values: h[key + id].slice(s).map((x) => (x == null ? null : conv(x))), type: 'line' }));
  const spread = modelSpreadText(list, h, s);
  body.innerHTML = `<div class="legend" id="model-legend">${series.map((x) => `<button class="${modelHidden.has(x.name) ? 'off' : ''}" data-ms="${x.name}"><i style="background:${x.color}"></i>${x.name}</button>`).join('')}</div>
    <div class="chart-wrap"><div class="chart-scroll" id="model-scroll"><canvas id="model-chart"></canvas></div><div class="tooltip" id="model-tip"></div></div>
    <div class="card-note">${spread} Confidence badges on the 16-day list come from how closely the models agree on each day’s high.</div>`;
  Charts.mount({
    canvas: $('#model-chart'), scrollEl: $('#model-scroll'), tipEl: $('#model-tip'), n: times.length, colWidth: 7, height: 210,
    series, hidden: modelHidden, zeroBase: m !== 'temp', labels: times.map((t) => `${dayName(t)} ${hm(t)}`),
    xLabel: (k) => (times[k].slice(11, 13) === '12' ? dayName(times[k]) : null), dayBreaks,
    yFmt: (v) => (Number.isInteger(v) ? v : v.toFixed(1)), tipFmt: fmt,
  });
}
function modelSpreadText(list, h, s) {
  const e = Math.min(s + 72, h.time.length);
  let tot = 0, n = 0;
  for (let k = s; k < e; k++) {
    const vals = list.map((m) => h['temperature_2m_' + m[0]][k]).filter(ok);
    if (vals.length > 1) { tot += Math.max(...vals) - Math.min(...vals); n++; }
  }
  if (!n) return '';
  const avg = tot / n * (S.temp === 'F' ? 1.8 : 1);
  return `Over the next 3 days the models’ temperatures differ by ${avg.toFixed(1)}° on average — ${avg < 2 ? 'high agreement, high confidence' : avg < 4 ? 'moderate agreement' : 'low agreement, expect changes'}.`;
}
function confidenceByDay() {
  if (!state.models) return {};
  const { j, list } = state.models, h = j.hourly, out = {};
  const days = {};
  h.time.forEach((t, k) => {
    const d = t.slice(0, 10);
    list.forEach((m) => { const v = h['temperature_2m_' + m[0]][k]; if (!ok(v)) return; days[d] = days[d] || {}; days[d][m[0]] = Math.max(days[d][m[0]] ?? -99, v); });
  });
  Object.entries(days).forEach(([d, byM]) => {
    const v = Object.values(byM);
    if (v.length < 2) return;
    const sd = Math.sqrt(v.reduce((a, x) => a + (x - v.reduce((p, q) => p + q, 0) / v.length) ** 2, 0) / v.length);
    out[d] = sd < 1 ? ['h', 'High conf.'] : sd < 2 ? ['m', 'Med conf.'] : ['l', 'Low conf.'];
  });
  return out;
}

// ── Render: Air & Sky tab ─────────────────────────────
const POLLUTANTS = [
  ['pm2_5', 'PM2.5', 15], ['pm10', 'PM10', 45], ['nitrogen_dioxide', 'NO₂', 25], ['ozone', 'O₃', 100], ['sulphur_dioxide', 'SO₂', 40], ['carbon_monoxide', 'CO', 4000], ['dust', 'Dust', 50],
];
function renderSky() {
  renderAQ();
  renderPollen();
  renderSun();
  renderMoon();
  renderMarine();
  renderActivities();
}
function renderAQ() {
  const el = $('#aq-card'), aq = state.aq;
  if (!aq || !aq.current) { el.innerHTML = '<div class="card-t">Air quality</div><div class="muted" style="margin-top:8px">Air-quality data is loading or unavailable.</div>'; $('#aq-chart-card').classList.add('hidden'); return; }
  const c = aq.current, v = S.aqi === 'eu' ? c.european_aqi : c.us_aqi, a = aqiInfo(v);
  el.innerHTML = `<div class="card-h"><span class="card-t">Air quality</span>
      <div class="seg" id="aqi-std"><button data-a="us" class="${S.aqi === 'us' ? 'active' : ''}">US AQI</button><button data-a="eu" class="${S.aqi === 'eu' ? 'active' : ''}">EU AQI</button></div></div>
    <div class="aqi-top"><div class="aqi-ring" style="border:7px solid ${a.color}"><span class="v num">${ok(v) ? Math.round(v) : '--'}</span></div>
      <div><div class="aqi-cat">${a.cat}</div><div class="aqi-adv">${a.adv}</div></div></div>
    <div class="aqi-scale" style="${S.aqi === 'eu' ? 'background:linear-gradient(90deg,#50f0e6 0 16.6%,#50ccaa 16.6% 33.3%,#f0e641 33.3% 50%,#ff5050 50% 66.6%,#960032 66.6% 83.3%,#7d2181 83.3%)' : ''}"><b style="left:${a.pos * 100}%"></b></div>
    <div style="margin-top:12px">${POLLUTANTS.map(([k, n, lim]) => {
      const x = c[k]; if (!ok(x)) return '';
      const r = x / lim, col = r <= 0.5 ? '#0ca30c' : r <= 1 ? '#fab219' : r <= 2 ? '#ec835a' : '#d03b3b';
      return `<div class="pol"><span class="pn">${n}</span><div class="meter"><i style="width:${Math.min(100, r * 50)}%;background:${col}"></i></div><span class="pv">${fmtUg(x)}</span></div>`;
    }).join('')}</div>
    <div class="card-note">Bars compare each pollutant with the WHO 2021 guideline (the guideline sits at the bar’s midpoint). ${ok(c.aerosol_optical_depth) ? `Aerosol optical depth ${c.aerosol_optical_depth.toFixed(2)} (haze/smoke/dust indicator).` : ''} Source: CAMS via Open-Meteo.</div>`;

  // 4-day AQI bar chart, coloured by AQI category
  const h = aq.hourly, nowS = locNow(aq).slice(0, 13);
  let s = h.time.findIndex((t) => t.slice(0, 13) === nowS); if (s < 0) s = 0;
  const key = S.aqi === 'eu' ? 'european_aqi' : 'us_aqi', vals = h[key].slice(s), times = h.time.slice(s);
  const dayBreaks = []; times.forEach((t, k) => { if (k > 0 && t.slice(11, 13) === '00') dayBreaks.push(k); });
  $('#aq-chart-card').classList.remove('hidden');
  Charts.mount({
    canvas: $('#aq-chart'), scrollEl: $('#aq-scroll'), tipEl: $('#aq-tip'), n: vals.length, colWidth: 8, height: 160,
    series: [{ name: (S.aqi === 'eu' ? 'EU' : 'US') + ' AQI', color: '#3987e5', type: 'bar', values: vals, colors: vals.map((x) => (ok(x) ? aqiInfo(x).color : '#555')) }],
    zeroBase: true, labels: times.map((t, k) => `${dayName(t)} ${hm(t)} · ${ok(vals[k]) ? aqiInfo(vals[k]).cat : ''}`),
    xLabel: (k) => (times[k].slice(11, 13) === '12' ? dayName(times[k]) : null), dayBreaks, yFmt: (v) => Math.round(v), tipFmt: (v) => Math.round(v),
  });
}
const POLLEN = [['grass_pollen', 'Grass', '🌾'], ['birch_pollen', 'Birch', '🌳'], ['alder_pollen', 'Alder', '🌳'], ['olive_pollen', 'Olive', '🫒'], ['ragweed_pollen', 'Ragweed', '🌿'], ['mugwort_pollen', 'Mugwort', '🌿']];
function renderPollen() {
  const el = $('#pollen-card'), aq = state.aq;
  if (!aq || !aq.hourly) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const h = aq.hourly, nowS = locNow(aq).slice(0, 13);
  let s = h.time.findIndex((t) => t.slice(0, 13) === nowS); if (s < 0) s = 0;
  const rows = POLLEN.map(([k, n, ic]) => {
    const arr = h[k]; if (!arr) return null;
    const today = arr.slice(s, s + 24).filter(ok);
    if (!today.length) return null;
    const mx = Math.max(...today);
    const lvl = mx < 1 ? ['None', '#0ca30c', 0.02] : mx < 10 ? ['Low', '#0ca30c', 0.25] : mx < 50 ? ['Moderate', '#fab219', 0.5] : mx < 200 ? ['High', '#ec835a', 0.75] : ['Very high', '#d03b3b', 1];
    return `<div class="pol"><span class="pn">${ic} ${n}</span><div class="meter"><i style="width:${lvl[2] * 100}%;background:${lvl[1]}"></i></div><span class="pv">${lvl[0]} · ${Math.round(mx)}</span></div>`;
  }).filter(Boolean);
  el.innerHTML = `<div class="card-h"><span class="card-t">Pollen · next 24 h peak</span></div>` +
    (rows.length ? rows.join('') + '<div class="card-note">Grains per m³. Source: CAMS European pollen forecast.</div>'
      : '<div class="muted" style="font-size:.85rem">Pollen forecasts are only available for Europe.</div>');
}
function locDateFromStr(str, wx) { return new Date(Date.parse(str + ':00Z') - wx.utc_offset_seconds * 1000); }
function renderSun() {
  const wx = state.wx, p = state.place, el = $('#sun-card'), di = todayIdx(wx);
  const noon = locDateFromStr(wx.daily.time[di] + 'T12:00', wx);
  const t = Astro.sunTimes(noon, p.lat, p.lon);
  const f = (d) => (d && !isNaN(d) ? hm(localStr(d, wx)) : '—');
  const now = new Date(), alt = Astro.sunAltitude(now, p.lat, p.lon);
  // sun arc: x = time of day between sunrise and sunset, y = altitude
  let arc = '';
  if (t.sunrise && t.sunset && !isNaN(t.sunrise)) {
    const span = t.sunset - t.sunrise, frac = (now - t.sunrise) / span;
    const W = 320, H = 120, cx = (x) => 20 + x * (W - 40);
    const yAt = (x) => H - 18 - Math.sin(Math.PI * x) * (H - 36);
    const path = Array.from({ length: 41 }, (_, k) => `${k ? 'L' : 'M'}${cx(k / 40).toFixed(1)},${yAt(k / 40).toFixed(1)}`).join(' ');
    const fx = Math.max(0, Math.min(1, frac)), up = frac >= 0 && frac <= 1;
    arc = `<svg class="sun-arc" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sun position today">
      <line x1="10" x2="${W - 10}" y1="${H - 18}" y2="${H - 18}" stroke="rgba(255,255,255,.18)"/>
      <path d="${path}" fill="none" stroke="rgba(250,178,25,.35)" stroke-width="2" stroke-dasharray="4 4"/>
      ${up ? `<path d="${path.split(' ').slice(0, Math.max(2, Math.round(fx * 40) + 1)).join(' ')}" fill="none" stroke="#fab219" stroke-width="2"/>` : ''}
      <circle cx="${cx(fx)}" cy="${up ? yAt(fx) : H - 18}" r="8" fill="${up ? '#fab219' : '#5a6a88'}" stroke="#0f1c30" stroke-width="2"/>
      <text x="20" y="${H - 2}" fill="#8aa2c8" font-size="11">${f(t.sunrise)}</text>
      <text x="${W - 20}" y="${H - 2}" fill="#8aa2c8" font-size="11" text-anchor="end">${f(t.sunset)}</text>
      <text x="${W / 2}" y="14" fill="#8aa2c8" font-size="11" text-anchor="middle">Solar noon ${f(t.solarNoon)}</text></svg>`;
  } else arc = `<div class="muted" style="padding:10px 0">${alt > 0 ? 'Midnight sun — the sun does not set today.' : 'Polar night — the sun does not rise today.'}</div>`;
  el.innerHTML = `<div class="card-h"><span class="card-t">Sun</span><span class="muted" style="font-size:.75rem">Elevation now ${alt.toFixed(1)}°</span></div>${arc}
    <div class="kv">
      <div>First light <b>${f(t.dawn)}</b></div><div>Last light <b>${f(t.dusk)}</b></div>
      <div>Sunrise <b>${f(t.sunrise)}</b></div><div>Sunset <b>${f(t.sunset)}</b></div>
      <div>Golden hr AM <b>${t.sunrise ? f(t.sunrise) + '–' + f(t.goldenEndAM) : '—'}</b></div><div>Golden hr PM <b>${t.sunset ? f(t.goldenStartPM) + '–' + f(t.sunset) : '—'}</b></div>
      <div>Blue hr AM <b>${f(t.dawn)}–${f(t.sunrise)}</b></div><div>Blue hr PM <b>${f(t.sunset)}–${f(t.dusk)}</b></div>
      <div>Astro dark <b>${f(t.astroDusk)}</b></div><div>Daylight <b>${fmtDur(wx.daily.daylight_duration[di])}</b></div>
    </div>`;
}
function renderMoon() {
  const wx = state.wx, p = state.place, el = $('#moon-card'), now = new Date();
  const m = Astro.moonIllumination(now), [name, icon] = Astro.phaseName(m.phase);
  const startLocal = locDateFromStr(locNow(wx).slice(0, 10) + 'T00:00', wx);
  const rs = Astro.moonRiseSet(startLocal, p.lat, p.lon);
  const nf = Astro.nextPhase(now, 0.5), nn = Astro.nextPhase(now, 0);
  const f = (d) => (d ? hm(localStr(d, wx)) : '—');
  const fd = (d) => (d ? `${dayName(localStr(d, wx))} ${dayDate(localStr(d, wx))}` : '—');
  el.innerHTML = `<div class="card-h"><span class="card-t">Moon</span></div>
    <div class="moon-row"><div class="moon-ic">${icon}</div><div><div style="font-weight:700;font-size:1.05rem">${name}</div>
    <div class="muted" style="font-size:.85rem">${Math.round(m.fraction * 100)}% illuminated · ${Math.round(m.distance).toLocaleString()} km away</div></div></div>
    <div class="kv"><div>Moonrise <b>${f(rs.rise)}</b></div><div>Moonset <b>${f(rs.set)}</b></div>
    <div>Next full <b>${fd(nf)}</b></div><div>Next new <b>${fd(nn)}</b></div></div>`;
}
function renderMarine() {
  const el = $('#marine-card'), mr = state.marine, c = mr && mr.current;
  if (!c || !ok(c.wave_height)) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = `<div class="card-h"><span class="card-t">Marine · nearest sea</span></div>
    <div class="kv">
      <div>Wave height <b>${c.wave_height.toFixed(1)} m</b></div><div>Wave period <b>${ok(c.wave_period) ? c.wave_period.toFixed(0) + ' s' : '--'}</b></div>
      <div>Wave from <b>${ok(c.wave_direction) ? U.compass(c.wave_direction) : '--'}</b></div><div>Swell <b>${ok(c.swell_wave_height) ? c.swell_wave_height.toFixed(1) + ' m' : '--'}</b></div>
      <div>Swell period <b>${ok(c.swell_wave_period) ? c.swell_wave_period.toFixed(0) + ' s' : '--'}</b></div><div>Sea temp <b>${U.t(c.sea_surface_temperature)}</b></div>
      <div>Max waves (3 d) <b>${mr.daily && mr.daily.wave_height_max ? Math.max(...mr.daily.wave_height_max.filter(ok)).toFixed(1) + ' m' : '--'}</b></div>
      <div>Sea state <b>${seaState(c.wave_height)}</b></div>
    </div>`;
}
const seaState = (h) => (h < 0.1 ? 'Calm' : h < 0.5 ? 'Smooth' : h < 1.25 ? 'Slight' : h < 2.5 ? 'Moderate' : h < 4 ? 'Rough' : h < 6 ? 'Very rough' : 'High');

// Activity outlook — simple, transparent scoring from the next hours of forecast
function renderActivities() {
  const wx = state.wx, h = wx.hourly, i = hourIdx(wx), di = todayIdx(wx), d = wx.daily, el = $('#act-card');
  const win = (n) => { const r = []; for (let k = i; k < Math.min(i + n, h.time.length); k++) r.push(k); return r; };
  const avg = (key, ks) => ks.reduce((a, k) => a + (h[key][k] || 0), 0) / ks.length;
  const mx = (key, ks) => Math.max(...ks.map((k) => h[key][k] || 0));
  const aqi = state.aq && state.aq.current ? state.aq.current.us_aqi : 0;
  const k3 = win(3), k6 = win(6);
  const feel = avg('apparent_temperature', k3), rainP = mx('precipitation_probability', k3), wind = avg('wind_speed_10m', k3), gust = mx('wind_gusts_10m', k3), uv = mx('uv_index', k3);
  const clamp = (x) => Math.max(0, Math.min(10, Math.round(x)));
  const comfort = (t, lo, hi) => (t >= lo && t <= hi ? 0 : Math.min(6, Math.abs(t < lo ? lo - t : t - hi) / 3));
  const run = clamp(10 - comfort(feel, 8, 22) - rainP / 25 - Math.max(0, wind - 25) / 8 - (aqi > 100 ? (aqi - 100) / 25 : 0) - (uv >= 8 ? 1.5 : 0));
  const bike = clamp(10 - comfort(feel, 10, 25) - rainP / 22 - Math.max(0, wind - 15) / 5 - Math.max(0, gust - 40) / 10 - (aqi > 100 ? (aqi - 100) / 25 : 0));
  // stargazing: tonight around 22:00 local
  const tonight = h.time.findIndex((t, k) => k >= i && t.slice(11, 13) === '22');
  const moon = Astro.moonIllumination(new Date()).fraction;
  const cloudN = tonight >= 0 ? (h.cloud_cover[tonight] || 0) : 100;
  const star = clamp(10 - cloudN / 10 - moon * 4 - (tonight >= 0 && h.visibility[tonight] < 10000 ? 2 : 0));
  // laundry drying: daytime humidity, wind, rain, sunshine
  const dayKs = h.time.map((t, k) => k).filter((k) => h.time[k].slice(0, 10) === d.time[di] && +h.time[k].slice(11, 13) >= 9 && +h.time[k].slice(11, 13) <= 17);
  const dryRain = dayKs.length ? Math.max(...dayKs.map((k) => h.precipitation_probability[k] || 0)) : 100;
  const dryHum = dayKs.length ? avg('relative_humidity_2m', dayKs) : 90;
  const dryWind = dayKs.length ? avg('wind_speed_10m', dayKs) : 0;
  const laundry = clamp(10 - dryRain / 15 - Math.max(0, dryHum - 50) / 8 + Math.min(2, dryWind / 10) - ((d.sunshine_duration[di] || 0) < 3 * 3600 ? 1.5 : 0));
  const visMin = Math.min(...k6.map((k) => h.visibility[k] ?? 50000));
  const drive = clamp(10 - mx('precipitation', k6) * 1.2 - (visMin < 1000 ? 5 : visMin < 5000 ? 2 : 0) - mx('snowfall', k6) * 3 - Math.max(0, mx('wind_gusts_10m', k6) - 60) / 8 - (k6.some((k) => [56, 57, 66, 67].includes(h.weather_code[k])) ? 5 : 0));
  const bbq = clamp(10 - rainP / 18 - comfort(feel, 15, 30) - Math.max(0, wind - 20) / 6);
  const rows = [
    ['🏃', 'Running / walking', run, `Feels ${U.t(feel)}, rain ${Math.round(rainP)}%, wind ${U.wind(wind)}`],
    ['🚴', 'Cycling', bike, `Wind ${U.wind(wind)}, gusts ${U.wind(gust)}`],
    ['🔭', 'Stargazing tonight', star, `Clouds ${tonight >= 0 ? Math.round(cloudN) + '%' : '--'} at 10 pm, moon ${Math.round(moon * 100)}% lit`],
    ['👕', 'Drying laundry', laundry, `Daytime humidity ${Math.round(dryHum)}%, rain ${Math.round(dryRain)}%`],
    ['🚗', 'Driving', drive, `Visibility ≥ ${U.dist(visMin)}, next 6 h`],
    ['🍖', 'Picnic / BBQ', bbq, `Feels ${U.t(feel)}, rain ${Math.round(rainP)}%`],
  ];
  el.innerHTML = `<div class="card-h"><span class="card-t">Activity outlook</span></div>` + rows.map(([ic, n, sc, why]) => {
    const cls = sc >= 7 ? 'good' : sc >= 4 ? 'fair' : 'poor';
    return `<div class="act"><span class="ai">${ic}</span><div><div class="an">${n}</div><div class="ad">${why}</div></div><span class="as ${cls}">${sc}/10 ${cls === 'good' ? 'Good' : cls === 'fair' ? 'Fair' : 'Poor'}</span></div>`;
  }).join('');
}

// ── Places ────────────────────────────────────────────
const WORLD = [
  ['London', 'United Kingdom', 51.5074, -0.1278], ['New York', 'United States', 40.7128, -74.006], ['Tokyo', 'Japan', 35.6762, 139.6503],
  ['Dubai', 'United Arab Emirates', 25.2048, 55.2708], ['Singapore', 'Singapore', 1.3521, 103.8198], ['Sydney', 'Australia', -33.8688, 151.2093],
  ['Delhi', 'India', 28.6139, 77.209], ['Mumbai', 'India', 19.076, 72.8777], ['Paris', 'France', 48.8566, 2.3522],
  ['Los Angeles', 'United States', 34.0522, -118.2437], ['São Paulo', 'Brazil', -23.5505, -46.6333], ['Cairo', 'Egypt', 30.0444, 31.2357],
  ['Moscow', 'Russia', 55.7558, 37.6173], ['Beijing', 'China', 39.9042, 116.4074], ['Cape Town', 'South Africa', -33.9249, 18.4241], ['Reykjavík', 'Iceland', 64.1466, -21.9426],
].map(([name, country, lat, lon]) => ({ name, country, lat, lon }));

async function fillWeather(list, el) {
  if (!list.length) return;
  try {
    const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${list.map((p) => p.lat.toFixed(3)).join(',')}&longitude=${list.map((p) => p.lon.toFixed(3)).join(',')}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`);
    const arr = Array.isArray(j) ? j : [j];
    $$('.prow', el).forEach((row, k) => {
      const r = arr[k]; if (!r) return;
      const w = wmo(r.current.weather_code, r.current.is_day);
      const t = new Date(Date.now() + r.utc_offset_seconds * 1000).toISOString().slice(0, 16);
      $('.pw', row).innerHTML = `<span>${w.icon}</span>${U.t(r.current.temperature_2m)}`;
      $('.ps', row).textContent = `${row.dataset.sub} · ${hm(t)} · H ${U.t(r.daily.temperature_2m_max[0])} L ${U.t(r.daily.temperature_2m_min[0])}`;
    });
  } catch (e) { /* leave placeholders */ }
}
function placeRow(p, k, kind) {
  const sub = [p.admin, p.country].filter(Boolean).join(', ');
  return `<div class="prow${p.current ? ' current' : ''}" data-kind="${kind}" data-k="${k}" data-sub="${esc(sub)}" role="button">
    <div><div class="pn">${esc(p.name)}</div><div class="ps">${esc(sub)}</div></div>
    <div class="pw">…</div>
    ${kind === 'saved' ? `<button class="px" data-del="${k}" aria-label="Remove">✕</button>` : '<span></span>'}</div>`;
}
function renderPlaces() {
  const sv = $('#saved');
  sv.innerHTML = saved.length ? saved.map((p, k) => placeRow(p, k, 'saved')).join('')
    : '<div class="empty">No saved places yet. Search for a place or tap ☆ at the top to save the one you’re viewing.</div>';
  fillWeather(saved, sv);
  const wd = $('#world');
  if (!wd.dataset.done) { wd.innerHTML = WORLD.map((p, k) => placeRow(p, k, 'world')).join(''); fillWeather(WORLD, wd); wd.dataset.done = '1'; }
}
let searchTimer, searchResults = [];
function onSearch(q) {
  clearTimeout(searchTimer);
  const card = $('#results-card');
  if (q.trim().length < 2) { card.classList.add('hidden'); return; }
  searchTimer = setTimeout(async () => {
    try {
      const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=10&language=en&format=json`);
      searchResults = (j.results || []).map((r) => ({ name: r.name, admin: [r.admin2, r.admin1].filter(Boolean).filter((x, k, a) => a.indexOf(x) === k).join(', '), country: r.country || '', lat: r.latitude, lon: r.longitude }));
      card.classList.remove('hidden');
      $('#results').innerHTML = searchResults.length ? searchResults.map((p, k) => placeRow(p, k, 'result')).join('') : '<div class="empty">No places found.</div>';
      fillWeather(searchResults, $('#results'));
    } catch (e) { toast('Search failed — check your connection'); }
  }, 350);
}
function toggleSave() {
  const p = state.place; if (!p) return;
  const i = saved.findIndex((s) => near(s, p));
  if (i >= 0) { saved.splice(i, 1); toast('Removed from My places'); }
  else { saved.push({ name: p.name, admin: p.admin, country: p.country, lat: p.lat, lon: p.lon }); toast('Saved to My places'); }
  store.set('places', saved);
  renderHeader();
  if (state.tab === 'places') renderPlaces();
}

// ── Settings ──────────────────────────────────────────
const SETTINGS = [
  ['temp', 'Temperature', [['C', '°C'], ['F', '°F']]],
  ['wind', 'Wind speed', [['kmh', 'km/h'], ['mph', 'mph'], ['ms', 'm/s'], ['kn', 'knots'], ['bft', 'Beaufort']]],
  ['pressure', 'Pressure', [['hPa', 'hPa'], ['inHg', 'inHg'], ['mmHg', 'mmHg']]],
  ['precip', 'Precipitation', [['mm', 'mm'], ['in', 'inches']]],
  ['dist', 'Distance', [['km', 'km / m'], ['mi', 'miles / ft']]],
  ['clock', 'Time format', [['24', '24-hour'], ['12', '12-hour']]],
  ['aqi', 'Air quality index', [['us', 'US EPA'], ['eu', 'European']]],
];
function renderSettings() {
  $('#settings-rows').innerHTML = SETTINGS.map(([k, label, opts]) => `<div class="set-row"><label>${label}</label>
    <div class="seg">${opts.map(([v, n]) => `<button data-set="${k}" data-v="${v}" class="${S[k] === v ? 'active' : ''}">${n}</button>`).join('')}</div></div>`).join('');
}
function openSheet(open) { $('#sheet-bg').classList.toggle('open', open); $('#settings-sheet').classList.toggle('open', open); }
function applySetting(k, v) {
  S[k] = v; store.set('settings', S); renderSettings();
  renderAll();
  if (state.tab === 'places') { $('#world').dataset.done = ''; renderPlaces(); }
  WxMap.unitsChanged();
}

// ── Tabs ──────────────────────────────────────────────
function switchTab(t) {
  if (state.tab === 'map' && t !== 'map') WxMap.hide();
  state.tab = t;
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + t));
  if (t === 'map') WxMap.show();
  if (t === 'places') renderPlaces();
  if (t === 'forecast' && state.wx) renderHourChart();
  if (t === 'sky' && state.wx) renderSky();
}

// ── Events ────────────────────────────────────────────
function wire() {
  $$('.tab').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]'); if (g) { switchTab(g.dataset.goto); return; }
    const hmb = e.target.closest('[data-hm]'); if (hmb) { state.hourMetric = hmb.dataset.hm; hourHidden.clear(); renderForecast(); renderHourChart(); return; }
    const ls = e.target.closest('#hour-legend [data-s]');
    if (ls) { hourHidden.has(ls.dataset.s) ? hourHidden.delete(ls.dataset.s) : hourHidden.add(ls.dataset.s); renderHourChart(); return; }
    const ms = e.target.closest('[data-ms]');
    if (ms) { modelHidden.has(ms.dataset.ms) ? modelHidden.delete(ms.dataset.ms) : modelHidden.add(ms.dataset.ms); renderModels(); return; }
    const mm = e.target.closest('#model-metric [data-m]');
    if (mm) {
      state.modelMetric = mm.dataset.m;
      $$('#model-metric button').forEach((b) => b.classList.toggle('active', b === mm));
      if (state.models) renderModels(); else loadModels();
      return;
    }
    if (e.target.closest('#models-load')) { loadModels(); return; }
    const day = e.target.closest('[data-day]'); if (day) { day.parentElement.classList.toggle('open'); return; }
    const aqs = e.target.closest('#aqi-std [data-a]'); if (aqs) { applySetting('aqi', aqs.dataset.a); return; }
    const set = e.target.closest('[data-set]'); if (set) { applySetting(set.dataset.set, set.dataset.v); return; }
    const del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); saved.splice(+del.dataset.del, 1); store.set('places', saved); renderPlaces(); renderHeader(); return; }
    const row = e.target.closest('.prow');
    if (row) {
      const k = +row.dataset.k, kind = row.dataset.kind;
      const p = kind === 'saved' ? saved[k] : kind === 'world' ? WORLD[k] : searchResults[k];
      if (p) { $('#search').value = ''; $('#results-card').classList.add('hidden'); loadPlace({ ...p, current: false }); switchTab('today'); }
    }
  });
  $('#search').addEventListener('input', (e) => onSearch(e.target.value));
  $('#place-btn').onclick = () => { switchTab('places'); setTimeout(() => $('#search').focus(), 50); };
  $('#locate-btn').onclick = () => { useMyLocation(); };
  $('#refresh-btn').onclick = () => state.place && loadPlace(state.place);
  $('#star-btn').onclick = toggleSave;
  $('#settings-btn').onclick = () => { renderSettings(); openSheet(true); };
  $('#sheet-bg').onclick = () => openSheet(false);
  window.addEventListener('resize', () => { if (state.tab === 'forecast' && state.wx) renderHourChart(); });
  // auto-refresh every 15 minutes while the app is open; on resume if stale
  setInterval(() => { if (!document.hidden && state.place && Date.now() - state.loadedAt > 15 * 60000) loadPlace(state.place); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.place && Date.now() - state.loadedAt > 15 * 60000) loadPlace(state.place); });
}

// ── Public hooks used from inline handlers ────────────
const App = {
  reload: () => state.place && loadPlace(state.place),
  async openPoint(lat, lon) {
    const info = await reverseGeocode(lat, lon);
    await loadPlace({ lat, lon, ...info, current: false });
    switchTab('today');
  },
};

// ── Boot ──────────────────────────────────────────────
wire();
useMyLocation();
