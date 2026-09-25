# WeatherAtMyLocation

Real-time weather + news feed Android app.  
Built with Expo (React Native WebView wrapper) • Developed by Subrahmanyam

---

## What it does
- Live weather from your GPS location (Open-Meteo API — free, no key)
- 8 weather parameters: temperature, humidity, wind, visibility, pressure, UV index, precipitation, dew point
- Air Quality Index with PM2.5 / PM10 / NO₂ / O₃ breakdown
- 7-day forecast on demand
- Extreme weather alerts (UV, rain, wind, thunderstorm, heat, frost)
- °C ↔ °F unit toggle
- Curated news feed with category filters

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
| Framework | Expo SDK 51 + React Native 0.74 |
| UI | Single self-contained HTML file (WebView) |
| Weather | Open-Meteo API (free, no key) |
| Geocoding | Nominatim / OpenStreetMap (free) |
| Build | GitHub Actions → signed APK |

---

## Phase 2 ideas
- Live news via NewsData.io free tier
- Real AQI via OpenAQ API
- 24-hour temperature chart
- PWA manifest for home-screen install on non-Android
