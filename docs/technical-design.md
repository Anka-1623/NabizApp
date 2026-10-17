# NabizApp — Technical design

> English version of [`MOBIL_UYGULAMA_TEKNIK_TASARIM.md`](../MOBIL_UYGULAMA_TEKNIK_TASARIM.md) (Turkish original, written
> for internal handover), condensed for readers outside the team. It describes the phone side only. The diagrams are in
> [`logic-diagrams.md`](logic-diagrams.md) and the radio contract in [`ble-protocol.md`](ble-protocol.md).

## 1. Context

**Team and competition.** Stratos Root, TEKNOFEST 2026 *Technological Applications in the Fight Against Addiction*
competition (run with Yeşilay). Scoring is fully prototype-based.

**System.** A hybrid early-warning and intervention system in two parts that meet only in a fusion layer:

1. **NABIZ** is a wristband (ESP32, PPG pulse, GSR skin conductance, temperature, accelerometer). It detects physiological
   arousal and craving signs and streams them to the phone over BLE. Its firmware is **not in this repository**, only the
   BLE contract it must follow is.
2. **KUMARKALKANI** is the phone-side software. An Android `AccessibilityService` detects a betting-app usage pattern.
3. **Fusion engine.** Combines the two with a time-windowed AND and produces a three-tier intervention.

**This repository contains the whole phone side:** BLE receiver, baseline and fusion engines, the AccessibilityService,
UI, and storage.

The key engineering principle: the two detectors run independently and meet only in the fusion layer. If one fails or
becomes noisy, the other keeps working at its own, weaker tier.

## 2. Source map

```
NabizApp/
├── App.tsx                           root: SafeAreaProvider + RootNavigator
├── src/
│   ├── types/nabiz.ts                shared types (Tier, PhysioSample, BehavioralRiskEvent, FusionResult,
│   │                                 DiaryEntry, KNOWN_BETTING_PACKAGES, BETTING_TEXT_KEYWORDS)
│   ├── ble/
│   │   ├── protocol.ts               UUID constants, encode/decode
│   │   └── BleManager.ts             NabizBleManager: scan, connect, reconnect, commands
│   ├── engine/
│   │   ├── PhysioBaselineEngine.ts   rolling baseline, z-score, RMSSD
│   │   ├── FusionEngine.ts           tier logic
│   │   └── __tests__/                Jest unit tests
│   ├── native/AccessibilityBridge.ts TypeScript wrapper of the Kotlin native module
│   ├── storage/                      DiaryStore (MMKV, process-and-discard), secureKey (Keystore)
│   ├── store/useNabizStore.ts        zustand store that wires every subsystem together
│   ├── navigation/RootNavigator.tsx  Onboarding → Home → Intervention / Diary / DeviceScan
│   ├── screens/                      Onboarding, Home, Intervention, Diary, DeviceScan
│   └── dev/Simulator.ts              __DEV__-only fake data generator
└── android/app/src/main/java/com/nabizapp/
    ├── accessibility/                BettingAppAccessibilityService.kt + React Native bridge
    └── foreground/                   MonitoringForegroundService.kt (persistent notification)
```

## 3. PhysioBaselineEngine

`src/engine/PhysioBaselineEngine.ts`

| Constant | Value | Meaning |
|---|---|---|
| `BASELINE_WINDOW_MS` | 48 hours | The baseline is computed from this rolling window, not a one-time calibration |
| `LOW_MOTION_ACCEL_THRESHOLD_MG` | 150 | Only samples with `\|accel − 1000 mg\| ≤ 150` enter the baseline (filters exercise confounds) |
| `MIN_BASELINE_SAMPLES` | 30 | Roughly the first ~2 minutes of rest calibration |
| `AROUSAL_Z_THRESHOLD` | 2.0 | Two sigma against the personal baseline, not an absolute threshold |
| `RECENT_WINDOW_MS` | 60 s | Buffer for instantaneous HR, RMSSD and z-scores |

**Algorithm.** Each `PhysioSample` goes into the short-term buffer and, if low-motion, into the baseline window. Once 30+
low-motion samples exist the baseline counts as calibrated and a rolling mean and std are computed.
`computeArousalState()` converts the last 60 s into z-scores:
`zIbi = (baselineMean − recentMean) / baselineStd` (the sign is flipped because a shorter IBI means a faster pulse), and
`isAroused = zIbi ≥ 2 OR zGsr ≥ 2`. RMSSD is the root mean square of successive IBI differences.

**Documented limit.** Acceleration-based motion filtering cleans PPG/IBI artifacts well, but studies do not show the same
benefit for GSR/EDA artifact detection (one benchmark reports unsupervised EDA artifact detection dropping about 4.3 %
AUC with acceleration features). The GSR channel is therefore **not** motion-gated, and no naive "ignore GSR when moving"
rule was written. This is left as future work.

