// Jest manual mock — gerçek paket native RNGetRandomValues modülünü çağırır (test ortamında yok).
// Node 19+'ın kendi global crypto.getRandomValues'u zaten mevcut, bu yüzden burada no-op yeterli.
module.exports = {};
