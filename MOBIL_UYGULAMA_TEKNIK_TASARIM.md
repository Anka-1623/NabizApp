# NABIZ + KUMARKALKANI — Mobil Uygulama Teknik Tasarımı

> Bu dosya başka bir Claude Code agent'ına devretmek için yazıldı. Aşağıdaki her satır
> `~/Masaüstü/stratos-root/NabizApp/` altındaki gerçek kaynak koddan (2026-08-03 itibarıyla) doğrudan
> okunarak derlendi — varsayım/plan değil, mevcut implementasyonun dökümü. "Bilinen sınırlar" bölümü
> hariç her şey çalışan/derlenen kod.

## 1. Bağlam — bu app ne, neden var

**Takım**: Stratos Root (Bursa Tofaş Fen Lisesi İHA/drone takımının bağımlılık-teknolojisi kolu).
**Yarışma**: TEKNOFEST 2026 "Bağımlılıklarla Mücadelede Teknolojik Uygulamalar Yarışması" (Yeşilay
ortaklığıyla), final 30 Eylül–4 Ekim 2026 Şanlıurfa, %100 prototip-bazlı puanlama.

**Sistem**: iki parçalı hibrit bir erken-uyarı/müdahale sistemi:

1. **NABIZ** — bilek bandı (ESP32 + PPG/nabız + GSR/deri-iletkenliği + sıcaklık + ivmeölçer),
   fizyolojik uyarılma/craving belirtilerini algılar, BLE ile telefona akıtır. **Bu repo'da yer
   almıyor** — sadece firmware'in uyması gereken BLE sözleşmesi burada tanımlı (bkz. §3).
2. **KUMARKALKANI** — telefon tarafı yazılım, Android AccessibilityService ile bahis/kumar
   uygulaması kullanım örüntüsünü tespit eder.
3. **Füzyon motoru** — ikisini zaman-pencereli AND mantığıyla birleştirip 3 kademeli müdahale
   üretir. **Bu repo, tüm telefon tarafını (BLE alıcı, füzyon motoru, AccessibilityService,
   UI, depolama) içerir** — asıl konu bu.

Tasarımın kritik mühendislik ilkesi: iki dedektör birbirinden **bağımsız** çalışır, sadece füzyon
katmanında buluşur — biri arızalanır/gürültülü olursa diğeri tek başına daha zayıf bir kademede
devam eder (bkz. `src/engine/FusionEngine.ts` yorumu).

## 2. Üst düzey mimari

```
┌─────────────────────┐   BLE (NimBLE GATT)   ┌──────────────────────────────────────────┐
│  NABIZ bilek bandı   │ ───────────────────► │              Android telefon              │
│  ESP32 + MAX30102    │  notify: physio/event │                                            │
│  (PPG) + GSR sensör  │ ◄─────────────────────│  write: config (kalibrasyon komutu)        │
│  + DS18B20 (sıcaklık)│                       │                                            │
│  + MPU6050 (ivme)    │                       │  ┌────────────────────────────────────┐  │
│  [BU REPO'DA YOK —   │                       │  │ NabizBleManager (react-native-ble-plx│  │
│   sadece protokol    │                       │  └──────────────┬───────────────────────┘  │
│   sözleşmesi var]    │                       │                 ▼                          │
└──────────────────────┘                       │  ┌────────────────────────────────────┐  │
                                                │  │ PhysioBaselineEngine (kayan taban   │  │
                                                │  │ çizgisi + z-skoru + RMSSD)           │  │
                                                │  └──────────────┬───────────────────────┘  │
                                                │                 ▼                          │
  Android AccessibilityService                 │  ┌────────────────────────────────────┐  │
  (BettingAppAccessibilityService.kt,          │  │       FusionEngine (Kademe 0-3)      │  │
  native/JS bridge değil — JS'te yazılamaz) ───┼─►└──────────────┬───────────────────────┘  │
                                                │                 ▼                          │
                                                │  ┌────────────────────────────────────┐  │
                                                │  │ zustand store (useNabizStore) +      │  │
                                                │  │ DiaryStore (MMKV, kademe+zaman only) │  │
                                                │  └──────────────┬───────────────────────┘  │
                                                │                 ▼                          │
                                                │   React Navigation: Onboarding → Home →     │
                                                │   Intervention (T1/T2/T3) / Diary            │
                                                └──────────────────────────────────────────┘
```

