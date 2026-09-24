import { Buffer } from 'buffer';
import type { PhysioSample } from '../types/nabiz';

// NABIZ bilek bandı özel BLE GATT servis/karakteristik UUID'leri.
// Bu proje için burada TANIMLANIYOR (hibrit rapor Bölüm 9 sadece isim veriyordu: CHAR_PHYSIO/CHAR_EVENT/CHAR_CONFIG,
// gerçek UUID yoktu) — firmware tarafı da (NimBLE-Arduino) AYNI UUID'leri kullanmalı, bkz. NABIZ_BLE_PROTOCOL.md.
export const NABIZ_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const CHAR_PHYSIO_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Notify, band -> telefon
export const CHAR_EVENT_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Notify, band -> telefon
export const CHAR_CONFIG_UUID = '6e400004-b5a3-f393-e0a9-e50e24dcca9e'; // Write, telefon -> band

export const NABIZ_DEVICE_NAME_PREFIX = 'NABIZ-';

// CHAR_EVENT tek-bayt olay kodları (band -> telefon).
export enum BandEventCode {
  MANUAL_BUTTON_LABEL = 0x01, // kalibrasyon/etiketleme butonu basıldı
  CALIBRATION_STARTED = 0x02,
  CALIBRATION_COMPLETE = 0x03,
  LOW_BATTERY = 0x04,
}

// CHAR_CONFIG tek-bayt komut kodları (telefon -> band).
export enum ConfigCommand {
  START_CALIBRATION = 0x01,
  SET_SAMPLE_INTERVAL_MS = 0x02, // + 2 bayt little-endian interval
  SET_TIER = 0x03, // + 1 bayt: Tier index (0=Normal/1/2/3) — uzaktan kademe seçimi
}

/**
 * PhysioPacket wire format — 9 bayt, little-endian, firmware'in aggregate() çıktısı:
 *   [0-1]  avgIbiMs   uint16  — batch içindeki ortalama nabız-arası aralık (ms)
 *   [2-3]  gsrRaw     uint16  — ham ADC okuması (0-4095, D0/GPIO1)
 *   [4-5]  tempCentiC int16   — sıcaklık * 100 (DS18B20)
 *   [6-7]  accelMagMg uint16  — ivme büyüklüğü, milli-g (MPU6050)
 *   [8]    sampleCount uint8  — bu batch'te aggregate edilen ham örnek sayısı
 */
export function decodePhysioPacket(base64Value: string, timestampMs: number): PhysioSample {
  const buf = Buffer.from(base64Value, 'base64');
  if (buf.length < 9) {
    throw new Error(`PhysioPacket beklenenden kısa: ${buf.length} bayt (9 bekleniyor)`);
  }
  return {
    timestampMs,
    ibiMs: buf.readUInt16LE(0),
    gsrRaw: buf.readUInt16LE(2),
    tempC: buf.readInt16LE(4) / 100,
    accelMagMilliG: buf.readUInt16LE(6),
    sampleCount: buf.readUInt8(8),
  };
}

export interface BandEvent {
  code: BandEventCode;
  // Yalnızca MANUAL_BUTTON_LABEL'de dolu — 0=Gergin/1=Heyecanlı/2=Fark etmedim.
  label?: number;
}

export function decodeBandEvent(base64Value: string): BandEvent {
  const buf = Buffer.from(base64Value, 'base64');
  const code = buf.readUInt8(0) as BandEventCode;
  if (code === BandEventCode.MANUAL_BUTTON_LABEL && buf.length >= 2) {
    return { code, label: buf.readUInt8(1) };
  }
  return { code };
}

export function encodeStartCalibration(): string {
  return Buffer.from([ConfigCommand.START_CALIBRATION]).toString('base64');
}

export function encodeSampleInterval(intervalMs: number): string {
  const buf = Buffer.alloc(3);
  buf.writeUInt8(ConfigCommand.SET_SAMPLE_INTERVAL_MS, 0);
  buf.writeUInt16LE(intervalMs, 1);
  return buf.toString('base64');
}

export function encodeSetTier(tierIndex: number): string {
  return Buffer.from([ConfigCommand.SET_TIER, tierIndex]).toString('base64');
}
