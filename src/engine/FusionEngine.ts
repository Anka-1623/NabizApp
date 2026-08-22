import {
  BehavioralRiskEvent,
  BehavioralRiskState,
  FusionResult,
  PhysioArousalState,
  Tier,
} from '../types/nabiz';

// Zaman-pencereli AND mantığı: iki sinyal AYNI 2-5dk pencerede çakışırsa Kademe 3.
// Bkz. hibrit rapor Bölüm 1-2, yapım planı Bölüm 4.
const FUSION_WINDOW_MS = 3 * 60 * 1000; // 3dk — spektrumun (2-5dk) orta noktası, kalibre edilebilir

// Davranışsal risk için minimum örüntü skoru — SALT "app açık" boole değil (Bölüm 17/Bulgu 1 düzeltmesi).
// ContentClassifier/pattern-frekans skorunun normalize hali (0-1); bu eşiğin altı sadece "app_foreground"
// log'lanır ama risk sayılmaz.
const BEHAVIORAL_PATTERN_SCORE_THRESHOLD = 0.5;

/**
 * İki bağımsız dedektörü birleştirir. Kritik mühendislik kararı (Bölüm 1): dedektörler birbirinden
 * bağımsız çalışır, sadece burada buluşur — biri arızalansa/gürültülü olsa bile diğeri tek başına
 * daha zayıf bir kademede devam eder.
 */
export class FusionEngine {
  private lastArousalTimestampMs: number | null = null;
  private lastPhysioState: PhysioArousalState | null = null;
  private lastRiskEvent: BehavioralRiskEvent | null = null;
  private recentEvents: BehavioralRiskEvent[] = [];

  updatePhysio(state: PhysioArousalState): void {
    this.lastPhysioState = state;
    if (state.isAroused) {
      this.lastArousalTimestampMs = state.lastUpdatedMs;
    }
  }

  updateBehavioral(event: BehavioralRiskEvent): void {
    this.recentEvents.push(event);
    this.recentEvents = this.recentEvents.filter(
      (e) => event.timestampMs - e.timestampMs <= FUSION_WINDOW_MS,
    );
    if (event.patternScore >= BEHAVIORAL_PATTERN_SCORE_THRESHOLD) {
      this.lastRiskEvent = event;
    }
  }

  private computeBehavioralState(nowMs: number): BehavioralRiskState {
    const isRisky =
      this.lastRiskEvent !== null && nowMs - this.lastRiskEvent.timestampMs <= FUSION_WINDOW_MS;
    return {
      isRisky,
      lastEvent: this.lastRiskEvent,
      recentEventCount: this.recentEvents.length,
    };
  }

  evaluate(): FusionResult {
    const nowMs = Date.now();
    const behavioral = this.computeBehavioralState(nowMs);
    const physioActive =
      this.lastArousalTimestampMs !== null && nowMs - this.lastArousalTimestampMs <= FUSION_WINDOW_MS;

    let tier = Tier.NONE;
    if (physioActive && behavioral.isRisky) {
      tier = Tier.T3_FULL_INTERVENTION;
    } else if (physioActive) {
      tier = Tier.T1_AWARENESS;
    } else if (behavioral.isRisky) {
      tier = Tier.T2_FRICTION;
    }

    return {
      tier,
      timestampMs: nowMs,
      physio: this.lastPhysioState ?? {
        isAroused: false,
        zScoreIbi: 0,
        zScoreGsr: 0,
        hrBpm: null,
        rmssdMs: null,
        lastUpdatedMs: nowMs,
      },
      behavioral,
      windowMs: FUSION_WINDOW_MS,
    };
  }

  reset(): void {
    this.lastArousalTimestampMs = null;
    this.lastPhysioState = null;
    this.lastRiskEvent = null;
    this.recentEvents = [];
  }
}

export const fusionEngine = new FusionEngine();
