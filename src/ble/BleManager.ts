import { BleManager as PlxManager, Device, State, Subscription } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  NABIZ_SERVICE_UUID,
  CHAR_PHYSIO_UUID,
  CHAR_EVENT_UUID,
  CHAR_CONFIG_UUID,
  NABIZ_DEVICE_NAME_PREFIX,
  decodePhysioPacket,
  decodeBandEvent,
  encodeStartCalibration,
  encodeSetTier,
} from './protocol';
import type { BandEvent } from './protocol';
import type { PhysioSample } from '../types/nabiz';

export type BleConnectionStatus =
  | 'idle'
  | 'requesting_permissions'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

/**
 * Tek GATT bağlantısını açık tutan sarmalayıcı — yapım planı Bölüm 4'te tarif edilen
 * "tara-bağlan döngüsü yok" prensibi: bağlantı koptuğunda otomatik yeniden bağlanmayı dener,
 * sürekli yeni tarama başlatmaz.
 */
export class NabizBleManager {
  private plx = new PlxManager();
  private device: Device | null = null;
  private physioSub: Subscription | null = null;
  private eventSub: Subscription | null = null;
  private manualScanning = false;
  private onStatusChange: (status: BleConnectionStatus) => void = () => {};
  private onPhysioSample: (sample: PhysioSample) => void = () => {};
  private onBandEvent: (event: BandEvent) => void = () => {};

  setStatusListener(cb: (status: BleConnectionStatus) => void) {
    this.onStatusChange = cb;
  }

  setPhysioListener(cb: (sample: PhysioSample) => void) {
    this.onPhysioSample = cb;
  }

  setEventListener(cb: (event: BandEvent) => void) {
    this.onBandEvent = cb;
  }

  async requestAndroidPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    this.onStatusChange('requesting_permissions');

    if (Platform.Version >= 31) {
      // Android 12+ (API 31+): yeni granular BLE izinleri, konum izni GEREKMEZ.
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return (
        result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
        result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    // Android <12: BLE taraması konum izni gerektirir.
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }

  async waitForPoweredOn(timeoutMs = 5000): Promise<void> {
    const state = await this.plx.state();
    if (state === State.PoweredOn) return;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sub.remove();
        reject(new Error('Bluetooth zaman aşımında PoweredOn durumuna geçmedi'));
      }, timeoutMs);
      const sub = this.plx.onStateChange((s) => {
        if (s === State.PoweredOn) {
          clearTimeout(timeout);
          sub.remove();
          resolve();
        }
      }, true);
    });
  }

  /** Taramayı başlatır, ilk NABIZ-* isimli cihaza bağlanır, GATT'ı keşfeder, notify'lara abone olur. */
  async scanAndConnect(): Promise<void> {
    const hasPerms = await this.requestAndroidPermissions();
    if (!hasPerms) {
      this.onStatusChange('error');
      throw new Error('BLE izinleri verilmedi');
    }
    await this.waitForPoweredOn();

    this.onStatusChange('scanning');
    await new Promise<void>((resolve, reject) => {
      this.plx.startDeviceScan([NABIZ_SERVICE_UUID], null, async (error, scannedDevice) => {
        if (error) {
          this.onStatusChange('error');
          reject(error);
          return;
        }
        if (scannedDevice && scannedDevice.name?.startsWith(NABIZ_DEVICE_NAME_PREFIX)) {
          this.plx.stopDeviceScan();
          try {
            await this.connectToDevice(scannedDevice);
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      });
    });
  }

  /**
   * DeviceScanScreen için — scanAndConnect()'in aksine ilk bulunan NABIZ-* cihaza otomatik
   * bağlanmaz, kullanıcı elle seçip eşleştirebilsin diye her bulunan cihazı callback'e verir.
   * Servis UUID'siyle filtrelemiyoruz (tüm yakındaki BLE cihazları görünür) çünkü kullanıcı
   * "yakındaki cihazları tara" istedi — NABIZ-* önekli olanlar ekranda öne çıkarılır.
   */
  async startScan(onDeviceFound: (device: Device) => void, onError?: (e: Error) => void): Promise<void> {
    if (this.manualScanning) return;
    const hasPerms = await this.requestAndroidPermissions();
    if (!hasPerms) {
      this.onStatusChange('error');
      onError?.(new Error('BLE izinleri verilmedi'));
      return;
    }
    try {
      await this.waitForPoweredOn();
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
      return;
    }

    this.manualScanning = true;
    this.onStatusChange('scanning');
    this.plx.startDeviceScan(null, null, (error, scannedDevice) => {
      if (error) {
        this.manualScanning = false;
        onError?.(error);
        return;
      }
      if (scannedDevice && scannedDevice.name) {
        onDeviceFound(scannedDevice);
      }
    });
  }

  stopScan(): void {
    if (!this.manualScanning) return;
    this.plx.stopDeviceScan();
    this.manualScanning = false;
  }

  /** DeviceScanScreen'de kullanıcı bir cihaza dokununca çağrılır — otomatik scanAndConnect()'in
   * kullandığı aynı bağlanma/GATT-keşif/notify-abonelik akışını paylaşır (tek doğruluk kaynağı). */
  async connectToDeviceManually(device: Device): Promise<void> {
    this.stopScan();
    await this.connectToDevice(device);
  }

  private async connectToDevice(scannedDevice: Device): Promise<void> {
    this.onStatusChange('connecting');
    const connected = await scannedDevice.connect();
    await connected.discoverAllServicesAndCharacteristics();
    this.device = connected;

    this.physioSub = connected.monitorCharacteristicForService(
      NABIZ_SERVICE_UUID,
      CHAR_PHYSIO_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;
        try {
          const sample = decodePhysioPacket(characteristic.value, Date.now());
          this.onPhysioSample(sample);
        } catch {
          // bozuk paket — sessizce atla, bir sonraki batch'i bekle
        }
      },
    );

    this.eventSub = connected.monitorCharacteristicForService(
      NABIZ_SERVICE_UUID,
      CHAR_EVENT_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;
        this.onBandEvent(decodeBandEvent(characteristic.value));
      },
    );

    connected.onDisconnected(() => {
      this.onStatusChange('disconnected');
      this.device = null;
      // Tara-bağlan döngüsü yerine: kısa gecikmeyle tek seferlik yeniden bağlanma denemesi.
      setTimeout(() => {
        this.scanAndConnect().catch(() => this.onStatusChange('error'));
      }, 2000);
    });

    this.onStatusChange('connected');
  }

  async startCalibration(): Promise<void> {
    if (!this.device) throw new Error('Band bağlı değil');
    await this.device.writeCharacteristicWithResponseForService(
      NABIZ_SERVICE_UUID,
      CHAR_CONFIG_UUID,
      encodeStartCalibration(),
    );
  }

  /** Ana ekrandaki uzaktan kademe seçimi butonları için — saati fiilen o kademeye geçirir
   *  (yalnızca yerel/telefon-içi simülasyon değil, gerçek bant SET_TIER komutunu alır). */
  async setTier(tierIndex: number): Promise<void> {
    if (!this.device) throw new Error('Band bağlı değil');
    await this.device.writeCharacteristicWithResponseForService(
      NABIZ_SERVICE_UUID,
      CHAR_CONFIG_UUID,
      encodeSetTier(tierIndex),
    );
  }

  disconnect(): void {
    this.physioSub?.remove();
    this.eventSub?.remove();
    this.device?.cancelConnection();
    this.device = null;
  }

  destroy(): void {
    this.disconnect();
    this.plx.destroy();
  }
}

export const nabizBle = new NabizBleManager();
