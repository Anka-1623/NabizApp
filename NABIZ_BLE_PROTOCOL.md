# NABIZ BLE Protokolü — Firmware ↔ Uygulama senkron kaynağı

Hibrit rapor Bölüm 9 ve yapım planı Bölüm 3, karakteristik isimlerini (`CHAR_PHYSIO`/`CHAR_EVENT`/`CHAR_CONFIG`)
tanımlıyordu ama gerçek UUID/bayt formatı yoktu. Bu dosya o boşluğu dolduruyor — **firmware (NimBLE-Arduino)
ve uygulama (`src/ble/protocol.ts`) tarafı bu dosyadaki değerleri birebir kullanmalı**, biri değişirse diğeri
de güncellenmeli.

## UUID'ler

```
Servis:        6e400001-b5a3-f393-e0a9-e50e24dcca9e
CHAR_PHYSIO:   6e400002-b5a3-f393-e0a9-e50e24dcca9e   (Notify, band → telefon)
CHAR_EVENT:    6e400003-b5a3-f393-e0a9-e50e24dcca9e   (Notify, band → telefon)
CHAR_CONFIG:   6e400004-b5a3-f393-e0a9-e50e24dcca9e   (Write,  telefon → band)
```

Cihaz adı `NABIZ-` ile başlamalı (örn. `NABIZ-01`) — uygulama taramada bunu filtreliyor
(`src/ble/protocol.ts` → `NABIZ_DEVICE_NAME_PREFIX`).

## CHAR_PHYSIO — 9 bayt, little-endian

| Bayt | Alan          | Tip     | Açıklama                                    |
|------|---------------|---------|----------------------------------------------|
| 0-1  | avgIbiMs      | uint16  | Batch içi ortalama nabız-arası aralık (ms)   |
| 2-3  | gsrRaw        | uint16  | Ham ADC (0-4095, XIAO ESP32S3 D0/GPIO1)      |
| 4-5  | tempCentiC    | int16   | Sıcaklık × 100 (DS18B20)                     |
| 6-7  | accelMagMg    | uint16  | İvme büyüklüğü, milli-g (MPU6050)             |
| 8    | sampleCount   | uint8   | Bu batch'te aggregate edilen ham örnek sayısı |

Firmware tarafında Bölüm 9'daki `loop()` her 1-5sn'de bir bu paketi `ble.notify(CHAR_PHYSIO, packet)`
ile göndermeli. HRV (RMSSD/SDNN) **telefon tarafında** ham IBI dizisinden hesaplanır — ESP32'ye
istatistik gömülmez (bkz. `src/engine/PhysioBaselineEngine.ts`).

## CHAR_EVENT — 1 bayt

| Değer | Anlam                  |
|-------|--------------------------|
| 0x01  | Manuel buton etiketi     |
| 0x02  | Kalibrasyon başladı       |
| 0x03  | Kalibrasyon tamamlandı    |
| 0x04  | Düşük batarya             |

## CHAR_CONFIG — telefon → band, Write

| Bayt 0 | Anlam                  | Ekstra bayt                          |
|--------|--------------------------|----------------------------------------|
| 0x01   | START_CALIBRATION        | —                                       |
| 0x02   | SET_SAMPLE_INTERVAL_MS    | bayt 1-2: uint16 little-endian, ms      |

## Kalibrasyon davranışı (firmware sorumluluğu)

İlk takıldığında ~2dk dinlenme ölçümü + telefonun her gün otomatik gönderdiği `START_CALIBRATION`
komutuna yanıt olarak kısa bir referans örnekleme yapılması yeterli — **kayan taban çizgisinin asıl
hesaplaması telefonda** (`PhysioBaselineEngine`, son 24-48s düşük-hareket pencerelerinden ortalama).
Firmware sadece ham örnekleri akıtmaya devam eder, baseline mantığı bilmesine gerek yok.

## Firmware implementasyonu

`~/Masaüstü/stratos-root/NabizFirmware/` — PlatformIO projesi (env: `seeed_xiao_esp32s3`, NimBLE-Arduino),
yukarıdaki UUID/paket formatını birebir uyguluyor: `include/Protocol.h` bu dosyayla senkron tutulmalı,
`src/SensorHub.cpp` MAX30102 IR sinyalinden adaptif eşikli tepe (peak) tespitiyle IBI çıkarıyor,
GSR/DS18B20/MPU6050 okuyor, `src/main.cpp` GATT sunucusunu ve CHAR_CONFIG komutlarını yürütüyor.
Build/flash adımları ve açık donanım maddeleri (etiketleme butonu, pil-voltaj bölücü henüz BOM'da yok)
için `NabizFirmware/README.md`'ye bakın.

Referans alınan başlangıç deposu (BLE/GATT servis kalıbı için): [JoshDumo/esp32-max30102-nimBLE-PLX](https://github.com/JoshDumo/esp32-max30102-nimBLE-PLX).
