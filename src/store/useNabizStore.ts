import { create } from 'zustand';
import { nabizBle, BleConnectionStatus } from '../ble/BleManager';
import { BandEventCode } from '../ble/protocol';
import { accessibilityBridge } from '../native/AccessibilityBridge';
import { physioBaselineEngine } from '../engine/PhysioBaselineEngine';
import { fusionEngine } from '../engine/FusionEngine';
import { DiaryStore } from '../storage/DiaryStore';
import { BehavioralRiskEvent, FusionResult, Tier } from '../types/nabiz';

interface NabizState {
  bleStatus: BleConnectionStatus;
  bandLowBattery: boolean;
  accessibilityEnabled: boolean;
  fusion: FusionResult;
  consentGiven: boolean;
  started: boolean;

  giveConsent: () => void;
  start: () => Promise<void>;
  refreshAccessibilityStatus: () => Promise<void>;
  requestCalibration: () => Promise<void>;
  acknowledgeIntervention: (label?: 'nervous' | 'excited' | 'neutral' | 'craving') => void;
  /** Ana ekrandaki uzaktan kademe düğmeleri için — gerçek bandı da o kademeye geçirir. */
  setBandTier: (tierIndex: number) => Promise<void>;
}

const initialFusion: FusionResult = {
  tier: Tier.NONE,
  timestampMs: Date.now(),
  physio: { isAroused: false, zScoreIbi: 0, zScoreGsr: 0, hrBpm: null, rmssdMs: null, lastUpdatedMs: Date.now() },
  behavioral: { isRisky: false, lastEvent: null, recentEventCount: 0 },
  windowMs: 3 * 60 * 1000,
};

let evaluationInterval: ReturnType<typeof setInterval> | null = null;
let unsubscribeAccessibility: (() => void) | null = null;
let lastLoggedTier: Tier = Tier.NONE;

export const useNabizStore = create<NabizState>((set, get) => ({
  bleStatus: 'idle',
  bandLowBattery: false,
  accessibilityEnabled: false,
  fusion: initialFusion,
  consentGiven: false,
  started: false,

  giveConsent: () => {
    DiaryStore.setConsent(true);
    set({ consentGiven: true });
  },

  refreshAccessibilityStatus: async () => {
    const enabled = await accessibilityBridge.isServiceEnabled();
    set({ accessibilityEnabled: enabled });
  },

  requestCalibration: async () => {
    physioBaselineEngine.reset();
    await nabizBle.startCalibration(); // fırlarsa çağıran taraf (HomeScreen) yakalayıp kullanıcıya gösterir
  },

  acknowledgeIntervention: (label) => {
    const { fusion } = get();
    DiaryStore.logTierEvent(fusion.tier, label ?? null);
    fusionEngine.reset();
    set({ fusion: fusionEngine.evaluate() });
  },

  setBandTier: async (tierIndex) => {
    await nabizBle.setTier(tierIndex); // fırlarsa çağıran taraf (HomeScreen) yakalayıp gösterir
  },

  start: async () => {
    if (get().started) return;
    set({ started: true });

    nabizBle.setStatusListener((status) => {
      // Yeni bağlantı kurulunca eski düşük-pil uyarısını temizle — band değişmiş/şarj edilmiş olabilir,
      // gerçek durum bir sonraki LOW_BATTERY event'iyle zaten güncellenecek.
      if (status === 'connected') {
        set({ bleStatus: status, bandLowBattery: false });
      } else {
        set({ bleStatus: status });
      }
    });
    nabizBle.setPhysioListener((sample) => {
      physioBaselineEngine.ingest(sample);
      fusionEngine.updatePhysio(physioBaselineEngine.computeArousalState());
    });
    nabizBle.setEventListener((event) => {
      if (event.code === BandEventCode.LOW_BATTERY) {
        set({ bandLowBattery: true });
      } else if (event.code === BandEventCode.MANUAL_BUTTON_LABEL && event.label !== undefined) {
        // Bandın K1 ekranındaki etiket çiplerine dokunulunca gelir — mobil InterventionScreen'in
        // dismiss(label) çağrısıyla aynı DiaryStore girişini üretir, ama fusionEngine.reset()
        // ÇAĞIRMAZ: bu event telefonun kendi fusion.tier'ından bağımsız (bant kendi Kademe 1
        // ekranına gizli köşe jestiyle de girmiş olabilir), bu yüzden pasif bir günlük kaydı
        // yeterli (bkz. Bölüm 17/Bulgu 1).
        const LABELS = ['nervous', 'excited', 'neutral'] as const;
        DiaryStore.logTierEvent(Tier.T1_AWARENESS, LABELS[event.label] ?? null);
      }
      // CALIBRATION_STARTED/COMPLETE — ilk prototipte pasif log yeterli, henüz UI'a bağlı değil.
    });

    unsubscribeAccessibility = accessibilityBridge.subscribe((event: BehavioralRiskEvent) => {
      fusionEngine.updateBehavioral(event);
    });

    try {
      await get().refreshAccessibilityStatus();
    } catch {
      // erişilebilirlik servisi durumu okunamadı — HomeScreen 'Kapalı' göstermeye devam eder
    }

    try {
      await nabizBle.scanAndConnect();
    } catch {
      // BleConnectionStatus zaten 'error' olarak yansıtıldı — HomeScreen kullanıcıya yeniden dene sunar
    }

    // Füzyon sonucunu 2sn'de bir değerlendir, kademe değiştiğinde günlüğe yaz.
    evaluationInterval = setInterval(() => {
      const result = fusionEngine.evaluate();
      set({ fusion: result });
      if (result.tier !== Tier.NONE && result.tier !== lastLoggedTier) {
        DiaryStore.logTierEvent(result.tier);
      }
      lastLoggedTier = result.tier;
    }, 2000);
  },
}));

export function stopNabizStore(): void {
  if (evaluationInterval) clearInterval(evaluationInterval);
  unsubscribeAccessibility?.();
  nabizBle.destroy();
}
