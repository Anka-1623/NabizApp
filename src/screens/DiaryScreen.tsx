import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DiaryStore } from '../storage/DiaryStore';
import { Tier, DiaryEntry } from '../types/nabiz';
import { colors, fonts, radius, spacing, shadow } from '../theme';

const TIER_LABEL: Record<Tier, string> = {
  [Tier.NONE]: 'Normal',
  [Tier.T1_AWARENESS]: 'Kademe 1',
  [Tier.T2_FRICTION]: 'Kademe 2',
  [Tier.T3_FULL_INTERVENTION]: 'Kademe 3',
};

const TIER_DOT: Record<Tier, string> = {
  [Tier.NONE]: colors.success,
  [Tier.T1_AWARENESS]: colors.brand400,
  [Tier.T2_FRICTION]: colors.coral,
  [Tier.T3_FULL_INTERVENTION]: colors.danger,
};

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function EntryRow({ item }: { item: DiaryEntry }) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowDot, { backgroundColor: TIER_DOT[item.tier] }]} />
      <View style={styles.rowMain}>
        <Text style={styles.rowTier}>{TIER_LABEL[item.tier]}</Text>
        {item.userLabel && <Text style={styles.rowLabel}>{item.userLabel}</Text>}
      </View>
      <Text style={styles.rowDate}>{formatDate(item.timestampMs)}</Text>
    </View>
  );
}

export default function DiaryScreen() {
  const insets = useSafeAreaInsets();
  const [entries] = useState(() => DiaryStore.getAll());
  const summary = useMemo(() => DiaryStore.getRelapseRiskSummary(7), []);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Son 7 gün</Text>
        <View style={styles.summaryRow}>
          <SummaryStat label="Kademe 1" value={summary[Tier.T1_AWARENESS]} />
          <SummaryStat label="Kademe 2" value={summary[Tier.T2_FRICTION]} />
          <SummaryStat label="Kademe 3" value={summary[Tier.T3_FULL_INTERVENTION]} />
        </View>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <EntryRow item={item} />}
        ListEmptyComponent={<Text style={styles.empty}>Henüz kayıt yok.</Text>}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.md },
  summaryCard: {
    backgroundColor: colors.brand800,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.e2,
  },
  summaryTitle: { fontFamily: fonts.bodyMedium, color: colors.brand200, fontSize: 13 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  stat: { alignItems: 'center' },
  statValue: { fontFamily: fonts.mono, color: colors.accentFg, fontSize: 26 },
  statLabel: { fontFamily: fonts.body, color: colors.brand200, fontSize: 12, marginTop: 4 },
  listContent: { paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  rowDot: { width: 8, height: 8, borderRadius: 4 },
  rowMain: { flex: 1 },
  rowTier: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.ink },
  rowLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.accent, marginTop: 2 },
  rowDate: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkSubtle },
  empty: { fontFamily: fonts.body, textAlign: 'center', color: colors.inkSubtle, marginTop: spacing.xl },
});
