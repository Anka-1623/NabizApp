import { createMMKV } from 'react-native-mmkv';
import { DiaryEntry, Tier } from '../types/nabiz';

// react-native-mmkv (v4, Nitro tabanlı) şifreli depolama — process-and-discard tasarımı:
// ham sensör verisi (IBI/GSR/sıcaklık akışı) HİÇ diske yazılmaz, sadece kademe+zaman damgası kalır.
// Bu, KVKK biyometrik-veri riskini en aza indirir (bkz. proje memory'sindeki regülatör bulguları).
const storage = createMMKV({
  id: 'nabiz-diary',
  encryptionKey: 'nabiz-local-diary-v1', // TODO: build öncesi cihaza-özel/keychain-türetilmiş anahtarla değiştirin
});

const ENTRIES_KEY = 'diary_entries_v1';

function readAll(): DiaryEntry[] {
  const raw = storage.getString(ENTRIES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DiaryEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: DiaryEntry[]): void {
  storage.set(ENTRIES_KEY, JSON.stringify(entries));
}

export const DiaryStore = {
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
    storage.remove(ENTRIES_KEY);
  },
};
