import { createMMKV, type MMKV } from 'react-native-mmkv';
import { DiaryEntry, Tier } from '../types/nabiz';
import { getOrCreateDiaryEncryptionKey } from './secureKey';

// react-native-mmkv (v4, Nitro tabanlı) şifreli depolama — process-and-discard tasarımı:
// ham sensör verisi (IBI/GSR/sıcaklık akışı) HİÇ diske yazılmaz, sadece kademe+zaman damgası kalır.
// Bu, KVKK biyometrik-veri riskini en aza indirir (bkz. proje memory'sindeki regülatör bulguları).
//
// Şifreleme anahtarı Keychain'den geldiği için (bkz. secureKey.ts) createMMKV çağrısı async bir
// init() arkasında — App.tsx açılışta bunu bekleyip storage hazır olmadan navigator'ı render etmiyor,
// bu yüzden aşağıdaki metodlar init() sonrası hep senkron kalabiliyor.
const ENTRIES_KEY = 'diary_entries_v1';
const CONSENT_KEY = 'consent_given_v1';

let storage: MMKV | null = null;
let initPromise: Promise<void> | null = null;

function init(): Promise<void> {
  if (!initPromise) {
    initPromise = getOrCreateDiaryEncryptionKey().then(encryptionKey => {
      storage = createMMKV({ id: 'nabiz-diary', encryptionKey });
    });
  }
  return initPromise;
}

function requireStorage(): MMKV {
  if (!storage) {
    throw new Error('DiaryStore kullanılmadan önce init() tamamlanmalı — App.tsx açılış sırasını kontrol edin.');
  }
  return storage;
}

function readAll(): DiaryEntry[] {
  const raw = requireStorage().getString(ENTRIES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DiaryEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: DiaryEntry[]): void {
  requireStorage().set(ENTRIES_KEY, JSON.stringify(entries));
}

export const DiaryStore = {
  /** App.tsx açılışta bir kez çağırmalı — çözülene kadar diğer metodlar throw eder. */
  init,

  /** Bir füzyon sonucunu günlüğe kaydeder — SADECE kademe+zaman(+opsiyonel etiket/not), ham veri yok. */
  logTierEvent(tier: Tier, userLabel?: DiaryEntry['userLabel'], note?: string): DiaryEntry {
    const entry: DiaryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestampMs: Date.now(),
      tier,
      userLabel: userLabel ?? null,
      note,
    };
    const entries = readAll();
    entries.push(entry);
    writeAll(entries);
    return entry;
  },

  getAll(): DiaryEntry[] {
    return readAll().sort((a, b) => b.timestampMs - a.timestampMs);
  },

  /** Nüks-risk paneli için: son N günde kademe bazlı tetiklenme sayıları. */
  getRelapseRiskSummary(days = 7): Record<Tier, number> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const summary: Record<Tier, number> = {
      [Tier.NONE]: 0,
      [Tier.T1_AWARENESS]: 0,
      [Tier.T2_FRICTION]: 0,
      [Tier.T3_FULL_INTERVENTION]: 0,
    };
    for (const entry of readAll()) {
      if (entry.timestampMs >= cutoff) {
        summary[entry.tier] += 1;
      }
    }
    return summary;
  },

  clearAll(): void {
    requireStorage().remove(ENTRIES_KEY);
  },

  /** OnboardingConsentScreen'in iki switch'i — bir kez verilince her açılışta tekrar sorulmasın.
   *  Aynı şifreli MMKV örneğini kullanıyor (ayrı bir store açmaya değmeyecek kadar küçük bir bayrak). */
  hasConsent(): boolean {
    return requireStorage().getBoolean(CONSENT_KEY) ?? false;
  },

  setConsent(value: boolean): void {
    requireStorage().set(CONSENT_KEY, value);
  },
};
