import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useNabizStore } from '../store/useNabizStore';
import { colors, fonts, radius, spacing, shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

// KVKK Açık Rıza Onam Formu'nun uygulama-içi özeti — tam form Ekler'de kağıt üzerinde imzalanır
// (şartname madde 3.4). Burada sadece dijital onay adımı var, hukuki formun yerine geçmez.
export default function OnboardingConsentScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const giveConsent = useNabizStore((s) => s.giveConsent);
  const [physioConsent, setPhysioConsent] = useState(false);
  const [behavioralConsent, setBehavioralConsent] = useState(false);

  const canContinue = physioConsent && behavioralConsent;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
      <Text style={styles.eyebrow}>STRATOS · TEKNOFEST 2026</Text>
      <Text style={styles.title}>NABIZ + KUMARKALKANI</Text>
      <Text style={styles.subtitle}>Kuruluma başlamadan önce</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Bu uygulama ne yapar?</Text>
        <Text style={styles.body}>
          Bilek bandınızdan gelen fizyolojik sinyalleri (nabız değişkenliği, deri iletkenliği) ve
          telefonunuzdaki bahis/kumar uygulaması kullanımını yerel olarak birleştirir. İkisi aynı anda
          yükseldiğinde size erken bir müdahale önerisi sunar. Tüm işlem cihaz üzerinde yapılır, ham
          veri sunucuya gönderilmez.
        </Text>
      </View>

      <Pressable style={styles.consentRow} onPress={() => setPhysioConsent((v) => !v)}>
        <Switch
          value={physioConsent}
          onValueChange={setPhysioConsent}
          trackColor={{ false: colors.surface3, true: colors.accent }}
          thumbColor={colors.white}
        />
        <Text style={styles.consentText}>
          Bilek bandımın fizyolojik verilerini (nabız, deri iletkenliği, sıcaklık, ivme) bu cihazda
          işlenmesine onay veriyorum.
        </Text>
      </Pressable>

      <Pressable style={styles.consentRow} onPress={() => setBehavioralConsent((v) => !v)}>
        <Switch
          value={behavioralConsent}
          onValueChange={setBehavioralConsent}
          trackColor={{ false: colors.surface3, true: colors.accent }}
          thumbColor={colors.white}
        />
        <Text style={styles.consentText}>
          Uygulama kullanım örüntümün (hangi bahis uygulaması ne sıklıkla açılıyor) bu cihazda
          erişilebilirlik izniyle tespit edilmesine onay veriyorum.
        </Text>
      </Pressable>

      <Text style={styles.disclaimer}>
        Bu dijital onay, KVKK Açık Rıza Onam Formu'nun kağıt üzerindeki imzasının yerine geçmez —
        ekip/veli onam süreci ayrıca yürütülür.
      </Text>

      <Pressable
        disabled={!canContinue}
        style={({ pressed }) => [
          styles.button,
          !canContinue && styles.buttonDisabled,
          pressed && canContinue && styles.buttonPressed,
        ]}
        onPress={() => {
          giveConsent();
          navigation.replace('Home');
        }}>
        <Text style={styles.buttonText}>Devam et</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  container: { paddingHorizontal: spacing.lg, gap: spacing.md },
  eyebrow: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5, color: colors.accent },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, marginTop: 2 },
  subtitle: { fontFamily: fonts.body, fontSize: 15, color: colors.inkSubtle, marginBottom: spacing.xs },
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    ...shadow.e1,
  },
  cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.ink, marginBottom: 8 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.inkMuted },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  consentText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.ink },
  disclaimer: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSubtle, fontStyle: 'italic', lineHeight: 17 },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  buttonPressed: { backgroundColor: colors.accentHover },
  buttonDisabled: { backgroundColor: colors.surface3 },
  buttonText: { fontFamily: fonts.bodySemiBold, color: colors.accentFg, fontSize: 16 },
});
