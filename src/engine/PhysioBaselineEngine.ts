import type { PhysioArousalState, PhysioBaselineState, PhysioSample } from '../types/nabiz';

// Bölüm 17/Bulgu 3 (teammate audit): tek seferlik sabit kalibrasyon yerine KAYAN taban çizgisi.
// Son 24-48 saatteki düşük-hareket pencerelerinden ortalama alınır, günlük güncellenir.
const BASELINE_WINDOW_MS = 48 * 60 * 60 * 1000;
// NabizFirmware/SensorHub.h kMotionGateMg ile aynı sabit ve aynı yerçekimi-ofsetli karşılaştırma:
// dinlenme durumunda ivme büyüklüğü ~1000mg'dir (1g), 0 değil — |accel-1000mg| eşiği kullanılmalı.
const LOW_MOTION_ACCEL_THRESHOLD_MG = 150;
const REST_ACCEL_MAG_MG = 1000;
const MIN_BASELINE_SAMPLES = 30; // ilk ~2dk dinlenme kalibrasyonunun kabaca karşılığı
const AROUSAL_Z_THRESHOLD = 2.0; // 2 sigma — kalibre edilebilir sabit, sabit mutlak eşik DEĞİL

// Son ~60sn'lik örneklerden RMSSD/SDNN hesabı için tampon boyu (batch aralığı 1-5sn => ~12-60 örnek)
const RECENT_WINDOW_MS = 60_000;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[], m: number): number {
  if (values.length < 2) return 0;
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

/** Ardışık IBI farklarının RMS'i (Root Mean Square of Successive Differences). */
function computeRmssd(ibiValues: number[]): number | null {
  if (ibiValues.length < 2) return null;
  const diffs: number[] = [];
  for (let i = 1; i < ibiValues.length; i++) {
    diffs.push((ibiValues[i] - ibiValues[i - 1]) ** 2);
  }
  return Math.sqrt(mean(diffs));
}

/**
 * Kişisel fizyolojik taban çizgisi + güncel uyarılma durumu.
 * NOT (dürüst mühendislik sınırı, Bölüm 17/Bulgu 1): ivme-tabanlı hareket filtrelemesi PPG/IBI
 * artefaktını iyi temizler, ama araştırma EDA/GSR artefakt tespitini AYNI şekilde iyileştirmiyor
 * (bir kıyaslamada ivme özellikleri denetimsiz EDA-artefakt tespitini ~4.3% AUC düşürüyor).
 * Bu yüzden burada GSR kanalı motion-gate edilmiyor — bu, 6-8 haftalık pencerede "gelecek çalışma"
 * olarak bırakılan bilinen bir sınır, basit bir "hareket varsa GSR'yi yoksay" kuralı YAZILMADI.
 */
export class PhysioBaselineEngine {
  private baseline: PhysioBaselineState = {
    isCalibrated: false,
    calibratedAtMs: null,
    rollingIbiMean: 0,
    rollingIbiStd: 0,
    rollingGsrMean: 0,
    rollingGsrStd: 0,
    windowSamples: [],
  };

  private recentSamples: PhysioSample[] = [];

  reset(): void {
    this.baseline = {
      isCalibrated: false,
      calibratedAtMs: null,
      rollingIbiMean: 0,
      rollingIbiStd: 0,
      rollingGsrMean: 0,
      rollingGsrStd: 0,
      windowSamples: [],
    };
    this.recentSamples = [];
  }

  getBaseline(): PhysioBaselineState {
    return this.baseline;
  }

  /** Her yeni PhysioSample geldiğinde çağrılır — hem baseline penceresini hem kısa-vadeli tamponu günceller. */
  ingest(sample: PhysioSample): void {
    // Kısa vadeli tampon (RMSSD/SDNN + anlık z-skoru için)
    this.recentSamples.push(sample);
    this.recentSamples = this.recentSamples.filter(
      (s) => sample.timestampMs - s.timestampMs <= RECENT_WINDOW_MS,
    );

    // Baseline penceresi: sadece düşük-hareket örnekleri, trailing 48s
    if (Math.abs(sample.accelMagMilliG - REST_ACCEL_MAG_MG) <= LOW_MOTION_ACCEL_THRESHOLD_MG) {
      this.baseline.windowSamples.push(sample);
    }
    this.baseline.windowSamples = this.baseline.windowSamples.filter(
      (s) => sample.timestampMs - s.timestampMs <= BASELINE_WINDOW_MS,
    );

    if (this.baseline.windowSamples.length >= MIN_BASELINE_SAMPLES) {
      const ibiValues = this.baseline.windowSamples.map((s) => s.ibiMs);
      const gsrValues = this.baseline.windowSamples.map((s) => s.gsrRaw);
      this.baseline.rollingIbiMean = mean(ibiValues);
      this.baseline.rollingIbiStd = stddev(ibiValues, this.baseline.rollingIbiMean) || 1;
      this.baseline.rollingGsrMean = mean(gsrValues);
      this.baseline.rollingGsrStd = stddev(gsrValues, this.baseline.rollingGsrMean) || 1;
      this.baseline.isCalibrated = true;
      this.baseline.calibratedAtMs ??= sample.timestampMs;
    }
  }

  /** Güncel uyarılma durumunu kişisel taban çizgisine göre z-skoru olarak hesaplar (mutlak eşik değil). */
  computeArousalState(): PhysioArousalState {
    const now = Date.now();
    if (!this.baseline.isCalibrated || this.recentSamples.length === 0) {
      return {
        isAroused: false,
        zScoreIbi: 0,
        zScoreGsr: 0,
        hrBpm: null,
        rmssdMs: null,
        lastUpdatedMs: now,
      };
    }

    const ibiValues = this.recentSamples.map((s) => s.ibiMs);
    const gsrValues = this.recentSamples.map((s) => s.gsrRaw);
    const recentIbiMean = mean(ibiValues);
    const recentGsrMean = mean(gsrValues);

    // IBI düşüşü = HR artışı = uyarılma yönü, bu yüzden ters işaretle z-skoru pozitif olacak şekilde çeviriyoruz
    const zScoreIbi = (this.baseline.rollingIbiMean - recentIbiMean) / this.baseline.rollingIbiStd;
    const zScoreGsr = (recentGsrMean - this.baseline.rollingGsrMean) / this.baseline.rollingGsrStd;

    const isAroused = zScoreIbi >= AROUSAL_Z_THRESHOLD || zScoreGsr >= AROUSAL_Z_THRESHOLD;

    return {
      isAroused,
      zScoreIbi,
      zScoreGsr,
      hrBpm: recentIbiMean > 0 ? Math.round(60000 / recentIbiMean) : null,
      rmssdMs: computeRmssd(ibiValues),
      lastUpdatedMs: now,
    };
  }
}

export const physioBaselineEngine = new PhysioBaselineEngine();
