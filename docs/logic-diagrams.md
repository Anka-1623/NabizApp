# DurAn — Logic diagrams

This page shows how decisions are made inside the system. The diagrams were drawn from the source code, and each
section names the file where the constants live. GitHub renders them inline. PNG exports of the same diagrams are in
[`diagrams/`](diagrams) for slides and portfolio use.

> Parts marked *band firmware* run on the wristband and live in a separate repository. Everything else is in this one.

| # | Diagram | What it shows |
|---|---------|---------------|
| 1 | [System architecture](#1-system-architecture) | Band, phone, and the data path between them |
| 2 | [BLE session](#2-ble-session) | Scanning, connecting, notifications, and commands |
| 3 | [Band: raw signal to inter-beat interval](#3-band-raw-signal-to-inter-beat-interval) | From a PPG sample to a trustworthy IBI and a BLE packet |
| 4 | [Phone: baseline and arousal](#4-phone-baseline-and-arousal) | From IBI/GSR to a personal z-score and an "aroused" decision |
| 5 | [Behavioral detection](#5-behavioral-detection) | How betting-app usage becomes a score |
| 6 | [Fusion decision](#6-fusion-decision) | How two signals become Tier 0–3 |
| 7 | [Band screen flow](#7-band-screen-flow) | Gestures and transitions on the watch screen |
| 8 | [App screen flow](#8-app-screen-flow) | The user path from onboarding to the diary |
| 9 | [Data privacy flow](#9-data-privacy-flow) | What is stored and what is not |

---

## 1. System architecture

Two independent detectors meet only at the fusion layer. If one stops working, the other keeps running at its own tier.
On the band side there are currently two hardware tracks: the sensor firmware (real sensors, not yet validated on a
physical board) and the display firmware (its sensor values are simulated). See [Status and limits](../README.md#status-and-limits).

```mermaid
flowchart TB
  subgraph BAND["Wristband (separate repository)"]
    SENS["Sensors<br/>MAX30102 · GSR<br/>DS18B20 · MPU6050"] --> FW["Sensor firmware · XIAO ESP32S3<br/>IBI extraction · motion gate"]
    WATCH["Display firmware · ESP32-S3 touch LCD<br/>tier UI"]
  end
  LINK{{"BLE GATT<br/>band → phone: CHAR_PHYSIO · CHAR_EVENT<br/>phone → band: CHAR_CONFIG"}}
  subgraph PHONE["Android phone · this repository"]
    BLE["NabizBleManager"] --> BASE["PhysioBaselineEngine<br/>baseline · z-score"]
    BASE --> FUSION["FusionEngine<br/>3-minute windowed AND"]
    A11Y["AccessibilityService<br/>betting-pattern score"] --> FUSION
    FUSION --> UI["Intervention screens + diary<br/>Tier 1 · 2 · 3 · encrypted store"]
  end
  FW <--> LINK
  WATCH <--> LINK
  LINK <--> BLE

  classDef band fill:#fdf3d8,stroke:#e8a33d,color:#1a1a1a
  classDef phone fill:#dff3f4,stroke:#2a91a0,color:#1a1a1a
  classDef link fill:#eeeeee,stroke:#888888,color:#1a1a1a
  class SENS,FW,WATCH band
  class BLE,BASE,A11Y,FUSION,UI phone
  class LINK link
```

---

## 2. BLE session

The service and its three characteristics are the single contract between firmware and app
([`ble-protocol.md`](ble-protocol.md), `src/ble/protocol.ts`). The service UUID is `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
and the device name starts with `NABIZ-`.

```mermaid
sequenceDiagram
  autonumber
  participant B as Band (NABIZ-xx)
  participant P as Phone app

  B->>B: Create GATT server, start advertising
  P->>B: Scan by service UUID, pick a name starting with NABIZ-
  P->>B: Connect, discover services
  P->>B: Subscribe to CHAR_PHYSIO and CHAR_EVENT notifications

  loop every 1–5 s (set with SET_SAMPLE_INTERVAL_MS)
    B-->>P: CHAR_PHYSIO, 9 bytes (avg IBI, GSR, temperature, motion, sample count)
    P->>P: ingest, baseline, z-score, fusion
  end

  B-->>P: CHAR_EVENT 0x01 label (0 Tense, 1 Excited, 2 Didn't notice)
  B-->>P: CHAR_EVENT 0x04 low battery

  P->>B: CHAR_CONFIG 0x01 START_CALIBRATION
  B-->>P: CHAR_EVENT 0x02 calibration started
  B-->>P: CHAR_EVENT 0x03 calibration complete

  P->>B: CHAR_CONFIG 0x03 SET_TIER (only the display firmware acts on it)

  Note over B,P: If the link drops the band restarts advertising and the app scans again
```

| Characteristic | Direction | Payload |
|---|---|---|
| `CHAR_PHYSIO` `…0002` | band → phone, Notify | 9 bytes, little-endian: `avgIbiMs` u16 · `gsrRaw` u16 · `tempCentiC` i16 · `accelMagMg` u16 · `sampleCount` u8 |
| `CHAR_EVENT` `…0003` | band → phone, Notify | 1–2 bytes: `0x01` label (+index) · `0x02` calibration started · `0x03` complete · `0x04` low battery |
| `CHAR_CONFIG` `…0004` | phone → band, Write | `0x01` calibrate · `0x02` sample interval (+u16 ms) · `0x03` select tier (+tier) |

HRV (RMSSD) is not computed on the band. The firmware only streams raw inter-beat intervals and the statistics are
computed on the phone.

---

## 3. Band: raw signal to inter-beat interval

*Band firmware.* The peak threshold is not a fixed number, it adapts to the signal's own AC amplitude. The motion gate
keeps beat intervals measured while the wrist is moving out of the packet.

```mermaid
flowchart TB
  IR["MAX30102 IR sample"] --> TOUCH{{"IR ≥ 50000 ?<br/>skin contact present"}}
  TOUCH -- no --> DROP["sample / IBI rejected"]
  TOUCH -- yes --> AC["Subtract slow-EMA DC baseline → AC component<br/>threshold = 0.6 × EMA of AC amplitude"]
  AC --> PEAK["AC crosses threshold upward = peak<br/>300 ms refractory · re-arms at half the threshold"]
  PEAK --> IBI["IBI = time since previous peak"]
  ACC["MPU6050<br/>acceleration magnitude"] --> GATE
  IBI --> GATE{{"300 ≤ IBI ≤ 2000 ms<br/>AND |accel − 1000 mg| ≤ 150 ?"}}
  GATE -- no --> DROP
  GATE -- yes --> BUF["IBI buffer (max 32)"]
  BUF --> PKT["Each batch: mean IBI + GSR + temperature + motion<br/>→ 9-byte CHAR_PHYSIO packet"]
  PKT --> OUT(["BLE notify → phone"])

  classDef drop fill:#fde4e1,stroke:#b42318,color:#1a1a1a
  classDef ok fill:#e6f2e9,stroke:#166534,color:#1a1a1a
  class DROP drop
  class OUT ok
```

At rest the acceleration magnitude is about 1 g (1000 mg), not zero, so the comparison is on `|accel − 1000 mg|`.
All constants are tuning values that still need validation on a real wrist.

---

## 4. Phone: baseline and arousal

`src/engine/PhysioBaselineEngine.ts`. The decision is not based on an absolute threshold. It is a z-score against the
person's own low-motion samples from the last 48 hours. A rolling window is used instead of a one-time calibration
because sleep, caffeine, and circadian rhythm shift the baseline over time.

```mermaid
flowchart TB
  ING(["Sample arrives over BLE"]) --> RECENT["Last-60-s buffer<br/>mean IBI · GSR · HR · RMSSD"]
  ING --> LOWM{{"|accel − 1000 mg| ≤ 150 ?"}}
  LOWM -- no --> SKIP["not added to the baseline"]
  LOWM -- yes --> WIN["Baseline window<br/>low-motion samples from the last 48 h"]
  WIN --> CAL{{"≥ 30 samples ?"}}
  CAL -- no --> WAIT["not calibrated<br/>arousal not computed"]
  CAL -- yes --> BASE["Rolling mean and std<br/>IBI · GSR"]
  RECENT --> Z
  BASE --> Z["z(IBI) = (baseline − current) / std<br/>z(GSR) = (current − baseline) / std"]
  Z --> AR{{"z(IBI) ≥ 2  OR  z(GSR) ≥ 2 ?"}}
  AR -- yes --> AROUSED["isAroused = true<br/>timestamp goes to FusionEngine"]
  AR -- no --> CALM["not aroused"]

  classDef drop fill:#eeeeee,stroke:#888888,color:#1a1a1a
  classDef ok fill:#ffe3d8,stroke:#ff7849,color:#1a1a1a
  class SKIP,WAIT,CALM drop
  class AROUSED ok
```

The sign of z(IBI) is flipped: a shorter IBI means a faster pulse, which is the arousal direction. The motion gate applies
to the pulse interval only. The GSR channel is not motion-filtered (benchmarks suggest motion features do not improve
EDA artifact detection), which is left as future work.

---

## 5. Behavioral detection

The Android `AccessibilityService` is event-driven, so unlike the high-frequency BLE path it is cheap on battery. The
signal is not a "betting app is open" boolean, it is a **frequency-based score**. This avoids the false positive where a
betting app simply stays open while someone watches a match.

```mermaid
flowchart TB
  EV(["Window changed<br/>TYPE_WINDOW_STATE_CHANGED"]) --> MATCH{{"Known betting package OR<br/>betting keyword in the view tree<br/>(depth ≤ 8) ?"}}
  MATCH -- no --> IGN["event ignored"]
  MATCH -- yes --> SCORE["Times this package came to the foreground in 5 min = n<br/>patternScore = min(n / 5, 1.0)"]
  SCORE --> EVT["BehavioralRiskEvent → FusionEngine<br/>in-memory queue (max 50) if the JS bridge is not ready"]
  EVT --> TH{{"patternScore ≥ 0.5 ?"}}
  TH -- yes --> RISK["risky pattern<br/>valid for 3 min"]
  TH -- no --> LOG["recorded only<br/>not counted as risk"]

  classDef ok fill:#ffe3d8,stroke:#ff7849,color:#1a1a1a
  classDef drop fill:#eeeeee,stroke:#888888,color:#1a1a1a
  class RISK ok
  class IGN,LOG drop
```

Known packages: `iddaa`, `nesine`, `misli`, `tuttur`, `bilyoner`. The keyword path (for example `canlı bahis`,
`deneme bonusu`, `güncel giriş`) exists to catch mirror sites of blocked domains. The persistent notification text says
"General health tracking is running" on purpose and never mentions betting or gambling.

---

## 6. Fusion decision

`FusionEngine.evaluate()` runs every 2 seconds. The window is 3 minutes: the midpoint of the 2–5 minute range reported
for craving peaks. It is a tunable constant and has no direct clinical validation.

```mermaid
flowchart TB
  START(["evaluate() · every 2 s"]) --> Q1{{"Physiological active?<br/>last arousal ≤ 3 min ago"}}
  Q1 -- yes --> Q2{{"Behaviorally risky?<br/>last risky event ≤ 3 min ago"}}
  Q1 -- no --> Q3{{"Behaviorally risky?<br/>last risky event ≤ 3 min ago"}}
  Q2 -- yes --> T3["TIER 3<br/>full intervention"]
  Q2 -- no --> T1["TIER 1<br/>awareness"]
  Q3 -- yes --> T2["TIER 2<br/>friction"]
  Q3 -- no --> T0["No tier"]
  T3 --> OUT
  T1 --> OUT
  T2 --> OUT["Intervention screen opens · diary entry on tier change<br/>on acknowledge: diary entry + fusion reset"]

  classDef t0 fill:#e6f2e9,stroke:#166534,color:#1a1a1a
  classDef t1 fill:#d6eef1,stroke:#2a91a0,color:#1a1a1a
  classDef t2 fill:#ffe3d8,stroke:#ff7849,color:#1a1a1a
  classDef t3 fill:#ffd2c4,stroke:#b42318,color:#1a1a1a
  class T0 t0
  class T1 t1
  class T2 t2
  class T3 t3
```

| Physiological | Behavioral | Result | Intervention |
|:-:|:-:|---|---|
| – | – | No tier | — |
| ✓ | – | **Tier 1** | Short awareness message, optional one-tap label |
| – | ✓ | **Tier 2** | "Pause for a moment before continuing", 10-second countdown |
| ✓ | ✓ | **Tier 3** | 4-4 breathing circle, coping card, YEDAM 115 (one-tap call in the app) |

Source: `src/engine/FusionEngine.ts`. Tier transitions are covered by `FusionEngine.test.ts`.

---

## 7. Band screen flow

*Display firmware.* Navigation on the watch is done entirely with touch gestures at the screen corners. A tier change uses a
240 ms cross-dissolve, and entering Tier 3 plays a short beep.

```mermaid
flowchart LR
  START(["boot · splash"]) --> N["Normal<br/>pulse · z(IBI) · z(GSR)"]
  N -- "bottom-right corner<br/>long press" --> K1["Tier 1<br/>awareness · label chips"]
  K1 -- "bottom-right<br/>long press" --> K2["Tier 2<br/>10 s countdown"]
  K2 -- "bottom-right<br/>long press" --> K3["Tier 3<br/>breathing circle · YEDAM 115"]
  K3 -- "bottom-right long press" --> N
  K1 -. "tap a label chip" .-> N
  N -- "tap the DurAn wordmark" --> SET["Settings<br/>Bluetooth · calibration"]
  SET -- "Back · Calibrate<br/>or 8 s timeout" --> N

  ANY(["any tier screen"]) -- "bottom-left corner<br/>double long press" --> MENU["Hidden menu<br/>4 rows"]
  MENU -- "tap a row" --> TGT["Selected tier screen<br/>Normal · T1 · T2 · T3"]
  PH(["SET_TIER from phone"]) -- "closes menu or settings<br/>if open" --> TGT

  classDef t0 fill:#e6f2e9,stroke:#166534,color:#1a1a1a
  classDef t1 fill:#d6eef1,stroke:#2a91a0,color:#1a1a1a
  classDef t2 fill:#ffe3d8,stroke:#ff7849,color:#1a1a1a
  classDef t3 fill:#ffd2c4,stroke:#b42318,color:#1a1a1a
  classDef aux fill:#eeeeee,stroke:#888888,color:#1a1a1a
  class N t0
  class K1 t1
  class K2 t2
  class K3 t3
  class SET,MENU,TGT,ANY,PH aux
```

The hidden menu and corner gestures are for the jury or demo operator and are not part of the end-user flow. Tapping a
label chip on Tier 1 sends `CHAR_EVENT 0x01` to the phone and returns the screen to Normal.

---

## 8. App screen flow

`InterventionScreen` opens as a full-screen modal and cannot be swiped away. Labeling on Tier 1 is optional (a mandatory
question on every trigger would defeat the purpose of passive sensing, so it was deliberately rejected).

```mermaid
flowchart TB
  A["Onboarding<br/>digital consent<br/>two separate switches"] -->|both given| H["Home<br/>band status · accessibility<br/>current tier · remote tier"]
  H --> DP["Diary and relapse-risk panel<br/>tier counts for the last 7 days"]
  H --> SC["Device scan<br/>manual pairing"]
  H -->|tier ≠ none| I{{"Intervention screen<br/>full-screen modal"}}
  I -->|T1| I1["Awareness message<br/>Tense · Excited · Didn't notice"]
  I -->|T2| I2["10 s countdown<br/>then I understand, continue"]
  I -->|T3| I3["4-4 breathing circle · coping card<br/>YEDAM 115 · It passed, log it"]
  I1 --> D["Diary entry<br/>tier + time (+ label)"]
  I2 --> D
  I3 --> D
  D -->|returns to Home| H

  classDef t1 fill:#d6eef1,stroke:#2a91a0,color:#1a1a1a
  classDef t2 fill:#ffe3d8,stroke:#ff7849,color:#1a1a1a
  classDef t3 fill:#ffd2c4,stroke:#b42318,color:#1a1a1a
  class I1 t1
  class I2 t2
  class I3 t3
```

---

## 9. Data privacy flow

Raw physiological data is never written to disk and never sent to a server. The only thing persisted is the tier, a
timestamp, and an optional label. This is a deliberate architectural decision to keep biometric-data risk to a minimum.

```mermaid
flowchart LR
  RAW["Raw sensor stream<br/>IBI · GSR · temperature · motion"] --> MEM["Processed in memory only<br/>baseline · z-score · fusion"]
  MEM -.-> NO["✗ never written to disk<br/>✗ never sent to a server"]
  MEM --> TIER["Tier result"]
  TIER --> ENTRY["DiaryEntry<br/>id · time · tier · (label)"]
  ENTRY --> ENC[("MMKV encrypted store")]
  KEY["256-bit random key<br/>Android Keystore"] --> ENC

  classDef drop fill:#fde4e1,stroke:#b42318,color:#1a1a1a
  classDef store fill:#e6f2e9,stroke:#166534,color:#1a1a1a
  class NO drop
  class ENC,ENTRY store
```

The in-app digital consent does not replace the paper-based KVKK (Turkish data-protection law) explicit-consent form,
which is handled separately.