**Tüm işlem cihaz üzerinde** — ham fizyolojik veri hiçbir sunucuya gitmez, diske de yazılmaz
(§7). Bu, hem KVKK biyometrik-veri riskini azaltıyor hem de rapor pitch'inin bir parçası
("cihaz-bağımsız, kullanıcı-rızalı öz-yönetim aracı" — kurum-bağımlı IGT patentinden farkı).

## 3. BLE veri sözleşmesi (firmware ↔ telefon)

Kaynak: `NABIZ_BLE_PROTOCOL.md` + `src/ble/protocol.ts` (bu ikisi birbirinin aynası olmalı,
biri değişirse diğeri güncellenmeli).

```
Servis UUID:   6e400001-b5a3-f393-e0a9-e50e24dcca9e
CHAR_PHYSIO:   6e400002-...  Notify, band → telefon, 9 bayt
CHAR_EVENT:    6e400003-...  Notify, band → telefon, 1 bayt
CHAR_CONFIG:   6e400004-...  Write,  telefon → band, 1-3 bayt
```

Cihaz adı `NABIZ-` ile başlamalı (telefon taramada bunu filtreliyor).

**CHAR_PHYSIO — 9 bayt, little-endian, batch başına ~1-5sn'de bir:**

| Bayt | Alan | Tip | Açıklama |
|---|---|---|---|
| 0-1 | avgIbiMs | uint16 | Batch içi ortalama nabız-arası aralık (ms) |
| 2-3 | gsrRaw | uint16 | Ham ADC, 0-4095 (GPIO34) |
| 4-5 | tempCentiC | int16 | Sıcaklık × 100 (DS18B20) |
| 6-7 | accelMagMg | uint16 | İvme büyüklüğü, milli-g (MPU6050) |
| 8 | sampleCount | uint8 | Batch'te aggregate edilen ham örnek sayısı |

**Kritik tasarım kararı**: HRV metrikleri (RMSSD/SDNN) **ESP32'de hesaplanmaz** — Maxim'in
MAX30102 referans algoritması sadece HR/SpO2 verir, HRV vermez. Firmware yalnızca ham
inter-beat-interval akıtır, `PhysioBaselineEngine.ts` telefonda RMSSD hesaplar. Bu, firmware
işini büyük ölçüde basitleştiriyor.

**CHAR_EVENT — 1 bayt** (band → telefon): `0x01` manuel buton etiketi, `0x02` kalibrasyon
başladı, `0x03` kalibrasyon tamamlandı, `0x04` düşük batarya.

**CHAR_CONFIG — telefon → band**: `0x01` START_CALIBRATION (parametresiz), `0x02`
SET_SAMPLE_INTERVAL_MS (+ 2 bayt little-endian ms).

