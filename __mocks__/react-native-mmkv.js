// Jest manual mock — MMKV v4 Nitro-modules JSI'ye dayanıyor, Node/JSDOM test ortamında native
// tarafı yok. Basit bir bellek-içi Map ile string get/set/remove davranışını taklit eder.
function createMMKV() {
  const store = new Map();
  return {
    set: (key, value) => store.set(key, String(value)),
    getString: (key) => store.get(key),
    getBoolean: (key) => (store.has(key) ? store.get(key) === 'true' : undefined),
    getNumber: (key) => (store.has(key) ? Number(store.get(key)) : undefined),
    remove: (key) => store.delete(key),
    clearAll: () => store.clear(),
  };
}

module.exports = { createMMKV };
