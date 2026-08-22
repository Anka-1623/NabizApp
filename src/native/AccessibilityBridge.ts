import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { BehavioralRiskEvent } from '../types/nabiz';

// Native modül tarafı: android/app/src/main/java/com/nabizapp/accessibility/AccessibilityBridgeModule.kt
// AccessibilityService JS'te YAZILAMAZ (Android'in kendi API'si) — bu ince TS sarmalayıcı,
// native Kotlin servisinin event'lerini NativeEventEmitter üzerinden dinler.
interface AccessibilityBridgeNativeModule {
  isAccessibilityServiceEnabled(): Promise<boolean>;
  openAccessibilitySettings(): void;
}

const { AccessibilityBridgeModule } = NativeModules as {
  AccessibilityBridgeModule?: AccessibilityBridgeNativeModule;
};

const EVENT_BETTING_RISK = 'NabizAccessibilityBettingRisk';

export type BettingRiskListener = (event: BehavioralRiskEvent) => void;

class AccessibilityBridge {
  private emitter: NativeEventEmitter | null =
    Platform.OS === 'android' && AccessibilityBridgeModule
      ? new NativeEventEmitter(NativeModules.AccessibilityBridgeModule)
      : null;

  isAvailable(): boolean {
    return Platform.OS === 'android' && AccessibilityBridgeModule != null;
  }

  async isServiceEnabled(): Promise<boolean> {
    if (!AccessibilityBridgeModule) return false;
    return AccessibilityBridgeModule.isAccessibilityServiceEnabled();
  }

  /** Kullanıcıyı Ayarlar > Erişilebilirlik ekranına yönlendirir — servis Android'de manuel açılmalı. */
  openSettings(): void {
    AccessibilityBridgeModule?.openAccessibilitySettings();
  }

  subscribe(listener: BettingRiskListener): () => void {
    if (!this.emitter) return () => {};
    const sub = this.emitter.addListener(EVENT_BETTING_RISK, (payload: BehavioralRiskEvent) => {
      listener(payload);
    });
    return () => sub.remove();
  }
}

export const accessibilityBridge = new AccessibilityBridge();
