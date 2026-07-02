# Apexis

A privacy-first run tracker for iOS and Android with a focus on statistics. No accounts, no cloud, no social feed — every run stays on your device.

Built with **React Native + Expo (TypeScript)**.

## Features

### Tracking
- Live GPS tracking with distance, moving time, current pace, average pace
- Works with the screen off / app in background (foreground service on Android, background location on iOS)
- Auto-pause when you stop moving (configurable), plus manual pause/resume
- GPS quality filtering: inaccurate fixes (>35 m) and implausible jumps are rejected
- Elevation gain/loss with smoothing and hysteresis so altitude noise doesn't inflate your climb
- Cadence and step count from the phone's pedometer
- Live per-km (or per-mile) splits
- Keeps the screen awake during a run; haptic feedback on start/finish

### Statistics
- **Per run**: distance, moving vs. elapsed time, avg pace, pace-over-distance chart, elevation profile, splits table with relative pace bars, climb/descent, calories, steps, cadence, max speed, best 1k/5k/10k within the run
- **Aggregate**: totals (distance, time, runs, climb, calories, avg pace) by week / month / year / all time
- **Trends**: distance per day (week view), per week (month view), per month (year view)
- **Personal records**: fastest 1k / 5k / 10k (best rolling window across any run), longest run, best average pace, biggest climb — each linking to the run that set it
- Route thumbnails rendered as vector previews (no map API needed)

### Not included (by design)
- Social/community features — intentionally out of scope
- Heart rate — phones can't measure it; would require a wearable integration

## Getting started

```bash
npm install
```

Background location and maps require **native builds** — this app will not fully work in Expo Go.

```bash
# iOS (requires Xcode)
npx expo run:ios --device

# Android (requires Android Studio / SDK)
npx expo run:android --device
```

For distribution builds use [EAS Build](https://docs.expo.dev/build/introduction/): `npx eas build`.

### Android maps note
`react-native-maps` uses Apple Maps on iOS (works out of the box) and Google Maps on Android, which needs an API key. Add it to `app.json` before building for Android:

```json
"android": {
  "config": {
    "googleMaps": { "apiKey": "YOUR_KEY" }
  }
}
```

Without a key the Android map tiles stay blank, but tracking, statistics, and the vector route previews all work regardless.

## App icon & splash

All icon/splash assets in `assets/` are generated from the master artwork with:

```bash
node scripts/make-assets.js assets-src/apexis-icon-master.png
```

The script color-keys the mark out of the master image and composes the iOS icon, Android adaptive layers (background / foreground / monochrome), splash logo, and favicon with the exact brand background (`#0A0C10`). Re-run `npx expo prebuild --clean` afterwards to embed them.

## Architecture

```
src/
  theme.ts                  Design tokens (dark theme, typography, spacing)
  types.ts                  Shared domain types
  tracking/
    engine.ts               Tracking core: GPS filtering, distance, auto-pause,
                            elevation hysteresis, cadence, live splits
    locationTask.ts         Background location task (expo-task-manager)
    useTracking.ts          React hook exposing live stats
  db/
    database.ts             SQLite schema (runs + track_points)
    runRepository.ts        Persistence and queries
  stats/aggregates.ts       Period totals, trend buckets, personal records
  utils/
    geo.ts                  Haversine distance
    analysis.ts             Splits, best-window times, chart series, calories
    format.ts               Unit conversion and formatting (metric/imperial)
  components/               Reusable UI: charts (SVG), route preview, splits table
  screens/                  Track, History, RunDetail, Stats, Settings
  navigation/               Tabs + stack
```

### How the numbers are computed
- **Distance** — haversine sum over accepted GPS fixes; fixes with accuracy worse than 35 m or implying >12.5 m/s are discarded.
- **Moving time** — wall clock minus manual and automatic pauses. Pauses split the track into segments so no distance or time leaks across gaps.
- **Elevation gain** — exponential smoothing over GPS altitude plus a 2 m hysteresis threshold.
- **Best 1k/5k/10k** — fastest rolling window over the cumulative distance/time curve, computed when the run is saved.
- **Calories** — ~1.036 kcal × kg × km, using the body weight from Settings.
- **Cadence** — pedometer steps over a rolling 60 s window.
