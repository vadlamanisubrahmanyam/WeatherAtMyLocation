/* Sun & moon calculations (adapted from the public-domain SunCalc algorithms). */
'use strict';
const Astro = (() => {
  const PI = Math.PI, rad = PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
  const toJulian = (date) => date.valueOf() / dayMs - 0.5 + J1970;
  const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
  const toDays = (date) => toJulian(date) - J2000;
  const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
  const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
  function eclipticLongitude(M) {
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    return M + C + rad * 102.9372 + PI;
  }
  function sunCoords(d) {
    const L = eclipticLongitude(solarMeanAnomaly(d));
    return { dec: declination(L, 0), ra: rightAscension(L, 0) };
  }
  /** Sun altitude in degrees at a given instant. */
  function sunAltitude(date, lat, lng) {
    const lw = rad * -lng, phi = rad * lat, d = toDays(date), c = sunCoords(d);
    const H = siderealTime(d, lw) - c.ra;
    return Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H)) / rad;
  }
  const J0 = 0.0009;
  const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * PI));
  const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * PI) + n;
  const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const hourAngle = (h, phi, d) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));

  /** Times for the day containing `date`. Each value is a Date, or null when the sun never crosses that angle. */
  function sunTimes(date, lat, lng) {
    const lw = rad * -lng, phi = rad * lat, d = toDays(date), n = julianCycle(d, lw);
    const ds = approxTransit(0, lw, n), M = solarMeanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L, 0);
    const Jnoon = solarTransitJ(ds, M, L);
    const pair = (angle) => {
      const w = hourAngle(angle * rad, phi, dec);
      if (isNaN(w)) return [null, null];
      const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
      return [fromJulian(Jnoon - (Jset - Jnoon)), fromJulian(Jset)];
    };
    const [sunrise, sunset] = pair(-0.833);
    const [dawn, dusk] = pair(-6);
    const [nauticalDawn, nauticalDusk] = pair(-12);
    const [astroDawn, astroDusk] = pair(-18);
    const [goldenEndAM, goldenStartPM] = pair(6);
    return { solarNoon: fromJulian(Jnoon), sunrise, sunset, dawn, dusk, nauticalDawn, nauticalDusk, astroDawn, astroDusk, goldenEndAM, goldenStartPM };
  }
  function moonCoords(d) {
    const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d);
    const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F), dt = 385001 - 20905 * Math.cos(M);
    return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
  }
  /** fraction: illuminated 0..1; phase: 0 new → 0.25 first quarter → 0.5 full → 0.75 last quarter. */
  function moonIllumination(date) {
    const d = toDays(date), s = sunCoords(d), m = moonCoords(d), sdist = 149598000;
    const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
    const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra),
      Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / PI, distance: m.dist };
  }
  /** Moon altitude in degrees (low precision, good enough to find rise/set to a few minutes). */
  function moonAltitude(date, lat, lng) {
    const lw = rad * -lng, phi = rad * lat, d = toDays(date), c = moonCoords(d);
    const H = siderealTime(d, lw) - c.ra;
    let h = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H));
    h += rad * 0.017 / Math.tan(h + rad * 10.26 / (h + rad * 5.10)); // refraction
    return h / rad + 0.133; // + horizontal parallax offset
  }
  /** Scan 24 h from `start` in 10-minute steps for moonrise / moonset. */
  function moonRiseSet(start, lat, lng) {
    let rise = null, set = null, prev = moonAltitude(start, lat, lng);
    for (let i = 1; i <= 144; i++) {
      const t = new Date(start.getTime() + i * 600000), a = moonAltitude(t, lat, lng);
      if (prev < 0 && a >= 0 && !rise) rise = t;
      if (prev >= 0 && a < 0 && !set) set = t;
      prev = a;
    }
    return { rise, set };
  }
  function phaseName(p) {
    if (p < 0.03 || p > 0.97) return ['New moon', '🌑'];
    if (p < 0.22) return ['Waxing crescent', '🌒'];
    if (p < 0.28) return ['First quarter', '🌓'];
    if (p < 0.47) return ['Waxing gibbous', '🌔'];
    if (p < 0.53) return ['Full moon', '🌕'];
    if (p < 0.72) return ['Waning gibbous', '🌖'];
    if (p < 0.78) return ['Last quarter', '🌗'];
    return ['Waning crescent', '🌘'];
  }
  /** Next instant the phase crosses `target` (0 = new, 0.5 = full), searched in 1-hour steps. */
  function nextPhase(from, target) {
    let prev = moonIllumination(from).phase;
    for (let i = 1; i < 24 * 31; i++) {
      const t = new Date(from.getTime() + i * 3600000), p = moonIllumination(t).phase;
      if (target === 0 ? (prev > 0.9 && p < 0.1) : (prev < target && p >= target)) return t;
      prev = p;
    }
    return null;
  }
  return { sunTimes, sunAltitude, moonIllumination, moonRiseSet, phaseName, nextPhase };
})();