Firmware referans başlangıç noktası: [JoshDumo/esp32-max30102-nimBLE-PLX](https://github.com/JoshDumo/esp32-max30102-nimBLE-PLX)
(BLE/GATT katmanı için) — UUID'leri yukarıdakilerle değiştirip paket formatını 9-baytlık struct'a
göre yeniden yazmak gerekiyor. Hiçbir tek repo PPG+GSR+ivme+BLE'yi uçtan uca kapsamıyor, firmware
takımı parçaları entegre etmeli.

## 4. Telefon tarafı — dosya haritası

```
NabizApp/
├── App.tsx                                    — kök: SafeAreaProvider + RootNavigator
├── src/
│   ├── types/nabiz.ts                         — paylaşılan tipler (Tier enum, PhysioSample,
│   │                                             BehavioralRiskEvent, FusionResult, DiaryEntry,
│   │                                             KNOWN_BETTING_PACKAGES, BETTING_TEXT_KEYWORDS)
│   ├── ble/
│   │   ├── protocol.ts                        — UUID sabitleri, encode/decode fonksiyonları
│   │   └── BleManager.ts                      — NabizBleManager: tarama/bağlanma/reconnect
│   ├── engine/
│   │   ├── PhysioBaselineEngine.ts            — kayan taban çizgisi + z-skoru + RMSSD
│   │   ├── FusionEngine.ts                    — kademe (Tier) mantığı
│   │   └── __tests__/                         — Jest birim testleri (13 test, hepsi geçiyor)
│   ├── native/
│   │   └── AccessibilityBridge.ts             — Kotlin native modülün TS sarmalayıcısı
│   ├── storage/
│   │   └── DiaryStore.ts                      — MMKV üzerinde process-and-discard günlük
│   ├── store/
│   │   └── useNabizStore.ts                   — zustand: tüm alt sistemleri birbirine bağlar
│   ├── navigation/
│   │   └── RootNavigator.tsx                  — Onboarding → Home → Intervention/Diary
│   ├── screens/
│   │   ├── OnboardingConsentScreen.tsx        — KVKK dijital onay (2 ayrı switch)
│   │   ├── HomeScreen.tsx                     — durum kartları + __DEV__ simülatör paneli
│   │   ├── InterventionScreen.tsx             — Kademe 1/2/3 farklı tam-ekran UI'lar
│   │   └── DiaryScreen.tsx                    — geçmiş kayıtlar + 7-günlük özet
│   ├── dev/
│   │   └── Simulator.ts                       — __DEV__-gated sahte veri üreticisi
│   └── theme.ts                                — renk/font/spacing sabitleri
├── android/app/src/main/java/com/nabizapp/
│   ├── accessibility/
│   │   ├── BettingAppAccessibilityService.kt  — AccessibilityService, JS'te yazılamaz
│   │   ├── AccessibilityBridgeModule.kt       — RN NativeModule köprüsü
│   │   └── AccessibilityBridgePackage.kt
│   └── foreground/
│       └── MonitoringForegroundService.kt     — kalıcı bildirimli ön-plan servis
├── android/app/src/main/AndroidManifest.xml
├── android/app/src/main/res/xml/accessibility_service_config.xml
├── NABIZ_BLE_PROTOCOL.md                       — §3'ün kaynağı, firmware ile senkron dosyası
└── __tests__/App.test.tsx                      — RN template smoke test (App→Navigator render)
```

## 5. PhysioBaselineEngine — fizyolojik taban çizgisi ve uyarılma tespiti

Dosya: `src/engine/PhysioBaselineEngine.ts`. Sabitler:

- `BASELINE_WINDOW_MS = 48 saat` — taban çizgisi bu pencereden hesaplanır (kayan, tek seferlik
  değil — takım arkadaşı denetiminden gelen düzeltme, bkz. §8).
- `LOW_MOTION_ACCEL_THRESHOLD_MG = 150` — bu ivme değerinin altı "düşük hareket" sayılır, sadece
  bu örnekler taban çizgisine girer (egzersiz gibi motion-confound'ları filtrelemek için).
- `MIN_BASELINE_SAMPLES = 30` — kabaca ilk ~2dk dinlenme kalibrasyonuna denk gelir.
- `AROUSAL_Z_THRESHOLD = 2.0` — 2 sigma, sabit mutlak eşik DEĞİL, kişisel taban çizgisine göre.
- `RECENT_WINDOW_MS = 60 saniye` — anlık HR/RMSSD hesabı için tampon.

**Algoritma**: her `PhysioSample` geldiğinde (`ingest()`) hem kısa-vadeli tampona (RMSSD/anlık
z-skoru için) hem — eğer düşük hareketliyse — taban çizgisi penceresine eklenir. 30+ düşük-hareket
örneği birikince taban çizgisi "kalibre" sayılır ve rolling mean/std hesaplanır.

`computeArousalState()`: son 60sn'nin ortalama IBI/GSR'ı taban çizgisiyle z-skoruna çevrilir
(`zScoreIbi = (baselineMean - recentMean) / baselineStd` — IBI düşüşü = HR artışı = uyarılma,
bu yüzden işaret çevrilir). `zScoreIbi >= 2.0 OR zScoreGsr >= 2.0` ise `isAroused = true`.
RMSSD, ardışık IBI farklarının RMS'i olarak hesaplanır (standart HRV formülü).

**Bilinçli, dokümante edilmiş sınır**: ivme-tabanlı hareket filtrelemesi PPG/IBI artefaktını iyi
temizliyor ama araştırma GSR/EDA artefakt tespitini AYNI şekilde iyileştirmiyor (bir kıyaslamada
ivme özellikleri denetimsiz EDA-artefakt tespitini ~%4.3 AUC düşürüyor) — bu yüzden **GSR kanalı
motion-gate edilmiyor**, kod yorumunda bilerek not edildi, "hareket varsa GSR'yi yoksay" gibi
basit bir kural yazılmadı. Gelecek çalışma olarak bırakıldı.

## 6. BettingAppAccessibilityService — davranışsal tespit (Kotlin, native)

Dosya: `android/app/src/main/java/com/nabizapp/accessibility/BettingAppAccessibilityService.kt`.
**JS/React'te hiçbir şekilde yazılamaz** — bu Android'in kendi API'si, native Kotlin sınıf olarak
var olmak zorunda.

`TYPE_WINDOW_STATE_CHANGED` dinler (düşük frekanslı/olay-tabanlı — BLE'nin yüksek frekanslı
"sıcak yolu"nun aksine, pil tüketimini düşük tutmak için).

Her olayda:
1. Foreground paket adı bilinen bahis paketlerinden mi? (`KNOWN_BETTING_PACKAGES`: com.iddaa.android,
   com.nesine.android, com.misli.android, com.tuttur.android, com.bilyoner.android)
2. Değilse, `rootInActiveWindow` ağacında (max derinlik 8) `TEXT_KEYWORDS` listesinden bir eşleşme
   var mı? (canlı bahis, canlı casino, hoşgeldin bonusu, çevrim şartı, deneme bonusu, yatırım
   bonusu, kayıp bonusu, güncel giriş, resmi giriş adresi, alternatif site, kesintisiz erişim —
   BTK-engelli-alan-adı-mirror senaryosunu yakalamak için)
3. İkisi de yoksa olay atlanır.

**Kritik mühendislik düzeltmesi (takım arkadaşı denetiminden, §8)**: sinyal salt "app açık"
booleanı DEĞİL — aynı paketin son 5 dakikada (`PATTERN_WINDOW_MS`) kaç kez ön-plana geldiği
sayılıp `patternScore = min(count/5, 1.0)` olarak normalize ediliyor. Sebep: maç izlerken bahis
uygulamasının açık kalması gibi bir "ortak-neden confound"u (arousal + app açık ama gerçek
craving yok) tek başına app-foreground booleanıyla yakalanır ve yanlış pozitif üretirdi.
Gerçek "bahis sıklığı/tutarı" (erişilebilirlik ağacından işlem tutarı okuma, IGT patentinin
yaptığı gibi) daha ileri bir stretch-goal — bu servis temelini atıyor, tam çözüm değil.

Olaylar `AccessibilityBridgeModule.kt` üzerinden `NativeEventEmitter` ile JS'e taşınıyor
(`NabizAccessibilityBettingRisk` event adı), JS tarafında `src/native/AccessibilityBridge.ts`
bunu dinleyip `BehavioralRiskEvent` tipine sarıyor.

**Bilinen sınır (kod yorumunda not edilmiş)**: eğer servis telefon açılışında JS bridge ayağa
kalkmadan önce tetiklenirse `listener` null kalabilir ve olay JS'e ulaşmaz. Kalıcı offline-kuyruk
(WorkManager vb.) 6-8 haftalık prototip kapsamı dışında bırakıldı.

**Android 13+ "Restricted Settings" notu**: sideload edilen (Play Store dışı) uygulamalarda
AccessibilityService, kullanıcı Ayarlar → Uygulamalar → Uygulama bilgisi → ⋮ menüsü → "Kısıtlanmış
ayarlara izin ver" adımını atmadan etkinleştirilemez. Bu her yeni imzalı build kurulumunda TEKRAR
gerekiyor (bir kere değil) — build/test döngüsü boyunca akılda tutulmalı.

## 7. FusionEngine — kademe (tier) mantığı

Dosya: `src/engine/FusionEngine.ts`. Sabitler:

- `FUSION_WINDOW_MS = 3 dakika` — 2-5dk craving-tepe literatüründen türetilen spektrumun orta
  noktası, kalibre edilebilir, klinik olarak validasyonu tam yapılmamış (rapor bunu dürüstçe
  "craving-eğrisi zamanlamasına dayalı, doğrudan validasyonu yok" olarak belirtiyor).
- `BEHAVIORAL_PATTERN_SCORE_THRESHOLD = 0.5` — bu eşiğin altındaki davranışsal olaylar loglanır
  ama risk sayılmaz.

**Mantık** (`evaluate()`):

```
physioActive = son fizyolojik uyarılma zaman damgası, şimdiden FUSION_WINDOW_MS içinde mi?
behavioral.isRisky = son (patternScore >= eşik) davranışsal olay, şimdiden FUSION_WINDOW_MS içinde mi?

if physioActive AND behavioral.isRisky  → Tier.T3_FULL_INTERVENTION  (Kademe 3)
else if physioActive                     → Tier.T1_AWARENESS          (Kademe 1)
else if behavioral.isRisky                → Tier.T2_FRICTION           (Kademe 2)
else                                       → Tier.NONE
```

İki dedektör (`updatePhysio()`, `updateBehavioral()`) tamamen bağımsız çağrılıyor, sadece
`evaluate()` içinde buluşuyor — birinin veri akışı kesilirse diğeri hâlâ kendi zayıf kademesinde
çalışmaya devam ediyor (mimarinin temel sağlamlık ilkesi).

`useNabizStore.ts` bu `evaluate()`'i **2 saniyede bir** çağırıyor (polling, event-driven değil)
ve kademe `NONE`'dan farklı + önceki loglanmış kademeden farklıysa `DiaryStore.logTierEvent()`
tetikleniyor.

## 8. Takım arkadaşı denetiminden gelen 4 düzeltme (kodda uygulanmış hâli)

Bir takım üyesi füzyon mantığının nedensel varsayımlarını bağımsız denetledi; 4 bulgunun
hepsi bu kod tabanında karşılığını buldu:

1. **Ortak-neden confound** (en kritik) — "arousal + app açık" gerçek craving olmayabilir
   (maç izlerken bahis app'i açık kalması gibi). İvme sensörüyle düzeltilemez (kişi her iki
   durumda da hareketsiz). Düzeltme: davranışsal sinyal artık gerçek bahis-örüntüsü
   (frekans-tabanlı `patternScore`), salt "app foreground" booleanı değil — §6/§7'de kodlanmış.
2. **Uyum/kaçınma tasarım sınırı**: gerçek krizdeki kişi bandı çıkarmaya/Bluetooth'u kapatmaya en
   motive kişidir — çözülmemiş, sadece hafifletilebilir (bildirim metni "genel sağlık" diliyle,
   §9). Rapor bunu dürüstçe "davranışsal sınır, çözülmedi" olarak belirtiyor, abartılmıyor.
3. **Kalibrasyon geçerliliği**: tek seferlik 2dk kalibrasyon zamanla bayatlar (HRV/GSR uyku/
   kafein/sirkadiyen ritimle kayar). Düzeltme: kayan taban çizgisi (§5), tek zorunlu oturum yerine
   pasif ilk-hafta veri toplama + otomatik periyodik yeniden kalibrasyon.
4. **2-5dk JITAI penceresi hâlâ validasyonsuz** — dürüstçe böyle belirtiliyor, mitigasyon: build
   boyunca zaman damgalı kalibrasyon/etiketleme verisi loglanıp gerçek pilot sayılarının final
   demoda kullanılması planlanıyor (`DiaryEntry.userLabel` alanı bu amaçla var, §9).

Ayrıca takım arkadaşı Kademe 3'ten önce zorunlu "gergin mi heyecanlı mı?" onayı önerdi — kabul
edilmedi (her tetiklemede zorunlu sorması pasif-sensing tasarımının amacını baltalar), bunun
yerine **sadece Kademe 1'de**, tek-dokunuşlu, opsiyonel bir etiketleme sorusu olarak uygulandı
(`InterventionScreen.tsx`, `dismiss('nervous'|'excited'|'neutral')`) — kişiselleştirme/gelecek
etiketleme verisi için, zorunlu sürtünme değil.

## 9. Depolama ve gizlilik tasarımı

`src/storage/DiaryStore.ts` — `react-native-mmkv` (v4, Nitro/JSI tabanlı, şifreli):

**Process-and-discard**: ham sensör akışı (IBI/GSR/sıcaklık/ivme zaman serisi) **hiçbir zaman
diske yazılmaz** — sadece `DiaryEntry { id, timestampMs, tier, userLabel?, note? }` kalıcı
kaydediliyor. Bu, KVKK biyometrik-veri riskini minimumda tutmak için bilinçli bir mimari karar
(proje memory'sindeki regülatör bulgularına dayanıyor — Biyometrik Verilerin İşlenmesinde Dikkat
Edilmesi Gereken Hususlara İlişkin Rehber).

`encryptionKey: 'nabiz-local-diary-v1'` şu an sabit-kodlanmış — kod içinde `TODO: build öncesi
cihaza-özel/keychain-türetilmiş anahtarla değiştirin` notu var, henüz yapılmadı.

`getRelapseRiskSummary(days=7)`: son N gündeki kademe-bazlı tetiklenme sayılarını döndürür,
`DiaryScreen`'in özet kartında kullanılıyor.

**Bildirim/gözetleme algısı mitigasyonu**: `MonitoringForegroundService.kt`'nin kalıcı bildirimi
bilinçli olarak "Genel sağlık takibi çalışıyor" diyor, "bahis"/"kumar" geçmiyor (§8 bulgu 2'nin
mitigasyonu).

## 10. Ekranlar / UX akışı

`src/navigation/RootNavigator.tsx` (React Navigation native-stack):

1. **OnboardingConsentScreen** — iki ayrı switch (fizyolojik veri onayı + davranışsal veri
   onayı), ikisi de açılmadan "Devam et" pasif. Alt yazı: bu dijital onay, kağıt üzerindeki
   KVKK Açık Rıza Onam Formu'nun yerine geçmez (şartname madde 3.4 gereği ayrıca yürütülüyor).
2. **HomeScreen** — bant bağlantı durumu + erişilebilirlik servis durumu kartları (renkli nokta
   göstergesi), güncel kademe kartı (HR bpm, z(IBI), z(GSR) canlı gösterge), "Kalibrasyonu
   yeniden başlat" butonu, günlüğe link. `fusion.tier !== NONE` olduğunda otomatik
   `Intervention` ekranına navigate ediyor (`useEffect`). **`__DEV__` bloğu**: bant yokken
   4 buton (Sakin/Kademe1/Kademe2/Kademe3) ile `dev/Simulator.ts` fonksiyonlarını tetikliyor —
   release build'de bu blok hiç render edilmiyor.
3. **InterventionScreen** — `presentation: 'fullScreenModal', gestureEnabled: false` (kaydırarak
   kapatılamaz). Kademeye göre 3 farklı UI:
   - **Kademe 1**: "Şu an gerginlik yaşıyor olabilirsin" + opsiyonel gergin/heyecanlı/fark
     etmedim etiketleme çipleri.
   - **Kademe 2**: "Devam etmeden önce bir an dur" + 10 saniyelik geri sayım (agresif engel
     değil, düşünme payı), sonra "Anladım, devam ediyorum".
   - **Kademe 3**: koyu tema, 4-4 nefes animasyonlu daire (`Animated.loop`), başa çıkma kartı
     (3 madde), **YEDAM hattını arama butonu** (`tel:444 79 75`, `Linking.openURL`), "Geçti,
     günlüğe kaydet" (craving etiketiyle).
4. **DiaryScreen** — son 7 gün kademe-bazlı özet (Kademe 1/2/3 sayaçları) + tüm `DiaryEntry`
   listesi (tarih, kademe, varsa kullanıcı etiketi).

## 11. Bağımlılıklar ve build durumu

`package.json` — RN CLI 0.86.2 (bare, **Expo değil** — Expo Go özel AccessibilityService native
modülünü çalıştıramaz), React 19.2.3, Node engine `>=22.11.0`.

Kilit paketler: `react-native-ble-plx@^3.5.1` (BLE), `react-native-mmkv@^4.3.2` (depolama, Nitro/
JSI tabanlı — **v2/v3'ten farklı API, `new MMKV()` yok, `createMMKV()` var**, eski
tutorial/StackOverflow cevapları geçersiz), `react-native-nitro-modules@^0.36.5`,
`@react-navigation/native@^7` + `native-stack@^7`, `zustand@^5`.

**Doğrulanmış durum (2026-08-03 itibarıyla)**:
- `tsc --noEmit`: temiz.
- `eslint`: temiz (bir önemsiz inline-style uyarısı hariç).
- Jest: 14/14 test geçiyor (`FusionEngine.test.ts`, `PhysioBaselineEngine.test.ts` — 13 birim
  testi, kademe geçişleri + z-skoru/RMSSD matematiği el-hesabıyla doğrulanmış beklenen değerlere
  karşı; `__tests__/App.test.tsx` — RN template'in kendi smoke testi, tüm App→Navigator→ilk-ekran
  ağacını render ediyor).
- **`android/app/build/outputs/apk/release/app-release.apk` mevcut** (71.5MB, 2026-08-02 18:45
  tarihli) — yani gerçek bir Android release derlemesi **başarıyla tamamlanmış**. `versionCode 1`,
  `versionName "1.0"`, `applicationId com.nabizapp`, release `signingConfig` şu an debug keystore'a
  işaret ediyor (`build.gradle` satır 98/103) — jüri/gerçek dağıtım öncesi kendi imzalama
  anahtarına geçirilmeli. Bu, Kotlin native modüllerin (AccessibilityService, BLE bridge) artık
  derleyici tarafından doğrulandığı anlamına geliyor — daha önceki bir oturumda "JDK/Android SDK
  yoktu, native taraf compiler'dan geçmedi" notu artık **eskimiş**, bu makinede Android SDK/JDK
  kurulmuş ve gerçek bir build alınmış durumda.
- Cihaz üzerinde gerçek kurulum/eşleştirme/canlı BLE testi bu oturumda doğrulanmadı — bant
  donanımı henüz yok (§1), `__DEV__` simülatörü bu boşluğu doldurmak için var.

**Sideload kararı (bilinçli, gerekçeli)**: Google Play Console'a hiç girilmiyor. Sebepler: $25
tek seferlik ücret her koşulda geçerli; daha önemlisi Google Play, engellilik-dışı amaçla
AccessibilityService kullanan uygulamalardan kapalı/dahili test dahil ayrı bir "Permissions
Declaration Form" istiyor, gerçek red/askıya alma riskiyle — 3 günlük build penceresine uymuyor.
Sideloading'in tek maliyeti Restricted Settings adımı + "Play Protect taramadı, yine de yükle"
dokunuşu, takımın kendi ~4-9 cihazı için önemsiz. Jüri Şanlıurfa'da kendi cihazına kurmak isterse
bu karar yeniden değerlendirilebilir.

## 12. Firmware tarafı ile senkron noktaları (bu repo'nun dışı ama sınır burada)

Firmware (ESP32/NimBLE-Arduino) tarafını üstlenecek herkes şunlara **birebir** uymalı:

1. `NABIZ_BLE_PROTOCOL.md`'deki UUID'ler ve 9-baytlık `CHAR_PHYSIO` struct formatı.
2. Cihaz adı `NABIZ-` prefix'i (örn. `NABIZ-01`) — telefon taramada bunu filtreliyor.
3. HRV hesaplama **telefonda** yapılıyor — firmware sadece ham IBI akıtmalı, RMSSD/SDNN
   hesaplamasına gerek yok.
4. Kalibrasyon: firmware `START_CALIBRATION` (`0x01`) komutuna kısa referans örnekleme ile yanıt
   vermeli; kayan taban çizgisinin asıl hesabı telefonda (`PhysioBaselineEngine`), firmware'in
   baseline mantığını bilmesine gerek yok.
5. Donanım BOM'unda bilinen bir gedik: TP4056'nın çıkışı ham pil voltajı (3.0-4.2V), 3.3V değil —
   TP4056 ile ESP32'nin 3V3 hattı arasına bir LDO regülatör (AP2112K-3.3 veya MCP1700-3302E)
   eklenmesi gerekiyor, yoksa MPU6050'nin ~3.46V abs-max sınırı taze şarjda aşılabilir.

## 13. Bilinen açık noktalar / gelecek çalışma (dürüstçe, abartılmadan)

- GSR kanalı motion-gate edilmiyor (§5) — hareket-tabanlı artefakt reddi sadece PPG/IBI için var.
- Davranışsal sinyal hâlâ frekans-tabanlı bir yaklaşım — gerçek işlem tutarı/bahis miktarı okuma
  (erişilebilirlik ağacından) stretch-goal, yapılmadı.
- AccessibilityService → JS köprüsünde JS bridge henüz ayakta değilse olay kaybolabilir, kalıcı
  offline-kuyruk yok.
- 2-5dk füzyon penceresi klinik olarak validasyonu tam yapılmamış bir varsayım (literatürle
  tutarlı ama doğrudan test edilmemiş).
- `DiaryStore` şifreleme anahtarı sabit-kodlanmış, cihaza-özel anahtara geçirilmeli.
- Release APK imzalama debug keystore kullanıyor, gerçek dağıtım öncesi değiştirilmeli.
- Cihaz üzerinde gerçek BLE eşleştirme/canlı sensör testi henüz yapılmadı (donanım bekleniyor).

## 14. İlgili dosyalar / önceki araştırma

Aynı proje kapsamında, bu app'in dayandığı araştırma ve rapor serisi
`~/Masaüstü/stratos-root/` kökünde:
- `nabiz-kumarkalkani-hibrit-rapor.pdf/html` — tam teknik tasarım raporu (BOM, pinout, mockup'lar)
- `arastirma-dosyasi.pdf/html` — ÖDR şablonuna göre organize edilmiş bilimsel/regülatif kaynakça
- `nabiz-kumarkalkani-yapim-plani.pdf/html` — build-haftası operasyonel plan (bu dosyanın §11/§12
  içeriğinin kaynağı)
- `Bagimliliklarla_Mücadelede_Teknolojik_Uygulamalar_Sartnamesi_v1_3MQrt.pdf` — resmi şartname

Bu dosya bunların yerini tutmuyor — sadece **kod tabanının kendisinin** güncel, doğru bir
teknik dökümü. Ürün pitch'i/bilimsel gerekçe/rekabet analizi için yukarıdaki raporlara bakılmalı.
