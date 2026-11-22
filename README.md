# WeatherAtMyLocation

Real-time weather + news feed Android app.  
Built with Expo (React Native WebView wrapper) • Developed by Subrahmanyam

---

## What it does (v2.0 — SkyPulse Weather)
Free, ad-free weather monitoring with no accounts or API keys. Feature set modelled on Windy, Ventusky, AccuWeather, Carrot and Meteoblue.

**Today**
- Opens at your GPS location. If GPS is unavailable it falls back to an approximate IP location, then to the last place you viewed
- Current conditions with a plain-language summary (warmer or cooler than yesterday, when rain starts, gusts, tomorrow)
- 15-minute precipitation nowcast for the next 3 hours ("rain starting in 20 min")
- 24-hour strip with sunrise and sunset markers
- 16 detail tiles: feels like, humidity and dew point comfort, wind and gusts with a compass arrow and Beaufort scale, 3-hour pressure trend, UV, visibility, low/mid/high cloud, rain chance, storm energy (CAPE and lifted index), wet-bulb heat stress, solar radiation and sunshine hours, freezing level, snow, evapotranspiration, soil temperature and moisture, daylight change
- Alerts: official National Weather Service alerts for US locations, plus alerts the app derives from the forecast (thunderstorms, gusts, heavy rain and flooding, snow, freezing rain, heat, wind chill, frost, fog, UV, unhealthy air)

**Forecast**
- 72-hour interactive charts (tap for values): temperature, feels like and dew point; rain chance; wind and gusts; humidity; pressure; cloud layers; UV; visibility
- 16-day forecast with temperature range bars and expandable day details
- Model comparison: ECMWF, GFS, ICON, GEM, JMA, UK Met Office and Météo-France side by side, with a model-agreement confidence badge on each day

**Map** (similar to Windy)
- Animated wind particles over model heatmaps for wind, gusts, temperature, rain, clouds, pressure and humidity, with a 48-hour time slider and play button
- Live rain radar loop (RainViewer) and daily true-colour satellite images for the past 7 days (NASA GIBS)
- The full Windy map embedded inside the app, with 11 overlays including waves, CAPE, snow and visibility
- Tap anywhere on Earth for the conditions at that point, then open its full forecast

**Air & Sky**
- US or European AQI with health advice and pollutant bars compared with WHO guidelines (PM2.5, PM10, NO₂, O₃, SO₂, CO, dust); 4-day AQI chart
- Pollen (Europe): grass, birch, alder, olive, ragweed, mugwort
- Sun: position arc, first and last light, golden and blue hours, astronomical dark
- Moon: phase, illumination, moonrise and moonset, next full and new moon
- Marine (for coastal places): waves, swell, sea temperature, sea state
- Activity outlook scores for running, cycling, stargazing, drying laundry, driving and picnics

**Places**: search for any place worldwide, save favourites, and see a world-cities list with live temperatures and local times.

**Settings**: °C/°F; km/h, mph, m/s, knots or Beaufort; hPa, inHg or mmHg; mm or inches; km or miles; 12- or 24-hour clock; US or EU AQI.

### Project layout
| Path | What |
|---|---|
| `web/` | The UI: `index.html`, `styles.css`, `app.js`, `map.js`, `charts.js` and `astro.js`. Open `web/index.html` through any local web server to develop in a browser |
| `scripts/embed-html.js` | Inlines `web/` into `src/weatherHtml.ts` (run `npm run embed` after editing `web/`; CI also runs it) |
| `App.tsx` | Expo WebView shell. It loads the inlined page and opens external links in the browser |

### Data sources (all free, no key)
Open-Meteo (forecast, models, air quality, marine, geocoding) · RainViewer (radar) · NASA GIBS (satellite) · Windy embed · Esri (basemap) · BigDataCloud / OpenStreetMap Nominatim (place names) · GeoJS (IP location fallback) · api.weather.gov (US alerts)

---

## One-time setup

### 1. Clone the repo
```bash
git clone https://github.com/subrahmanyam/WeatherAtMyLocation.git
cd WeatherAtMyLocation
```

### 2. Generate app icons
```bash
pip install Pillow
python3 generate_icons.py
```
This creates `assets/icon.png`, `assets/adaptive-icon.png`, and `assets/splash.png`.

### 3. Generate a release keystore (one-time)
```bash
keytool -genkeypair -v \
  -keystore release.keystore \
  -alias weatheratmylocation \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```
Remember the passwords you set — you'll need them for the GitHub secrets below.

### 4. Base64-encode the keystore
```bash
# macOS / Linux
base64 -i release.keystore | pbcopy   # copies to clipboard (macOS)
base64 -i release.keystore            # print to terminal (Linux)
```

### 5. Add GitHub repository secrets
Go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name        | Value                                      |
|--------------------|--------------------------------------------|
| `KEYSTORE_BASE64`  | Base64 output from step 4                  |
| `KEY_ALIAS`        | `weatheratmylocation`                      |
| `KEYSTORE_PASSWORD`| Password you set in step 3                 |
| `KEY_PASSWORD`     | Key password you set in step 3             |

### 6. Commit and push
```bash
git add .
git commit -m "initial scaffold"
git push origin main
```

GitHub Actions will trigger automatically. The signed APK appears under  
**Actions → Build Signed APK → Artifacts → WeatherAtMyLocation-release-{n}**

---

## Install on device
```bash
adb install WeatherAtMyLocation-release-1.apk
```
Grant **Location** permission when prompted on first open.

---

## Tech stack
| Layer | Technology |
|---|---|
| Framework | Expo SDK 53 + React Native 0.79 |
| UI | HTML/CSS/JS in `web/`, inlined into one WebView page |
| Maps | Leaflet 1.9.4 + custom canvas wind-particle layer |
| Weather | Open-Meteo APIs (free, no key) |
| Geocoding | Open-Meteo Geocoding, BigDataCloud, Nominatim |
| Build | GitHub Actions → signed APK |

---

## Ideas for later
- Home-screen widget and background severe-weather notifications (needs native modules)
- Isobar contour lines on the pressure layer
- Historical climate comparison (Open-Meteo archive API)
