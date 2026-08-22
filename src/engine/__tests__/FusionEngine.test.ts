import { FusionEngine } from '../FusionEngine';
import { BehavioralRiskEvent, PhysioArousalState, Tier } from '../../types/nabiz';

function arousedState(atMs: number): PhysioArousalState {
  return { isAroused: true, zScoreIbi: 3, zScoreGsr: 3, hrBpm: 100, rmssdMs: 20, lastUpdatedMs: atMs };
}

function calmState(atMs: number): PhysioArousalState {
  return { isAroused: false, zScoreIbi: 0, zScoreGsr: 0, hrBpm: 70, rmssdMs: 40, lastUpdatedMs: atMs };
}

function riskEvent(atMs: number, patternScore: number): BehavioralRiskEvent {
  return {
    timestampMs: atMs,
    packageName: 'com.iddaa.android',
    domain: null,
    eventType: 'bet_pattern_detected',
    patternScore,
  };
}

describe('FusionEngine — Kademe (tier) mantığı, Bölüm 1-2/17', () => {
  it('hiçbir sinyal yokken Tier.NONE döner', () => {
    const engine = new FusionEngine();
    expect(engine.evaluate().tier).toBe(Tier.NONE);
  });

  it('sadece fizyolojik uyarılma varsa Kademe 1', () => {
    const engine = new FusionEngine();
    engine.updatePhysio(arousedState(Date.now()));
    expect(engine.evaluate().tier).toBe(Tier.T1_AWARENESS);
  });

  it('sadece davranışsal risk (yeterli örüntü skoruyla) varsa Kademe 2', () => {
    const engine = new FusionEngine();
    engine.updateBehavioral(riskEvent(Date.now(), 0.8));
    expect(engine.evaluate().tier).toBe(Tier.T2_FRICTION);
  });

  it('Bölüm 17/Bulgu 1 düzeltmesi: düşük örüntü skoru (salt "app açık") risk SAYILMAZ', () => {
    const engine = new FusionEngine();
    engine.updateBehavioral(riskEvent(Date.now(), 0.2)); // eşiğin (0.5) altında
    expect(engine.evaluate().tier).toBe(Tier.NONE);
  });

  it('fizyolojik uyarılma + davranışsal risk aynı pencerede çakışırsa Kademe 3', () => {
    const engine = new FusionEngine();
    const now = Date.now();
    engine.updatePhysio(arousedState(now));
    engine.updateBehavioral(riskEvent(now, 0.9));
    expect(engine.evaluate().tier).toBe(Tier.T3_FULL_INTERVENTION);
  });

  it('fizyolojik uyarılma pencere (3dk) dışına düşerse artık sayılmaz — kalan sadece davranışsal → Kademe 2', () => {
    const engine = new FusionEngine();
    const now = Date.now();
    const fourMinutesAgo = now - 4 * 60 * 1000;
    engine.updatePhysio(arousedState(fourMinutesAgo));
    engine.updateBehavioral(riskEvent(now, 0.9));
    expect(engine.evaluate().tier).toBe(Tier.T2_FRICTION);
  });

  it('sakin fizyolojik durum güncellemesi Kademe 1 tetiklemez', () => {
    const engine = new FusionEngine();
    engine.updatePhysio(calmState(Date.now()));
    expect(engine.evaluate().tier).toBe(Tier.NONE);
  });

  it('reset() sonrası tüm kademeler sıfırlanır', () => {
    const engine = new FusionEngine();
    const now = Date.now();
    engine.updatePhysio(arousedState(now));
    engine.updateBehavioral(riskEvent(now, 0.9));
    expect(engine.evaluate().tier).toBe(Tier.T3_FULL_INTERVENTION);
    engine.reset();
    expect(engine.evaluate().tier).toBe(Tier.NONE);
  });
});
