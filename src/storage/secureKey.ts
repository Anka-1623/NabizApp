import 'react-native-get-random-values';
import * as Keychain from 'react-native-keychain';

// react-native-get-random-values tip tanımı içermiyor (bkz. node_modules), sadece global.crypto'ya
// getRandomValues ekliyor — RN'in tsconfig'i "dom" lib'i içermediği için burada yerel bildirim gerekiyor.
declare const crypto: { getRandomValues<T extends ArrayBufferView>(array: T): T };

// DiaryStore'un MMKV şifreleme anahtarını üretir/saklar. Anahtar hiçbir zaman kaynak kodda
// sabit-kodlanmaz veya ağa gönderilmez — Android Keystore / iOS Keychain'de cihaza özel saklanır,
// bu yüzden uygulamanın kendi dosyalarına erişebilen ama Keystore'u kıramayan bir saldırı günlük
// verisini okuyamaz.
const KEYCHAIN_SERVICE = 'com.nabizapp.diaryEncryptionKey';
const KEYCHAIN_USERNAME = 'nabiz-diary';
const KEY_BYTE_LENGTH = 32;

function generateRandomKeyHex(): string {
  const bytes = new Uint8Array(KEY_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** İlk çağrıda rastgele bir anahtar üretip Keychain'e yazar, sonraki çağrılarda aynısını okur. */
export async function getOrCreateDiaryEncryptionKey(): Promise<string> {
  const existing = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
  if (existing) {
    return existing.password;
  }

  const key = generateRandomKeyHex();
  await Keychain.setGenericPassword(KEYCHAIN_USERNAME, key, {
    service: KEYCHAIN_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}
