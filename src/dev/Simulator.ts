import { physioBaselineEngine } from '../engine/PhysioBaselineEngine';
import { fusionEngine } from '../engine/FusionEngine';
import { useNabizStore } from '../store/useNabizStore';
import { PhysioSample } from '../types/nabiz';

/**
 * SADECE GELİŞTİRME ORTAMI İÇİN — bant henüz hazır olmadan (donanım/yazılım paralel Build/Rapor
 * takvimi, bkz. yapım planı) FusionEngine + Home/Intervention ekranlarını uçtan uca test etmeyi
 * sağlar. `__DEV__` false olduğunda (release/sideload APK) bu modülün UI tetikleyicisi
 * HomeScreen'de hiç render edilmez — gerçek jüri demosuna sahte-veri düğmesi karışmaz.
 */

function lowMotionSample(overrides: Partial<PhysioSample> = {}, atMs: number): PhysioSample {
  return {
    timestampMs: atMs,
    ibiMs: 800,
    gsrRaw: 1000,
    tempC: 36,
    accelMagMilliG: 1000,
    sampleCount: 1,
    ...overrides,
  };
}

/** Kayan taban çizgisini anında kalibre eder (gerçek 2dk dinlenme kalibrasyonunu atlar). */
export function primeBaseline(): void {
  physioBaselineEngine.reset();
  const tenMinAgo = Date.now() - 600_000;
  for (let i = 0; i < 35; i++) {
    physioBaselineEngine.ingest(lowMotionSample({}, tenMinAgo + i * 100));
  }
  refreshStoreFusion();
}

function refreshStoreFusion(): void {
  useNabizStore.setState({ fusion: fusionEngine.evaluate() });
}

/** Fizyolojik uyarılmayı simüle eder (Kademe 1 — davranışsal sinyal yok). */
export function simulateArousalOnly(): void {
  primeBaseline();
  const now = Date.now();
  physioBaselineEngine.ingest(
    lowMotionSample({ ibiMs: 600, gsrRaw: 1400, accelMagMilliG: 300 }, now),
  );
  fusionEngine.updatePhysio(physioBaselineEngine.computeArousalState());
  refreshStoreFusion();
}

/** Davranışsal riski simüle eder (Kademe 2 — fizyolojik sinyal yok). */
export function simulateBehavioralOnly(): void {
  fusionEngine.updateBehavioral({
    timestampMs: Date.now(),
    packageName: 'com.iddaa.android',
    domain: null,
    eventType: 'bet_pattern_detected',
    patternScore: 0.9,
  });
  refreshStoreFusion();
}

/** İki sinyalin aynı pencerede çakışmasını simüle eder (Kademe 3 — tam müdahale). */
export function simulateFullCrisis(): void {
  primeBaseline();
  const now = Date.now();
  physioBaselineEngine.ingest(
    lowMotionSample({ ibiMs: 550, gsrRaw: 1600, accelMagMilliG: 300 }, now),
  );
  fusionEngine.updatePhysio(physioBaselineEngine.computeArousalState());
  fusionEngine.updateBehavioral({
    timestampMs: now,
    packageName: 'com.nesine.android',
    domain: null,
    eventType: 'bet_pattern_detected',
    patternScore: 0.95,
  });
  refreshStoreFusion();
}

/** Her şeyi sakin duruma sıfırlar. */
export function simulateCalm(): void {
  fusionEngine.reset();
  physioBaselineEngine.reset();
  refreshStoreFusion();
}
