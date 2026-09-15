// Jest manual mock — Keychain/Keystore native tarafı test ortamında yok. Bellek-içi bir Map ile
// service bazlı get/set davranışını taklit eder, secureKey.ts'in init akışını test edilebilir kılar.
const store = new Map();

const ACCESSIBLE = {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly',
};

async function setGenericPassword(username, password, options) {
  store.set(options?.service ?? 'default', { username, password });
  return true;
}

async function getGenericPassword(options) {
  const entry = store.get(options?.service ?? 'default');
  return entry ? { username: entry.username, password: entry.password, service: options?.service } : false;
}

async function resetGenericPassword(options) {
  return store.delete(options?.service ?? 'default');
}

module.exports = { ACCESSIBLE, setGenericPassword, getGenericPassword, resetGenericPassword };
