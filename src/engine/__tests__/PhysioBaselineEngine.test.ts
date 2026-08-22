import { PhysioBaselineEngine } from '../PhysioBaselineEngine';
import { PhysioSample } from '../../types/nabiz';

function sample(overrides: Partial<PhysioSample>): PhysioSample {
  return {
    timestampMs: Date.now(),
    ibiMs: 800,
    gsrRaw: 1000,
    tempC: 36,
    accelMagMilliG: 50, // düşük hareket — baseline penceresine girer
    sampleCount: 1,
    ...overrides,
  };
}

describe('PhysioBaselineEngine — kayan taban çizgisi + z-skoru, Bölüm 17/Bulgu 3', () => {
  it('yeterli örnek (30+) toplanana kadar kalibre edilmiş sayılmaz', () => {
    const engine = new PhysioBaselineEngine();
    for (let i = 0; i < 10; i++) {
      engine.ingest(sample({ timestampMs: Date.now() - 600_000 + i * 100 }));
    }
    expect(engine.getBaseline().isCalibrated).toBe(false);
    expect(engine.computeArousalState().isAroused).toBe(false);
  });

  it('30+ düşük-hareket örneğiyle taban çizgisi kalibre olur', () => {
    const engine = new PhysioBaselineEngine();
    const tenMinAgo = Date.now() - 600_000;
    for (let i = 0; i < 35; i++) {
      engine.ingest(sample({ timestampMs: tenMinAgo + i * 100, ibiMs: 800, gsrRaw: 1000 }));
    }
    const baseline = engine.getBaseline();
    expect(baseline.isCalibrated).toBe(true);
    expect(baseline.rollingIbiMean).toBeCloseTo(800, 5);
    expect(baseline.rollingGsrMean).toBeCloseTo(1000, 5);
  });

  it('taban çizgisinden büyük sapma varsa uyarılma (isAroused) tespit edilir', () => {
    const engine = new PhysioBaselineEngine();
    const tenMinAgo = Date.now() - 600_000;
    for (let i = 0; i < 35; i++) {
      engine.ingest(sample({ timestampMs: tenMinAgo + i * 100, ibiMs: 800, gsrRaw: 1000 }));
    }
    // Yüksek hareket (accelMag=300) → bu örnek baseline'a KARIŞMAZ, sadece kısa-vadeli
    // tampona girer — kendi kendini kirletmeden saf bir z-skoru testi.
    engine.ingest(
      sample({ timestampMs: Date.now(), ibiMs: 600, gsrRaw: 1400, accelMagMilliG: 300 }),
    );
    const state = engine.computeArousalState();
    expect(state.isAroused).toBe(true);
    expect(state.zScoreIbi).toBeGreaterThan(2);
    expect(state.zScoreGsr).toBeGreaterThan(2);
  });

  it('RMSSD ve anlık nabız (HR), kısa-vadeli IBI tamponundan doğru hesaplanır', () => {
    const engine = new PhysioBaselineEngine();
    const tenMinAgo = Date.now() - 600_000;
    for (let i = 0; i < 35; i++) {
      engine.ingest(sample({ timestampMs: tenMinAgo + i * 100, ibiMs: 800, gsrRaw: 1000 }));
    }
    const now = Date.now();
    // accelMag=300 → baseline'ı bozmaz, sadece RMSSD/HR hesabı için kısa-vadeli tamponu besler.
    engine.ingest(sample({ timestampMs: now - 2000, ibiMs: 800, accelMagMilliG: 300 }));
    engine.ingest(sample({ timestampMs: now - 1000, ibiMs: 820, accelMagMilliG: 300 }));
    engine.ingest(sample({ timestampMs: now, ibiMs: 780, accelMagMilliG: 300 }));

    const state = engine.computeArousalState();
    // RMSSD([800,820,780]) = sqrt(mean([20^2, (-40)^2])) = sqrt(1000) ≈ 31.6227766
    expect(state.rmssdMs).toBeCloseTo(31.6227766, 4);
    // ortalama IBI = 800ms → HR = 60000/800 = 75 bpm
    expect(state.hrBpm).toBe(75);
  });

  it('reset() taban çizgisini ve tamponları temizler', () => {
    const engine = new PhysioBaselineEngine();
    const tenMinAgo = Date.now() - 600_000;
    for (let i = 0; i < 35; i++) {
      engine.ingest(sample({ timestampMs: tenMinAgo + i * 100 }));
    }
    expect(engine.getBaseline().isCalibrated).toBe(true);
    engine.reset();
    expect(engine.getBaseline().isCalibrated).toBe(false);
  });
});
