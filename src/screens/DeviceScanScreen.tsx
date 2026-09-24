import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert } from 'react-native';
import type { Device } from 'react-native-ble-plx';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { nabizBle } from '../ble/BleManager';
import { NABIZ_DEVICE_NAME_PREFIX } from '../ble/protocol';
import { colors, fonts, radius, spacing, shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'DeviceScan'>;

// Kullanıcının HomeScreen'deki "Bilek bandı" kartına dokunup elle cihaz seçip eşleştirebilmesi
// için — arka plandaki otomatik scanAndConnect() (BleManager.ts) ilk NABIZ-* cihaza sessizce
// bağlanmayı dener ama görünürlük/manuel kontrol sağlamıyordu, bu ekran onu sağlıyor.
export default function DeviceScanScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const devicesRef = useRef<Map<string, Device>>(new Map());

  const startScan = () => {
    setScanError(null);
    devicesRef.current.clear();
    setDevices([]);
    nabizBle.startScan(
      (device) => {
        devicesRef.current.set(device.id, device);
        setDevices(sortDevices(Array.from(devicesRef.current.values())));
      },
      (error) => setScanError(error.message),
    );
  };

  useEffect(() => {
    startScan();
    return () => nabizBle.stopScan();
  }, []);

  const handleSelect = async (device: Device) => {
    setConnectingId(device.id);
    try {
      await nabizBle.connectToDeviceManually(device);
      navigation.goBack();
    } catch (e) {
      Alert.alert(
        'Eşleştirilemedi',
        e instanceof Error ? e.message : 'Cihaza bağlanılamadı, tekrar deneyin.',
      );
      setConnectingId(null);
      startScan();
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backLink}>← Geri</Text>
        </Pressable>
        <Text style={styles.title}>Bilek bandını eşleştir</Text>
        <Text style={styles.subtitle}>Yakındaki Bluetooth cihazları — DurAn bandı "{NABIZ_DEVICE_NAME_PREFIX}" ile başlar</Text>
      </View>

      {scanError && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{scanError}</Text>
        </View>
      )}

      <View style={styles.scanRow}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.scanText}>Taranıyor…</Text>
        <Pressable style={styles.rescanButton} onPress={startScan}>
          <Text style={styles.rescanButtonText}>Yeniden tara</Text>
        </Pressable>
      </View>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>Henüz cihaz bulunamadı — bandın Bluetooth'u açık ve yakında olduğundan emin ol.</Text>}
        renderItem={({ item }) => {
          const isLikely = item.name?.startsWith(NABIZ_DEVICE_NAME_PREFIX) ?? false;
          const isConnecting = connectingId === item.id;
          return (
            <Pressable
              style={({ pressed }) => [
                styles.row,
                isLikely && styles.rowLikely,
                pressed && styles.rowPressed,
              ]}
              disabled={connectingId !== null}
              onPress={() => handleSelect(item)}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {item.id}
                  {item.rssi != null ? ` · ${item.rssi} dBm` : ''}
                </Text>
              </View>
              {isLikely && !isConnecting && <Text style={styles.rowTag}>DurAn bandı olabilir</Text>}
              {isConnecting && <ActivityIndicator color={colors.accent} />}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function sortDevices(list: Device[]): Device[] {
  return [...list].sort((a, b) => {
    const aLikely = a.name?.startsWith(NABIZ_DEVICE_NAME_PREFIX) ?? false;
    const bLikely = b.name?.startsWith(NABIZ_DEVICE_NAME_PREFIX) ?? false;
    if (aLikely !== bLikely) return aLikely ? -1 : 1;
    return (b.rssi ?? -999) - (a.rssi ?? -999);
  });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  header: { gap: 4, marginBottom: spacing.md },
  backLink: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.accent, marginBottom: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSubtle },

  errorCard: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.coral,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.coral },

  scanRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  scanText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.inkSubtle },
  rescanButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.sm, backgroundColor: colors.surface3 },
  rescanButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.ink },

  listContent: { gap: spacing.sm, paddingBottom: spacing.xl },
  empty: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSubtle, textAlign: 'center', marginTop: spacing.xl },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    ...shadow.e1,
  },
  rowLikely: { borderColor: colors.accent, borderWidth: 1.5 },
  rowPressed: { backgroundColor: colors.surface3 },
  rowMain: { flex: 1, gap: 2 },
  rowName: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.ink },
  rowMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkSubtle },
  rowTag: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.accent },
});