## 4. BettingAppAccessibilityService (Kotlin)

`android/app/src/main/java/com/nabizapp/accessibility/BettingAppAccessibilityService.kt`. This is Android's own API and
cannot be written in JS, so it exists as a native class.

It listens to `TYPE_WINDOW_STATE_CHANGED` (low-frequency and event-driven, unlike the high-frequency BLE "hot path", to keep
battery use low). For each event:

1. Is the foreground package a known betting app? (`com.iddaa.android`, `com.nesine.android`, `com.misli.android`,
   `com.tuttur.android`, `com.bilyoner.android`)
2. If not, does the view tree (max depth 8) contain a keyword from the text list? The list is Turkish on purpose:
   `canlı bahis` (live betting), `canlı casino`, `hoşgeldin bonusu` (welcome bonus), `çevrim şartı` (wagering
   requirement), `deneme bonusu` (trial bonus), `yatırım bonusu` (deposit bonus), `kayıp bonusu` (loss bonus),
   `güncel giriş` (current login), `resmi giriş adresi`, `alternatif site`, `kesintisiz erişim`. This catches mirror
   sites of blocked domains.
3. If neither matches, the event is skipped.

**Pattern score, not a boolean.** The signal is not "app is open". The service counts how often the same package came to the
foreground in the last 5 minutes (`PATTERN_WINDOW_MS`) and normalizes it: `patternScore = min(count / 5, 1.0)`. The reason
is a common-cause confound: keeping a betting app open while watching a match (arousal plus app open, but no real craving)
would be a false positive with a simple foreground boolean. Reading real bet frequency or amounts from the accessibility
tree is a stretch goal and not implemented. This service lays the foundation, it is not the full solution.

Events reach JS through `AccessibilityBridgeModule.kt` using a `NativeEventEmitter` (`NabizAccessibilityBettingRisk`), and
`src/native/AccessibilityBridge.ts` wraps them into `BehavioralRiskEvent`.

**Cold-start race (fixed).** If the service fires at boot before the JS bridge is up, events are buffered in an in-memory
`pendingEvents` queue (max 50, oldest dropped) in the service's companion object and delivered in order as soon as the bridge
registers its listener. Limit: the queue does not survive process death. A WorkManager-backed queue would be needed for that,
which is out of scope unless a real need appears.

**Android 13+ "Restricted settings".** For sideloaded (non-Play) apps the AccessibilityService cannot be enabled until the
user opens Settings → Apps → App info → ⋮ → *Allow restricted settings*. This is needed again after every newly signed
install.

## 5. FusionEngine

`src/engine/FusionEngine.ts`

- `FUSION_WINDOW_MS = 3 minutes`, the midpoint of the 2–5 minute range derived from craving-peak literature. It is tunable
  and has not been clinically validated.
- `BEHAVIORAL_PATTERN_SCORE_THRESHOLD = 0.5`. Behavioral events below it are logged but do not count as risk.

```
physioActive      = last arousal timestamp is within FUSION_WINDOW_MS of now
behavioral.isRisky = last event with patternScore ≥ 0.5 is within FUSION_WINDOW_MS of now

if physioActive AND behavioral.isRisky → Tier 3 (full intervention)
else if physioActive                   → Tier 1 (awareness)
else if behavioral.isRisky             → Tier 2 (friction)
else                                   → no tier
```

`updatePhysio()` and `updateBehavioral()` are called completely independently and meet only in `evaluate()`. `useNabizStore`
polls `evaluate()` every 2 seconds (polling, not event-driven), and a diary entry is written when the tier is non-zero and
differs from the last logged one.

## 6. Corrections from an independent team audit

A team member independently audited the causal assumptions of the fusion logic. All four findings have a counterpart in
the code:

1. **Common-cause confound** (most critical). "Arousal plus app open" may not be craving (for example a betting app left
   open during a match), and an accelerometer cannot resolve it because the person is still in both cases. Fix: the
   behavioral signal is a frequency-based `patternScore`, not an app-foreground boolean.
2. **Adherence and avoidance limit.** Someone in a real crisis is the person most motivated to take the band off or turn
   Bluetooth off. Unresolved, only mitigated (neutral "general health" notification wording). Stated honestly as a
   behavioral limit.
3. **Calibration validity.** A one-time 2-minute calibration goes stale as HRV and GSR drift with sleep, caffeine, and
   circadian rhythm. Fix: a rolling baseline instead of a single mandatory session.
4. **The 2–5 minute window is still unvalidated.** Mitigation: timestamped calibration and labeling data is logged
   (`DiaryEntry.userLabel`) so real pilot numbers can be used later.

