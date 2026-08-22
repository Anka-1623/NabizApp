// Kademe (tier) enum used across FusionEngine, InterventionUI ve DiaryStore.
// Bkz. hibrit rapor Bölüm 1-2 ve yapım planı Bölüm 4.
export enum Tier {
  NONE = 0,
  T1_AWARENESS = 1, // sadece fizyolojik uyarılma
  T2_FRICTION = 2, // sadece davranışsal (bahis app/site açık)
  T3_FULL_INTERVENTION = 3, // ikisi aynı 2-5dk pencerede çakıştı
}

export interface PhysioSample {
  timestampMs: number;
  ibiMs: number; // ham nabız-arası aralık (RMSSD/SDNN telefonda hesaplanır)
  gsrRaw: number; // 0-4095 ADC
  tempC: number;
  accelMagMilliG: number;
  sampleCount: number; // bu batch'te kaç ham örnek aggregate edildi
}

export interface PhysioBaselineState {
  isCalibrated: boolean;
  calibratedAtMs: number | null;
  rollingIbiMean: number;
  rollingIbiStd: number;
  rollingGsrMean: number;
  rollingGsrStd: number;
  windowSamples: PhysioSample[]; // son 24-48s düşük-hareket penceresi (bkz. Bölüm 17/Bulgu 3)
}

export interface PhysioArousalState {
  isAroused: boolean;
  zScoreIbi: number;
  zScoreGsr: number;
  hrBpm: number | null;
  rmssdMs: number | null;
  lastUpdatedMs: number;
}

// Davranışsal sinyal: salt "app açık" boole değil, bahis örüntüsü (sıklık/tutar/art arda işlem).
// Bkz. Bölüm 17/Bulgu 1 — teammate audit'te düzeltilen nokta.
export interface BehavioralRiskEvent {
  timestampMs: number;
  packageName: string;
  domain: string | null;
  eventType: 'app_foreground' | 'bet_pattern_detected' | 'sms_keyword_match';
  patternScore: number; // 0-1, ContentClassifier/pattern-frekans skorunun normalize hali
}

export interface BehavioralRiskState {
  isRisky: boolean;
  lastEvent: BehavioralRiskEvent | null;
  recentEventCount: number; // son pencuredeki olay sayısı
}

export interface FusionResult {
  tier: Tier;
  timestampMs: number;
  physio: PhysioArousalState;
  behavioral: BehavioralRiskState;
  windowMs: number;
}

export interface DiaryEntry {
  id: string;
  timestampMs: number;
  tier: Tier;
  userLabel?: 'nervous' | 'excited' | 'neutral' | 'craving' | null; // borderline z-skor etiketleme, Bölüm 17/Bulgu 1
  note?: string;
}

export const KNOWN_BETTING_PACKAGES: string[] = [
  'com.iddaa.android',
  'com.nesine.android',
  'com.misli.android',
  'com.tuttur.android',
  'com.bilyoner.android',
];

// Bahis-mirror alan-adı örüntüleri (statik liste + regex fallback) — Bölüm 4 dosyasında tarif edilen
// Turkish gambling keyword seed vocabulary (round-3 NLP araştırması).
export const BETTING_DOMAIN_KEYWORDS: string[] = [
  'bahis',
  'casino',
  'canlı bahis',
  'canlı casino',
  'bet',
  'iddaa',
  'nesine',
  'misli',
  'youwin',
  'mobilbahis',
];

export const BETTING_TEXT_KEYWORDS: string[] = [
  'canlı bahis',
  'canlı casino',
  'hoşgeldin bonusu',
  'çevrim şartı',
  'deneme bonusu',
  'yatırım bonusu',
  'kayıp bonusu',
  'güncel giriş',
  'resmi giriş adresi',
  'alternatif site',
  'kesintisiz erişim',
];
