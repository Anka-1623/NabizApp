// Jest manual mock — gerçek BLE native modülü test ortamında (Node/JSDOM) mevcut değil.
// Bu, `NabizBleManager` singleton'ının modül import anında çökmeden yüklenebilmesini sağlar;
// gerçek BLE davranışı sadece gerçek bir Android cihazda/emülatörde test edilebilir.
class BleManager {
  state() {
    return Promise.resolve('PoweredOn');
  }
  onStateChange() {
    return { remove: () => {} };
  }
  startDeviceScan() {}
  stopDeviceScan() {}
  destroy() {}
}

const State = {
  Unknown: 'Unknown',
  Resetting: 'Resetting',
  Unsupported: 'Unsupported',
  Unauthorized: 'Unauthorized',
  PoweredOff: 'PoweredOff',
  PoweredOn: 'PoweredOn',
};

module.exports = { BleManager, State };
