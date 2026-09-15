/**
 * NABIZ + KUMARKALKANI — TEKNOFEST 2026 prototip uygulaması
 * @format
 */

import { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { DiaryStore } from './src/storage/DiaryStore';
import { colors } from './src/theme';

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.surface },
});

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  // DiaryStore'un MMKV anahtarı Keychain'den async geliyor (bkz. src/storage/secureKey.ts) —
  // navigator'ı bu tamamlanmadan render etmiyoruz ki DiaryScreen/useNabizStore hiç senkron
  // DiaryStore çağrısı init'ten önce yapmasın.
  const [diaryReady, setDiaryReady] = useState(false);

  useEffect(() => {
    DiaryStore.init().finally(() => setDiaryReady(true));
  }, []);

  if (!diaryReady) {
    return <View style={styles.splash} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

export default App;