The audit also suggested a mandatory "tense or excited?" confirmation before Tier 3. This was rejected, because asking on
every trigger would undermine the point of passive sensing. It was implemented only as an **optional, one-tap label on
Tier 1** (`InterventionScreen.tsx`) for personalization and future labeling data.

## 7. Storage and privacy

`src/storage/DiaryStore.ts` uses `react-native-mmkv` v4 (Nitro/JSI, encrypted).

- **Process-and-discard.** The raw sensor stream (IBI, GSR, temperature, motion time series) is **never written to disk**.
  Only `DiaryEntry { id, timestampMs, tier, userLabel?, note? }` is persisted. This keeps biometric-data risk to a minimum
  under KVKK (Turkish data-protection law) and is part of the pitch: a device-independent, user-consented self-management
  tool.
- **Encryption key.** `src/storage/secureKey.ts` generates a 256-bit random key on first launch with
  `react-native-get-random-values` and stores it in the Android Keystore / iOS Keychain (`react-native-keychain`,
  `ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY`). The key arrives asynchronously, so `DiaryStore.init()` exists and `App.tsx`
  waits for it, showing a blank splash view, before rendering the navigator.
- **Surveillance-feel mitigation.** The persistent foreground notification says "General health tracking is running" and never
  mentions betting or gambling.
- `getRelapseRiskSummary(days = 7)` returns tier counts for the last N days and feeds the diary summary card.

## 8. Screens and UX

`src/navigation/RootNavigator.tsx` (native stack):

1. **Onboarding consent.** Two separate switches (physiological data, behavioral data). "Continue" stays disabled until both
   are on. The footer states that this digital consent does not replace the paper KVKK explicit-consent form, which is
   handled separately.
2. **Home.** Band connection and accessibility-service cards, current tier card (HR, z(IBI), z(GSR)), remote tier
   buttons, a recalibrate button, and a link to the diary. When the tier is not none it navigates to `Intervention`
   automatically. A `__DEV__` block with Calm / Tier 1 / Tier 2 / Tier 3 buttons drives `dev/Simulator.ts` when no band is
   connected. It is never rendered in release builds.
3. **Intervention.** `presentation: 'fullScreenModal'`, `gestureEnabled: false` (cannot be swiped away), with three UIs:
   Tier 1 (awareness text plus optional label chips), Tier 2 (a 10-second countdown, a pause rather than a hard block),
   Tier 3 (dark theme, animated 4-4 breathing circle, coping card, a button that calls **YEDAM 115**, and "It passed, log it").
4. **Diary.** Last-7-days tier summary plus the full `DiaryEntry` list.
5. **Device scan.** Manual pairing screen.

The UI text is Turkish. The screenshots in the README are the real Turkish screens.

## 9. Dependencies and build

Bare React Native CLI 0.86.2 (**not Expo**, since Expo Go cannot run the custom AccessibilityService native module), React
19.2.3, Node `>= 22.11.0`, Android `minSdk 24`, `targetSdk 36`.

Key packages: `react-native-ble-plx` (BLE), `react-native-mmkv` v4 (note: the v4 API uses `createMMKV()`, there is no
`new MMKV()`, so older tutorials do not apply), `react-native-nitro-modules`, `react-native-keychain`,
`react-native-get-random-values`, `@react-navigation/native` + `native-stack` 7, `zustand` 5.

**Verified:** `tsc --noEmit` clean, `eslint . --max-warnings=0` clean, `jest` 14/14 passing (FusionEngine and
PhysioBaselineEngine unit tests plus the React Native template smoke test that renders App → Navigator → first screen).
The app was also run in an Android emulator (debug build) and its onboarding, home, three intervention, and diary screens
were captured for the README.

**Release signing.** The release build reads a `keystore.properties` file and a keystore that are never committed (see
`android/keystore.properties.example`). `build.gradle` fails loudly if the file is missing instead of silently falling back
to the debug keystore.

**Distribution decision (deliberate).** The app is sideloaded and the Google Play Console is not used. Google Play asks for a
separate Permissions Declaration Form for apps using `AccessibilityService` for non-accessibility purposes, with a real risk
of rejection or suspension, which does not fit a short build window. The only costs of sideloading are the Restricted
settings step and a "Play Protect has not scanned this app" tap, which is trivial for a small team and jury devices.

## 10. Known open points

- The GSR channel is not motion-gated (§3).
- The behavioral signal is frequency-based. Reading actual bet amounts from the accessibility tree is a stretch goal, not done.
- No persistent (process-death-proof) event queue for the AccessibilityService, in-memory only (§4).
- The 2–5 minute fusion window is a literature-consistent assumption without direct clinical validation.
- Long-running live testing against a real band is not part of this repository. Phone-side behavior was verified with the
  `__DEV__` simulator, which feeds the real baseline and fusion engines with synthetic samples.
