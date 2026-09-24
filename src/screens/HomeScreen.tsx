import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useNabizStore } from '../store/useNabizStore';
import { accessibilityBridge } from '../native/AccessibilityBridge';
import { Tier } from '../types/nabiz';
import { colors, fonts, radius, spacing, shadow } from '../theme';
import * as Simulator from '../dev/Simulator';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const BLE_STATUS_LABEL: Record<string, string> = {
  idle: 'Bekleniyor',
  requesting_permissions: 'İzinler isteniyor…',
  scanning: 'Band aranıyor…',
  connecting: 'Bağlanıyor…',
  connected: 'Bağlı',
  disconnected: 'Bağlantı koptu, yeniden deneniyor…',
  error: 'Bağlantı hatası',
};

const TIER_LABEL: Record<Tier, string> = {
  [Tier.NONE]: 'Normal',
  [Tier.T1_AWARENESS]: 'Kademe 1 — Farkındalık',
  [Tier.T2_FRICTION]: 'Kademe 2 — Sürtünme',
  [Tier.T3_FULL_INTERVENTION]: 'Kademe 3 — Tam Müdahale',
};

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const bleStatus = useNabizStore((s) => s.bleStatus);
  const bandLowBattery = useNabizStore((s) => s.bandLowBattery);
  const accessibilityEnabled = useNabizStore((s) => s.accessibilityEnabled);
  const fusion = useNabizStore((s) => s.fusion);
  const start = useNabizStore((s) => s.start);
  const refreshAccessibilityStatus = useNabizStore((s) => s.refreshAccessibilityStatus);
  const requestCalibration = useNabizStore((s) => s.requestCalibration);
  const [calibrating, setCalibrating] = useState(false);

  const bandConnected = bleStatus === 'connected';

  const handleCalibrate = async () => {
    setCalibrating(true);
    try {
      await requestCalibration();
    } catch (e) {
      Alert.alert(
        'Kalibrasyon başlatılamadı',
        e instanceof Error ? e.message : 'Bilek bandıyla iletişim kurulamadı. Bağlantıyı kontrol edip tekrar deneyin.',
      );
    } finally {
      setCalibrating(false);
    }
  };

  useEffect(() => {
    start();
  }, [start]);

  useEffect(() => {
    if (fusion.tier !== Tier.NONE) {
      navigation.navigate('Intervention');
    }
  }, [fusion.tier, navigation]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>STRATOS · TEKNOFEST 2026</Text>
        <Text style={styles.title}>NABIZ</Text>
        <Text style={styles.subtitle}>Kumarkalkanı erken uyarı sistemi</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.statusCard, pressed && styles.statusCardPressed]}
        onPress={() => navigation.navigate('DeviceScan')}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Bilek bandı</Text>
          <View style={[styles.dot, bandConnected ? styles.dotOk : styles.dotWarn]} />
        </View>
        <Text style={[styles.statusValue, bandConnected ? styles.ok : styles.warn]}>
          {BLE_STATUS_LABEL[bleStatus] ?? bleStatus}
        </Text>
        {!bandConnected && (
          <Text style={styles.hintText}>
            Bandı bileğinize takıp Bluetooth'un açık olduğundan emin olun — otomatik aranıyor.
          </Text>
        )}
        {bandConnected && bandLowBattery && (
          <Text style={styles.hintTextWarn}>Bandın pili azalıyor — yakında şarj edin.</Text>
        )}
        <Text style={styles.linkButtonText}>Bluetooth cihazlarını tara / elle eşleştir →</Text>
      </Pressable>

      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Davranış tespiti</Text>
          <View style={[styles.dot, accessibilityEnabled ? styles.dotOk : styles.dotWarn]} />
        </View>
        <Text style={[styles.statusValue, accessibilityEnabled ? styles.ok : styles.warn]}>
          {accessibilityEnabled ? 'Aktif' : 'Kapalı'}
        </Text>
        {!accessibilityEnabled && (
          <Pressable
            style={styles.linkButton}
            onPress={() => {
              accessibilityBridge.openSettings();
              setTimeout(refreshAccessibilityStatus, 1500);
            }}>
            <Text style={styles.linkButtonText}>Erişilebilirlik ayarlarını aç →</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.tierCard}>
        <Text style={styles.tierLabel}>Güncel durum</Text>
        <Text style={styles.tierValue}>{TIER_LABEL[fusion.tier]}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{fusion.physio.hrBpm ?? '—'} bpm</Text>
          <Text style={styles.metaDivider}>·</Text>
          <Text style={styles.metaText}>z(IBI) {fusion.physio.zScoreIbi.toFixed(2)}</Text>
          <Text style={styles.metaDivider}>·</Text>
          <Text style={styles.metaText}>z(GSR) {fusion.physio.zScoreGsr.toFixed(2)}</Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.button,
          (!bandConnected || calibrating) && styles.buttonDisabled,
          pressed && bandConnected && !calibrating && styles.buttonPressed,
        ]}
        disabled={!bandConnected || calibrating}
        onPress={handleCalibrate}>
        <Text style={styles.buttonText}>
          {calibrating ? 'Kalibrasyon başlatılıyor…' : 'Kalibrasyonu yeniden başlat'}
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
        onPress={() => navigation.navigate('Diary')}>
        <Text style={styles.secondaryButtonText}>Günlük ve nüks-risk paneli</Text>
      </Pressable>

      {__DEV__ && (
        <View style={styles.devPanel}>
          <Text style={styles.devPanelTitle}>Geliştirme modu — bant bağlı değilken simülasyon</Text>
          <View style={styles.devButtonRow}>
            <Pressable style={styles.devButton} onPress={Simulator.simulateCalm}>
              <Text style={styles.devButtonText}>Sakin</Text>
            </Pressable>
            <Pressable style={styles.devButton} onPress={Simulator.simulateArousalOnly}>
              <Text style={styles.devButtonText}>Kademe 1</Text>
            </Pressable>
            <Pressable style={styles.devButton} onPress={Simulator.simulateBehavioralOnly}>
              <Text style={styles.devButtonText}>Kademe 2</Text>
            </Pressable>
            <Pressable style={styles.devButton} onPress={Simulator.simulateFullCrisis}>
              <Text style={styles.devButtonText}>Kademe 3</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  container: { paddingHorizontal: spacing.lg, gap: spacing.md },
  header: { marginBottom: spacing.xs, gap: 2 },
  eyebrow: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5, color: colors.accent },
  title: { fontFamily: fonts.display, fontSize: 34, color: colors.ink, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSubtle },

  statusCard: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    ...shadow.e1,
  },
  statusCardPressed: { backgroundColor: colors.surface3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.inkSubtle },
  statusValue: { fontFamily: fonts.displayMedium, fontSize: 18, marginTop: 4 },
  hintText: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSubtle, marginTop: 6, lineHeight: 17 },
  hintTextWarn: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.coral, marginTop: 6, lineHeight: 17 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOk: { backgroundColor: colors.success },
  dotWarn: { backgroundColor: colors.coral },
  ok: { color: colors.success },
  warn: { color: colors.coral },
  linkButton: { marginTop: 10 },
  linkButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.accent },

  tierCard: {
    backgroundColor: colors.brand800,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.e2,
  },
  tierLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.brand200 },
  tierValue: { fontFamily: fonts.display, fontSize: 20, color: colors.accentFg, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, flexWrap: 'wrap' },
  metaText: { fontFamily: fonts.mono, fontSize: 12, color: colors.brand200 },
  metaDivider: { fontSize: 12, color: colors.brand600, marginHorizontal: 6 },

  button: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  buttonPressed: { backgroundColor: colors.accentHover },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontFamily: fonts.bodySemiBold, color: colors.accentFg, fontSize: 16 },

  secondaryButton: {
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  secondaryButtonPressed: { backgroundColor: colors.accentSoft },
  secondaryButtonText: { fontFamily: fonts.bodySemiBold, color: colors.accent, fontSize: 16 },

  devPanel: {
    borderWidth: 1,
    borderColor: colors.coral,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  devPanelTitle: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.coral },
  devButtonRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  devButton: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.surface3, borderRadius: radius.sm },
  devButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.ink },
});
