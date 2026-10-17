# NABIZ BLE protocol — firmware ↔ app contract

> English version of [`NABIZ_BLE_PROTOCOL.md`](../NABIZ_BLE_PROTOCOL.md) (Turkish original). If the two ever differ, the
> code in `src/ble/protocol.ts` is the source of truth.

The design reports named the characteristics (`CHAR_PHYSIO` / `CHAR_EVENT` / `CHAR_CONFIG`) but did not define the real
UUIDs and byte formats. This file fills that gap. **The firmware (NimBLE-Arduino) and the app
(`src/ble/protocol.ts`) must use the values in this file exactly.** If one changes, the other must be updated too.

## UUIDs

```
Service:       6e400001-b5a3-f393-e0a9-e50e24dcca9e
CHAR_PHYSIO:   6e400002-b5a3-f393-e0a9-e50e24dcca9e   (Notify, band → phone)
CHAR_EVENT:    6e400003-b5a3-f393-e0a9-e50e24dcca9e   (Notify, band → phone)
CHAR_CONFIG:   6e400004-b5a3-f393-e0a9-e50e24dcca9e   (Write,  phone → band)
```

The device name must start with `NABIZ-` (for example `NABIZ-01`). The app filters scan results on this prefix
(`src/ble/protocol.ts` → `NABIZ_DEVICE_NAME_PREFIX`).

## CHAR_PHYSIO — 9 bytes, little-endian

| Byte | Field         | Type    | Description                                      |
|------|---------------|---------|--------------------------------------------------|
| 0-1  | avgIbiMs      | uint16  | Mean inter-beat interval within the batch (ms)   |
| 2-3  | gsrRaw        | uint16  | Raw ADC value (0–4095, XIAO ESP32S3 D0/GPIO1)    |
| 4-5  | tempCentiC    | int16   | Temperature × 100 (DS18B20)                      |
| 6-7  | accelMagMg    | uint16  | Acceleration magnitude in milli-g (MPU6050)      |
| 8    | sampleCount   | uint8   | Raw samples aggregated into this batch           |

The firmware loop sends this packet with a notify every 1–5 s. HRV (RMSSD/SDNN) is computed **on the phone** from the
raw IBI sequence, no statistics are embedded in the microcontroller (see `src/engine/PhysioBaselineEngine.ts`).

## CHAR_EVENT — 1–2 bytes

| Value | Meaning                  | Extra byte                                                   |
|-------|--------------------------|--------------------------------------------------------------|
| 0x01  | Manual label (button/UI) | byte 1: label index (0 = Tense, 1 = Excited, 2 = Didn't notice) |
| 0x02  | Calibration started      | —                                                            |
| 0x03  | Calibration complete     | —                                                            |
| 0x04  | Low battery              | —                                                            |

## CHAR_CONFIG — phone → band, Write

| Byte 0 | Meaning                | Extra bytes                                                  |
|--------|------------------------|--------------------------------------------------------------|
| 0x01   | START_CALIBRATION      | —                                                            |
| 0x02   | SET_SAMPLE_INTERVAL_MS | bytes 1-2: uint16 little-endian, milliseconds                |
| 0x03   | SET_TIER               | byte 1: tier (0 = Normal, 1, 2, 3), remote tier selection from the app |

`SET_TIER` is acted on by the display firmware (the watch UI). The sensor-only firmware ignores it.

## Calibration behavior (firmware responsibility)

On first wear, a rest measurement of about 2 minutes plus a short reference sampling in response to the
`START_CALIBRATION` command is enough. **The actual rolling baseline is computed on the phone**
(`PhysioBaselineEngine`, averaged over low-motion windows of the last 48 hours). The firmware only keeps streaming raw
samples and does not need to know any baseline logic.

## Firmware implementation

The firmware lives in a separate repository (PlatformIO, environment `seeed_xiao_esp32s3`, NimBLE-Arduino) and
implements the UUIDs and packet format above exactly. Its `Protocol.h` must be kept in sync with this file:
`SensorHub.cpp` extracts IBI from the MAX30102 IR signal with an adaptive-threshold peak detector and reads
GSR/DS18B20/MPU6050, and `main.cpp` runs the GATT server and executes `CHAR_CONFIG` commands.

BLE/GATT service pattern reference: [JoshDumo/esp32-max30102-nimBLE-PLX](https://github.com/JoshDumo/esp32-max30102-nimBLE-PLX).
