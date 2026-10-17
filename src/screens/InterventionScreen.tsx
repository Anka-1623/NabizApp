import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useNabizStore } from '../store/useNabizStore';
import { Tier } from '../types/nabiz';
import { colors, fonts, radius, spacing, shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Intervention'>;

// Yeşilay Danışmanlık Merkezi (YEDAM) danışma hattı — eski hatların yerine 115'e taşındı.
const YEDAM_HOTLINE = '115';

function BreathingCircle() {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.4, duration: 4000, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 4000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);
  return (
    <View style={styles.breathingWrap}>
      <Animated.View style={[styles.breathingCircle, { transform: [{ scale }] }]} />
      <Text style={styles.breathingText}>4 saniye nefes al, 4 saniye ver</Text>
    </View>
  );
}

// Kademe 2 için "10 saniye bekle" hafif sürtünme sayacı — agresif engel değil, düşünme payı.
function FrictionCountdown({ onDone }: { onDone: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(10);
  useEffect(() => {
    if (secondsLeft <= 0) {
      onDone();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, onDone]);
  return (
    <View style={styles.countdownWrap}>
      <Text style={styles.countdown}>{secondsLeft}</Text>
    </View>
  );
}

export default function InterventionScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const fusion = useNabizStore((s) => s.fusion);
  const acknowledgeIntervention = useNabizStore((s) => s.acknowledgeIntervention);
  const [frictionDone, setFrictionDone] = useState(false);

  const dismiss = (label?: 'nervous' | 'excited' | 'neutral' | 'craving') => {
    acknowledgeIntervention(label);
    navigation.replace('Home');
  };

  const pad = { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg };

  if (fusion.tier === Tier.T1_AWARENESS) {
    return (
      <View style={[styles.container, styles.containerLight, pad]}>
        <Text style={styles.tierTag}>KADEME 1 · FARKINDALIK</Text>
        <Text style={styles.title}>Şu an gerginlik yaşıyor olabilirsin</Text>
        <Text style={styles.body}>
          Bilek bandın fizyolojik uyarılma tespit etti. Bu her zaman kumarla ilgili olmak zorunda değil
          — sadece kısa bir farkındalık notu.
        </Text>
        <Text style={styles.borderlineQuestion}>Şu an gergin mi hissediyorsun, heyecanlı mı?</Text>
        <View style={styles.labelRow}>
          <Pressable style={styles.labelChip} onPress={() => dismiss('nervous')}>
            <Text style={styles.labelChipText}>Gergin</Text>
          </Pressable>
          <Pressable style={styles.labelChip} onPress={() => dismiss('excited')}>
            <Text style={styles.labelChipText}>Heyecanlı</Text>
          </Pressable>
          <Pressable style={styles.labelChip} onPress={() => dismiss('neutral')}>
            <Text style={styles.labelChipText}>Fark etmedim</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (fusion.tier === Tier.T2_FRICTION) {
    return (
      <View style={[styles.container, styles.containerLight, pad]}>
        <Text style={[styles.tierTag, styles.tierTagWarn]}>KADEME 2 · SÜRTÜNME</Text>
        <Text style={styles.title}>Devam etmeden önce bir an dur</Text>
        <Text style={styles.body}>Bir bahis uygulaması/sitesi açıldı. 10 saniye bekle, sonra devam edebilirsin.</Text>
        {!frictionDone ? (
          <FrictionCountdown onDone={() => setFrictionDone(true)} />
        ) : (
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => dismiss()}>
            <Text style={styles.buttonText}>Anladım, devam ediyorum</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // Tier.T3_FULL_INTERVENTION
  return (
    <View style={[styles.container, styles.containerDark, pad]}>
      <Text style={[styles.tierTag, styles.tierTagCrisis]}>KADEME 3 · TAM MÜDAHALE</Text>
      <Text style={[styles.title, styles.titleDark]}>Bu, gerçek bir kriz anı olabilir</Text>
      <Text style={[styles.body, styles.bodyDark]}>
        Fizyolojik uyarılma ve bahis kullanımı aynı anda tespit edildi. Aşağıdaki adımlar yardımcı
        olabilir.
      </Text>

      <BreathingCircle />

      <View style={styles.copingCard}>
        <Text style={styles.copingTitle}>Başa çıkma kartı</Text>
        <Text style={styles.copingItem}>• Şu an ihtiyacın olan şey bu bahis değil, birkaç dakikalık bekleme.</Text>
        <Text style={styles.copingItem}>• Daha önce bu isteği atlattığın bir anı hatırla.</Text>
        <Text style={styles.copingItem}>• Telefonu bırak, 5 dakika farklı bir odaya geç.</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.hotlineButton, pressed && styles.hotlineButtonPressed]}
        onPress={() => Linking.openURL(`tel:${YEDAM_HOTLINE.replace(/\s/g, '')}`)}>
        <Text style={styles.hotlineButtonText}>Güvenilir kişiyi/YEDAM'ı ara ({YEDAM_HOTLINE})</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.secondaryButtonDark, pressed && styles.secondaryButtonDarkPressed]}
        onPress={() => dismiss('craving')}>
        <Text style={styles.secondaryButtonDarkText}>Geçti, günlüğe kaydet</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.md, justifyContent: 'center' },
  containerLight: { backgroundColor: colors.surface },
  containerDark: { backgroundColor: colors.brand800 },

  tierTag: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5, color: colors.accent },
  tierTagWarn: { color: colors.coral },
  tierTagCrisis: { color: colors.coral },

  title: { fontFamily: fonts.display, fontSize: 24, color: colors.ink, marginTop: 4 },
  titleDark: { color: colors.accentFg },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.inkMuted },
  bodyDark: { color: colors.brand200 },

  borderlineQuestion: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.inkSubtle, marginTop: spacing.sm },
  labelRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  labelChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.surface2,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
  },
  labelChipText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.ink },

  countdownWrap: { alignItems: 'center', marginVertical: spacing.sm },
  countdown: { fontFamily: fonts.display, fontSize: 56, color: colors.coral },

  breathingWrap: { alignItems: 'center', gap: spacing.md, marginVertical: spacing.md },
  breathingCircle: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.brand400 },
  breathingText: { fontFamily: fonts.body, fontSize: 13, color: colors.brand200 },

  copingCard: {
    backgroundColor: colors.brand600,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
  },
  copingTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.accentFg, marginBottom: 4 },
  copingItem: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.brand100 },

  button: { backgroundColor: colors.accent, paddingVertical: 16, borderRadius: radius.md, alignItems: 'center' },
  buttonPressed: { backgroundColor: colors.accentHover },
  buttonText: { fontFamily: fonts.bodySemiBold, color: colors.accentFg, fontSize: 15, textAlign: 'center' },

  hotlineButton: {
    backgroundColor: colors.coral,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    ...shadow.e2,
  },
  hotlineButtonPressed: { opacity: 0.85 },
  hotlineButtonText: { fontFamily: fonts.bodySemiBold, color: colors.ink, fontSize: 15, textAlign: 'center' },

  secondaryButtonDark: {
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.brand400,
  },
  secondaryButtonDarkPressed: { backgroundColor: colors.brand600 },
  secondaryButtonDarkText: { fontFamily: fonts.bodySemiBold, color: colors.brand200, fontSize: 15 },
});
